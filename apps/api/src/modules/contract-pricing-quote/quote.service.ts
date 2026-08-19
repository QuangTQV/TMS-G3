import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { QuoteStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { assertBranchScope } from '../../common/auth/data-scope.util';
import { toCursorPage } from '../../common/pagination/paginate';
import { ShipmentOrderService } from '../shipment-order/shipment-order.service';
import { CreateQuoteDto } from './dto/create-quote.dto';

const ENTITY_TYPE = 'Quote';

@Injectable()
export class QuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly shipmentOrderService: ShipmentOrderService,
  ) {}

  private generateCode(): string {
    return `QT-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
  }

  /**
   * Tính giá, giá mua dự kiến, giá bán và biên lợi nhuận — luôn tính lại tổng tiền
   * bằng code thường ở server, không tin tổng tiền client gửi lên (ràng buộc 3).
   */
  async create(user: AuthenticatedUser, dto: CreateQuoteDto) {
    const sellTotal = dto.lines.reduce(
      (sum, l) => sum + l.quantity * l.unitPrice,
      0,
    );
    const marginAmount =
      dto.estimatedBuyTotal !== undefined
        ? sellTotal - dto.estimatedBuyTotal
        : undefined;

    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.create({
        data: {
          branchId: user.branchId,
          code: this.generateCode(),
          customerId: dto.customerId,
          contractId: dto.contractId,
          sellTotal,
          estimatedBuyTotal: dto.estimatedBuyTotal,
          marginAmount,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          createdByUserId: user.userId,
          lines: {
            create: dto.lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              lineTotal: l.quantity * l.unitPrice,
            })),
          },
        },
        include: { lines: true },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: quote.id,
          action: 'CREATE',
          actorUserId: user.userId,
          afterState: quote,
        },
        tx,
      );
      return quote;
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!quote) throw new NotFoundException('Không tìm thấy báo giá');
    assertBranchScope(user, quote.branchId);
    return quote;
  }

  async findMany(
    user: AuthenticatedUser,
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await this.prisma.quote.findMany({
      where: { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return toCursorPage(rows, limit);
  }

  /** Phê duyệt và gửi báo giá — gộp thành một hành động ở R1 (phân hệ module 3). */
  async approveAndSend(user: AuthenticatedUser, id: string) {
    const before = await this.findOne(user, id);
    if (before.status !== QuoteStatus.DRAFT) {
      throw new BadRequestException(
        'Chỉ báo giá ở trạng thái nháp mới có thể duyệt và gửi',
      );
    }
    return this.transitionStatus(
      user,
      before,
      QuoteStatus.SENT,
      'APPROVE_AND_SEND',
      {
        sentAt: new Date(),
      },
    );
  }

  async accept(user: AuthenticatedUser, id: string) {
    const before = await this.findOne(user, id);
    if (before.status !== QuoteStatus.SENT) {
      throw new BadRequestException('Chỉ báo giá đã gửi mới có thể chấp nhận');
    }
    return this.transitionStatus(user, before, QuoteStatus.ACCEPTED, 'ACCEPT', {
      respondedAt: new Date(),
    });
  }

  async reject(user: AuthenticatedUser, id: string, reason: string) {
    const before = await this.findOne(user, id);
    if (before.status !== QuoteStatus.SENT) {
      throw new BadRequestException('Chỉ báo giá đã gửi mới có thể từ chối');
    }
    return this.transitionStatus(
      user,
      before,
      QuoteStatus.REJECTED,
      'REJECT',
      { respondedAt: new Date() },
      reason,
    );
  }

  /**
   * Chuyển báo giá thành đơn không nhập lại dữ liệu — gọi thẳng
   * ShipmentOrderService.createFromQuote trong cùng transaction thay vì để module
   * 4 tự đọc lại dữ liệu báo giá (docs/architecture.md mục 4: giao tiếp qua service
   * interface được export).
   */
  async convertToOrder(user: AuthenticatedUser, id: string) {
    const quote = await this.findOne(user, id);
    if (quote.status !== QuoteStatus.ACCEPTED) {
      throw new BadRequestException(
        'Chỉ báo giá đã được khách hàng chấp nhận mới có thể chuyển đơn',
      );
    }
    const existingOrder = await this.prisma.shipmentOrder.findFirst({
      where: { quoteId: id },
    });
    if (existingOrder) {
      throw new BadRequestException(
        'Báo giá này đã được chuyển thành đơn trước đó',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await this.shipmentOrderService.createFromQuote(
        user,
        {
          quoteId: quote.id,
          customerId: quote.customerId,
          sellTotal: quote.sellTotal,
          estimatedBuyTotal: quote.estimatedBuyTotal,
        },
        tx,
      );
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
          action: 'CONVERT_TO_ORDER',
          actorUserId: user.userId,
          afterState: { shipmentOrderId: order.id },
        },
        tx,
      );
      return order;
    });
  }

  private async transitionStatus(
    user: AuthenticatedUser,
    before: { id: string; status: QuoteStatus },
    status: QuoteStatus,
    action: string,
    extraData: Record<string, unknown>,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.quote.update({
        where: { id: before.id },
        data: { status, ...extraData },
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
