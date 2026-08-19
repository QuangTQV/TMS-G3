import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Prisma,
  ReconciliationStatus,
  ReconciliationType,
} from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { assertBranchScope } from '../../common/auth/data-scope.util';
import { toCursorPage } from '../../common/pagination/paginate';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AddReconciliationLineDto,
  CreateReconciliationStatementDto,
} from './dto/reconciliation.dto';

const ENTITY_TYPE = 'ReconciliationStatement';

// Trạng thái còn cho phép thêm/xóa dòng — REOPENED coi như "mở lại để sửa", vẫn
// chỉnh được cho tới khi confirm lại (docs/data-model.md mục 3).
const EDITABLE_STATUSES: ReconciliationStatus[] = [
  ReconciliationStatus.DRAFT,
  ReconciliationStatus.REOPENED,
];

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private generateCode(): string {
    return `RC-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
  }

  async create(user: AuthenticatedUser, dto: CreateReconciliationStatementDto) {
    if (dto.type === ReconciliationType.CUSTOMER) {
      if (!dto.customerId) {
        throw new BadRequestException('Đối soát khách hàng cần customerId');
      }
      const customer = await this.prisma.customer.findUnique({
        where: { id: dto.customerId },
      });
      if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
      assertBranchScope(user, customer.branchId);
    } else {
      if (!dto.carrierId) {
        throw new BadRequestException('Đối soát nhà vận tải cần carrierId');
      }
      const carrier = await this.prisma.carrier.findUnique({
        where: { id: dto.carrierId },
      });
      if (!carrier) throw new NotFoundException('Không tìm thấy nhà vận tải');
      assertBranchScope(user, carrier.branchId);
    }

    return this.prisma.$transaction(async (tx) => {
      const statement = await tx.reconciliationStatement.create({
        data: {
          branchId: user.branchId,
          code: this.generateCode(),
          type: dto.type,
          customerId:
            dto.type === ReconciliationType.CUSTOMER
              ? dto.customerId
              : undefined,
          carrierId:
            dto.type === ReconciliationType.CARRIER ? dto.carrierId : undefined,
          periodFrom: new Date(dto.periodFrom),
          periodTo: new Date(dto.periodTo),
          createdByUserId: user.userId,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: statement.id,
          action: 'CREATE',
          actorUserId: user.userId,
          afterState: statement,
        },
        tx,
      );
      return statement;
    });
  }

  async findMany(
    user: AuthenticatedUser,
    cursor: string | undefined,
    limit: number,
    type?: ReconciliationType,
  ) {
    const rows = await this.prisma.reconciliationStatement.findMany({
      where: { branchId: user.branchId, ...(type ? { type } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return toCursorPage(rows, limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const statement = await this.prisma.reconciliationStatement.findUnique({
      where: { id },
      include: {
        lines: {
          orderBy: { createdAt: 'asc' },
          include: { shipmentOrder: true, trip: true },
        },
        invoice: true,
        accountsPayable: true,
        customer: true,
        carrier: true,
      },
    });
    if (!statement) throw new NotFoundException('Không tìm thấy bảng đối soát');
    assertBranchScope(user, statement.branchId);
    return statement;
  }

  async addLine(
    user: AuthenticatedUser,
    statementId: string,
    dto: AddReconciliationLineDto,
  ) {
    const statement = await this.getEditable(user, statementId);

    if (statement.type === ReconciliationType.CUSTOMER) {
      if (!dto.shipmentOrderId) {
        throw new BadRequestException(
          'Dòng đối soát khách hàng cần tham chiếu shipmentOrderId',
        );
      }
      const order = await this.prisma.shipmentOrder.findUnique({
        where: { id: dto.shipmentOrderId },
      });
      if (!order || order.customerId !== statement.customerId) {
        throw new BadRequestException(
          'Đơn không thuộc khách hàng của bảng đối soát này',
        );
      }
    } else {
      if (!dto.tripId) {
        throw new BadRequestException(
          'Dòng đối soát nhà vận tải cần tham chiếu tripId',
        );
      }
      const trip = await this.prisma.trip.findUnique({
        where: { id: dto.tripId },
      });
      if (!trip || trip.carrierId !== statement.carrierId) {
        throw new BadRequestException(
          'Chuyến không thuộc nhà vận tải của bảng đối soát này',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const line = await tx.reconciliationLine.create({
        data: {
          statementId: statement.id,
          shipmentOrderId: dto.shipmentOrderId,
          tripId: dto.tripId,
          description: dto.description,
          amount: dto.amount,
          createdByUserId: user.userId,
        },
      });
      const after = await this.recalculateTotal(tx, statement.id);
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: statement.id,
          action: 'ADD_LINE',
          actorUserId: user.userId,
          afterState: {
            lineId: line.id,
            amount: line.amount,
            totalAmount: after.totalAmount,
          },
        },
        tx,
      );
      return line;
    });
  }

  async removeLine(
    user: AuthenticatedUser,
    statementId: string,
    lineId: string,
  ) {
    const statement = await this.getEditable(user, statementId);
    const line = await this.prisma.reconciliationLine.findUnique({
      where: { id: lineId },
    });
    if (!line || line.statementId !== statement.id) {
      throw new NotFoundException('Không tìm thấy dòng đối soát');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.reconciliationLine.delete({ where: { id: lineId } });
      const after = await this.recalculateTotal(tx, statement.id);
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: statement.id,
          action: 'REMOVE_LINE',
          actorUserId: user.userId,
          beforeState: { lineId, amount: line.amount },
          afterState: { totalAmount: after.totalAmount },
        },
        tx,
      );
      return after;
    });
  }

  /** Draft/Reopened -> Confirmed — điều kiện qua bước: các bên xác nhận số liệu
   * (data-model.md mục 2, bước 9), tối thiểu phải có ít nhất 1 dòng. */
  async confirm(user: AuthenticatedUser, id: string) {
    const before = await this.getEditable(user, id);
    const lineCount = await this.prisma.reconciliationLine.count({
      where: { statementId: id },
    });
    if (lineCount === 0) {
      throw new BadRequestException(
        'Bảng đối soát chưa có dòng nào để xác nhận',
      );
    }
    return this.transition(
      user,
      before,
      ReconciliationStatus.CONFIRMED,
      'CONFIRM',
      {
        confirmedByUserId: user.userId,
        confirmedAt: new Date(),
      },
    );
  }

  /** Confirmed -> Locked — sau khi khóa mới cho phép sinh Invoice/AccountsPayable. */
  async lock(user: AuthenticatedUser, id: string) {
    const before = await this.findOne(user, id);
    if (before.status !== ReconciliationStatus.CONFIRMED) {
      throw new BadRequestException('Chỉ bảng đã xác nhận mới có thể khóa');
    }
    return this.transition(user, before, ReconciliationStatus.LOCKED, 'LOCK', {
      lockedAt: new Date(),
    });
  }

  /** Locked -> Reopened, bắt buộc lý do — coi là bước phê duyệt tối thiểu cho R1
   * (data-model.md mục 3: "mở lại phải có phê duyệt"). */
  async reopen(user: AuthenticatedUser, id: string, reason: string) {
    const before = await this.findOne(user, id);
    if (before.status !== ReconciliationStatus.LOCKED) {
      throw new BadRequestException('Chỉ bảng đã khóa mới có thể mở lại');
    }
    if (before.invoice || before.accountsPayable) {
      throw new BadRequestException(
        'Bảng đã phát sinh hóa đơn/công nợ, không thể mở lại — cần hủy hóa đơn/công nợ trước',
      );
    }
    return this.transition(
      user,
      before,
      ReconciliationStatus.REOPENED,
      'REOPEN',
      { reopenReason: reason },
      reason,
    );
  }

  private async recalculateTotal(
    tx: Prisma.TransactionClient,
    statementId: string,
  ) {
    const agg = await tx.reconciliationLine.aggregate({
      where: { statementId },
      _sum: { amount: true },
    });
    return tx.reconciliationStatement.update({
      where: { id: statementId },
      data: { totalAmount: agg._sum.amount ?? 0 },
    });
  }

  private async getEditable(user: AuthenticatedUser, id: string) {
    const statement = await this.findOne(user, id);
    if (!EDITABLE_STATUSES.includes(statement.status)) {
      throw new BadRequestException(
        `Bảng đối soát ở trạng thái ${statement.status} không thể sửa`,
      );
    }
    return statement;
  }

  private async transition(
    user: AuthenticatedUser,
    before: { id: string; status: ReconciliationStatus },
    status: ReconciliationStatus,
    action: string,
    data: Prisma.ReconciliationStatementUpdateInput = {},
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.reconciliationStatement.update({
        where: { id: before.id },
        data: { status, ...data },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: before.id,
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
