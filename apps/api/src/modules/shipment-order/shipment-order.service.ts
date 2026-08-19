import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, ShipmentOrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { assertBranchScope } from '../../common/auth/data-scope.util';
import { toCursorPage } from '../../common/pagination/paginate';
import { CreateShipmentOrderDto } from './dto/create-shipment-order.dto';

const ENTITY_TYPE = 'ShipmentOrder';

// Trạng thái còn được phép hủy — trước Delivered, theo docs/data-model.md mục 3.
const CANCELLABLE_STATUSES: ShipmentOrderStatus[] = [
  ShipmentOrderStatus.DRAFT,
  ShipmentOrderStatus.CONFIRMED,
  ShipmentOrderStatus.PLANNED,
  ShipmentOrderStatus.IN_TRANSIT,
  ShipmentOrderStatus.HELD,
];

export interface CreateFromQuoteInput {
  quoteId: string;
  customerId: string;
  sellTotal: Prisma.Decimal | number;
  estimatedBuyTotal?: Prisma.Decimal | number | null;
}

@Injectable()
export class ShipmentOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private generateCode(): string {
    // Placeholder R1: mã đơn duy nhất theo thời gian — thay bằng bộ sinh mã theo
    // chi nhánh/khách hàng khi có yêu cầu định dạng chính thức từ G3.
    return `SO-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
  }

  async create(user: AuthenticatedUser, dto: CreateShipmentOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.shipmentOrder.create({
        data: {
          branchId: user.branchId,
          code: this.generateCode(),
          customerId: dto.customerId,
          quoteId: dto.quoteId,
          customerRef: dto.customerRef,
          sourceChannel: dto.sourceChannel,
          sellTotal: dto.sellTotal,
          estimatedBuyTotal: dto.estimatedBuyTotal,
          createdByUserId: user.userId,
          points: {
            create: dto.points.map((p) => ({
              sequence: p.sequence,
              type: p.type,
              customerLocationId: p.customerLocationId,
              freeAddress: p.freeAddress,
              windowFrom: p.windowFrom ? new Date(p.windowFrom) : undefined,
              windowTo: p.windowTo ? new Date(p.windowTo) : undefined,
              bookingNumber: p.bookingNumber,
              containerNumber: p.containerNumber,
              sealNumber: p.sealNumber,
              depotCode: p.depotCode,
              cutOffAt: p.cutOffAt ? new Date(p.cutOffAt) : undefined,
            })),
          },
          cargos: { create: dto.cargos },
        },
        include: { points: true, cargos: true },
      });

      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: order.id,
          action: 'CREATE',
          actorUserId: user.userId,
          afterState: order,
        },
        tx,
      );
      return order;
    });
  }

  /**
   * Chuyển báo giá thành đơn không nhập lại dữ liệu (module 3 gọi qua đây) — giữ
   * points/cargos trống, chờ bước "Hoàn thiện đơn" (bước 3, luồng nghiệp vụ).
   */
  async createFromQuote(
    user: AuthenticatedUser,
    input: CreateFromQuoteInput,
    tx: Prisma.TransactionClient,
  ) {
    const order = await tx.shipmentOrder.create({
      data: {
        branchId: user.branchId,
        code: this.generateCode(),
        customerId: input.customerId,
        quoteId: input.quoteId,
        sourceChannel: 'quote',
        sellTotal: input.sellTotal,
        estimatedBuyTotal: input.estimatedBuyTotal ?? undefined,
        createdByUserId: user.userId,
      },
    });
    await this.auditLog.record(
      {
        entityType: ENTITY_TYPE,
        entityId: order.id,
        action: 'CREATE_FROM_QUOTE',
        actorUserId: user.userId,
        afterState: order,
      },
      tx,
    );
    return order;
  }

  async findMany(
    user: AuthenticatedUser,
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await this.prisma.shipmentOrder.findMany({
      where: { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return toCursorPage(rows, limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const order = await this.prisma.shipmentOrder.findUnique({
      where: { id },
      include: { points: { orderBy: { sequence: 'asc' } }, cargos: true },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn vận chuyển');
    assertBranchScope(user, order.branchId);
    return order;
  }

  async confirm(user: AuthenticatedUser, id: string) {
    const before = await this.findOne(user, id);
    if (before.status !== ShipmentOrderStatus.DRAFT) {
      throw new BadRequestException(
        'Chỉ đơn ở trạng thái nháp mới có thể xác nhận',
      );
    }
    return this.transitionStatus(
      user,
      before,
      ShipmentOrderStatus.CONFIRMED,
      'CONFIRM',
    );
  }

  async hold(user: AuthenticatedUser, id: string, reason: string) {
    const before = await this.findOne(user, id);
    return this.transitionStatus(
      user,
      before,
      ShipmentOrderStatus.HELD,
      'HOLD',
      reason,
    );
  }

  async cancel(user: AuthenticatedUser, id: string, reason: string) {
    const before = await this.findOne(user, id);
    if (!CANCELLABLE_STATUSES.includes(before.status)) {
      throw new BadRequestException(
        `Không thể hủy đơn ở trạng thái ${before.status}`,
      );
    }
    return this.transitionStatus(
      user,
      before,
      ShipmentOrderStatus.CANCELLED,
      'CANCEL',
      reason,
    );
  }

  private async transitionStatus(
    user: AuthenticatedUser,
    before: { id: string; status: ShipmentOrderStatus },
    status: ShipmentOrderStatus,
    action: string,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.shipmentOrder.update({
        where: { id: before.id },
        data: {
          status,
          ...(action === 'CANCEL' ? { cancelReason: reason } : {}),
        },
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
