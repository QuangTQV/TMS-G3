import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  InvoiceStatus,
  Prisma,
  ReceivableStatus,
  ReconciliationStatus,
  ReconciliationType,
} from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { assertBranchScope } from '../../common/auth/data-scope.util';
import { toCursorPage } from '../../common/pagination/paginate';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateInvoiceFromStatementDto,
  RecordPaymentDto,
} from './dto/invoice.dto';

const ENTITY_TYPE = 'Invoice';

const NON_VOIDABLE: InvoiceStatus[] = [
  InvoiceStatus.PAID,
  InvoiceStatus.VOIDED,
  InvoiceStatus.REPLACED,
];

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private generateCode(): string {
    return `INV-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
  }

  /** Chỉ tạo được từ 1 ReconciliationStatement CUSTOMER đã LOCKED, mỗi bảng chỉ 1
   * hóa đơn (1-1 qua reconciliationStatementId unique). total luôn tính lại bằng
   * code, không tin số client gửi (ràng buộc 3, CLAUDE.md; data-model.md mục 4). */
  async createFromStatement(
    user: AuthenticatedUser,
    statementId: string,
    dto: CreateInvoiceFromStatementDto,
  ) {
    const statement = await this.prisma.reconciliationStatement.findUnique({
      where: { id: statementId },
      include: { invoice: true },
    });
    if (!statement) throw new NotFoundException('Không tìm thấy bảng đối soát');
    assertBranchScope(user, statement.branchId);
    if (
      statement.type !== ReconciliationType.CUSTOMER ||
      !statement.customerId
    ) {
      throw new BadRequestException(
        'Chỉ bảng đối soát khách hàng mới phát hành hóa đơn',
      );
    }
    if (statement.status !== ReconciliationStatus.LOCKED) {
      throw new BadRequestException(
        'Chỉ bảng đối soát đã khóa mới phát hành được hóa đơn',
      );
    }
    if (statement.invoice) {
      throw new BadRequestException('Bảng đối soát này đã có hóa đơn');
    }

    const subtotal = statement.totalAmount;
    const vatAmount = new Prisma.Decimal(dto.vatAmount);
    const total = subtotal.plus(vatAmount);

    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          branchId: statement.branchId,
          customerId: statement.customerId!,
          reconciliationStatementId: statement.id,
          code: this.generateCode(),
          subtotal,
          vatAmount,
          total,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          createdByUserId: user.userId,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: invoice.id,
          action: 'CREATE',
          actorUserId: user.userId,
          afterState: invoice,
        },
        tx,
      );
      return invoice;
    });
  }

  async findMany(
    user: AuthenticatedUser,
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await this.prisma.invoice.findMany({
      where: { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return toCursorPage(rows, limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        accountsReceivable: { include: { payments: true } },
        customer: true,
        reconciliationStatement: { include: { lines: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Không tìm thấy hóa đơn');
    assertBranchScope(user, invoice.branchId);
    return invoice;
  }

  async submitForApproval(user: AuthenticatedUser, id: string) {
    return this.transition(
      user,
      id,
      InvoiceStatus.DRAFT,
      InvoiceStatus.PENDING_APPROVAL,
      'SUBMIT',
    );
  }

  /**
   * Phát hành hóa đơn. Tích hợp VNPT thật CHƯA làm (nhà cung cấp/định dạng chưa
   * chốt — docs/open-questions.md) — không giả định tích hợp luôn khả dụng (ràng
   * buộc 7, CLAUDE.md): đánh dấu `eInvoiceStatus = PENDING_INTEGRATION` thay vì
   * chặn luồng nghiệp vụ chính. Sinh AccountsReceivable ngay khi phát hành nội bộ.
   */
  async issue(user: AuthenticatedUser, id: string) {
    const before = await this.prisma.invoice.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy hóa đơn');
    assertBranchScope(user, before.branchId);
    if (before.status !== InvoiceStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Chỉ hóa đơn chờ duyệt mới có thể phát hành',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.invoice.update({
        where: { id },
        data: {
          status: InvoiceStatus.ISSUED,
          issuedAt: new Date(),
          eInvoiceStatus: 'PENDING_INTEGRATION',
        },
      });
      const receivable = await tx.accountsReceivable.create({
        data: {
          branchId: before.branchId,
          customerId: before.customerId,
          invoiceId: before.id,
          amount: before.total,
          dueDate: before.dueDate,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
          action: 'ISSUE',
          actorUserId: user.userId,
          beforeState: { status: before.status },
          afterState: {
            status: after.status,
            accountsReceivableId: receivable.id,
          },
        },
        tx,
      );
      return after;
    });
  }

  async voidInvoice(user: AuthenticatedUser, id: string, reason: string) {
    const before = await this.prisma.invoice.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy hóa đơn');
    assertBranchScope(user, before.branchId);
    if (NON_VOIDABLE.includes(before.status)) {
      throw new BadRequestException(
        `Không thể hủy hóa đơn ở trạng thái ${before.status}`,
      );
    }
    return this.transition(
      user,
      id,
      before.status,
      InvoiceStatus.VOIDED,
      'VOID',
      reason,
      {
        voidReason: reason,
      },
    );
  }

  async markDisputed(user: AuthenticatedUser, id: string, reason: string) {
    const before = await this.prisma.invoice.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy hóa đơn');
    assertBranchScope(user, before.branchId);
    const disputable: InvoiceStatus[] = [
      InvoiceStatus.ISSUED,
      InvoiceStatus.PARTIALLY_PAID,
    ];
    if (!disputable.includes(before.status)) {
      throw new BadRequestException(
        'Chỉ hóa đơn đã phát hành mới có thể đánh dấu tranh chấp',
      );
    }
    return this.transition(
      user,
      id,
      before.status,
      InvoiceStatus.DISPUTED,
      'MARK_DISPUTED',
      reason,
      { disputeReason: reason },
    );
  }

  /** Ghi nhận thanh toán — cập nhật AccountsReceivable và phản ánh ngược lên
   * Invoice.status (PartiallyPaid/Paid) theo state machine data-model.md mục 3. */
  async recordPayment(
    user: AuthenticatedUser,
    invoiceId: string,
    dto: RecordPaymentDto,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { accountsReceivable: true },
    });
    if (!invoice || !invoice.accountsReceivable) {
      throw new NotFoundException(
        'Không tìm thấy công nợ phải thu của hóa đơn này',
      );
    }
    assertBranchScope(user, invoice.branchId);
    const receivable = invoice.accountsReceivable;
    if (receivable.status === ReceivableStatus.PAID) {
      throw new BadRequestException('Hóa đơn này đã thanh toán đủ');
    }
    const newPaid = receivable.paidAmount.plus(dto.amount);
    if (newPaid.greaterThan(receivable.amount)) {
      throw new BadRequestException(
        'Số tiền thanh toán vượt quá công nợ còn lại',
      );
    }
    const newReceivableStatus = newPaid.equals(receivable.amount)
      ? ReceivableStatus.PAID
      : ReceivableStatus.PARTIALLY_PAID;
    const newInvoiceStatus =
      newReceivableStatus === ReceivableStatus.PAID
        ? InvoiceStatus.PAID
        : InvoiceStatus.PARTIALLY_PAID;

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.receivablePayment.create({
        data: {
          accountsReceivableId: receivable.id,
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          recordedByUserId: user.userId,
        },
      });
      await tx.accountsReceivable.update({
        where: { id: receivable.id },
        data: { paidAmount: newPaid, status: newReceivableStatus },
      });
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: newInvoiceStatus },
      });
      await this.auditLog.record(
        {
          entityType: 'AccountsReceivable',
          entityId: receivable.id,
          action: 'RECORD_PAYMENT',
          actorUserId: user.userId,
          afterState: {
            paymentId: payment.id,
            amount: dto.amount,
            paidAmount: newPaid,
          },
        },
        tx,
      );
      return updatedInvoice;
    });
  }

  private async transition(
    user: AuthenticatedUser,
    id: string,
    from: InvoiceStatus,
    to: InvoiceStatus,
    action: string,
    reason?: string,
    extra: Prisma.InvoiceUpdateInput = {},
  ) {
    const before = await this.prisma.invoice.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy hóa đơn');
    assertBranchScope(user, before.branchId);
    if (before.status !== from) {
      throw new BadRequestException(`Hóa đơn phải ở trạng thái ${from}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.invoice.update({
        where: { id },
        data: { status: to, ...extra },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
          action,
          actorUserId: user.userId,
          reason,
          beforeState: { status: before.status },
          afterState: { status: after.status },
        },
        tx,
      );
      return after;
    });
  }
}
