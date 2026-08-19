import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PayableStatus,
  ReconciliationStatus,
  ReconciliationType,
} from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { assertBranchScope } from '../../common/auth/data-scope.util';
import { toCursorPage } from '../../common/pagination/paginate';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAccountsPayableFromStatementDto,
  RecordPaymentDto,
} from './dto/invoice.dto';

const ENTITY_TYPE = 'AccountsPayable';

@Injectable()
export class AccountsPayableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Chỉ tạo được từ 1 ReconciliationStatement CARRIER đã LOCKED — G3 không phát
   * hành hóa đơn ở chiều này, chỉ ghi nhận công nợ phải trả (data-model.md mục 1). */
  async createFromStatement(
    user: AuthenticatedUser,
    statementId: string,
    dto: CreateAccountsPayableFromStatementDto,
  ) {
    const statement = await this.prisma.reconciliationStatement.findUnique({
      where: { id: statementId },
      include: { accountsPayable: true },
    });
    if (!statement) throw new NotFoundException('Không tìm thấy bảng đối soát');
    assertBranchScope(user, statement.branchId);
    if (statement.type !== ReconciliationType.CARRIER || !statement.carrierId) {
      throw new BadRequestException(
        'Chỉ bảng đối soát nhà vận tải mới tạo được công nợ phải trả',
      );
    }
    if (statement.status !== ReconciliationStatus.LOCKED) {
      throw new BadRequestException(
        'Chỉ bảng đối soát đã khóa mới tạo được công nợ',
      );
    }
    if (statement.accountsPayable) {
      throw new BadRequestException('Bảng đối soát này đã có công nợ phải trả');
    }

    return this.prisma.$transaction(async (tx) => {
      const payable = await tx.accountsPayable.create({
        data: {
          branchId: statement.branchId,
          carrierId: statement.carrierId!,
          reconciliationStatementId: statement.id,
          amount: statement.totalAmount,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: payable.id,
          action: 'CREATE',
          actorUserId: user.userId,
          afterState: payable,
        },
        tx,
      );
      return payable;
    });
  }

  async findMany(
    user: AuthenticatedUser,
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await this.prisma.accountsPayable.findMany({
      where: { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return toCursorPage(rows, limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const payable = await this.prisma.accountsPayable.findUnique({
      where: { id },
      include: {
        payments: true,
        carrier: true,
        reconciliationStatement: { include: { lines: true } },
      },
    });
    if (!payable)
      throw new NotFoundException('Không tìm thấy công nợ phải trả');
    assertBranchScope(user, payable.branchId);
    return payable;
  }

  async recordPayment(
    user: AuthenticatedUser,
    id: string,
    dto: RecordPaymentDto,
  ) {
    const payable = await this.prisma.accountsPayable.findUnique({
      where: { id },
    });
    if (!payable)
      throw new NotFoundException('Không tìm thấy công nợ phải trả');
    assertBranchScope(user, payable.branchId);
    if (payable.status === PayableStatus.PAID) {
      throw new BadRequestException('Công nợ này đã thanh toán đủ');
    }
    const newPaid = payable.paidAmount.plus(dto.amount);
    if (newPaid.greaterThan(payable.amount)) {
      throw new BadRequestException(
        'Số tiền thanh toán vượt quá công nợ còn lại',
      );
    }
    const newStatus = newPaid.equals(payable.amount)
      ? PayableStatus.PAID
      : PayableStatus.PARTIALLY_PAID;

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payablePayment.create({
        data: {
          accountsPayableId: id,
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          recordedByUserId: user.userId,
        },
      });
      const after = await tx.accountsPayable.update({
        where: { id },
        data: { paidAmount: newPaid, status: newStatus },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
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
      return after;
    });
  }
}
