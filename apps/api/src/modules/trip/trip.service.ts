import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ShipmentOrderStatus, TripStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { assertBranchScope } from '../../common/auth/data-scope.util';
import { toCursorPage } from '../../common/pagination/paginate';
import { AssignResourceDto } from './dto/assign-resource.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { LinkOrderDto } from './dto/link-order.dto';

const ENTITY_TYPE = 'Trip';

// Chuyến còn có thể hủy — trước khi Closed (docs/data-model.md mục 3).
const CANCELLABLE_STATUSES: TripStatus[] = [
  TripStatus.PLANNED,
  TripStatus.DISPATCHED,
  TripStatus.IN_PROGRESS,
  TripStatus.PAUSED,
  TripStatus.COMPLETED_PENDING_DOCS,
  TripStatus.EXCEPTION,
];

// Chuyến coi là "đang chiếm dụng" nguồn lực — dùng để tính xe/tài xế nào đang rảnh
// khi gợi ý. CompletedPendingDocs không tính là bận: hàng đã giao xong, chỉ còn chờ
// chứng từ, xe/tài xế trên thực tế đã có thể nhận chuyến khác.
const OCCUPYING_STATUSES: TripStatus[] = [
  TripStatus.PLANNED,
  TripStatus.DISPATCHED,
  TripStatus.IN_PROGRESS,
  TripStatus.PAUSED,
];

@Injectable()
export class TripService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  private generateCode(): string {
    return `TRIP-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
  }

  async create(user: AuthenticatedUser, dto: CreateTripDto) {
    return this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.create({
        data: {
          branchId: user.branchId,
          code: this.generateCode(),
          isOutsourced: dto.isOutsourced ?? false,
          createdByUserId: user.userId,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: trip.id,
          action: 'CREATE',
          actorUserId: user.userId,
          afterState: trip,
        },
        tx,
      );
      return trip;
    });
  }

  async findMany(
    user: AuthenticatedUser,
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await this.prisma.trip.findMany({
      where: { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return toCursorPage(rows, limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id },
      include: {
        stops: { orderBy: { sequence: 'asc' } },
        orderLinks: { include: { shipmentOrder: true } },
        vehicle: true,
        driver: true,
        carrier: true,
      },
    });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến');
    assertBranchScope(user, trip.branchId);
    return trip;
  }

  /**
   * Ghép đơn vào chuyến (quan hệ N-N qua TripOrderLink) — chỉ chấp nhận đơn đã
   * CONFIRMED, cùng chi nhánh, chưa gán vào chuyến này. Xem docs/data-model.md mục 2.
   */
  async linkOrder(user: AuthenticatedUser, tripId: string, dto: LinkOrderDto) {
    const trip = await this.findOne(user, tripId);
    const order = await this.prisma.shipmentOrder.findUnique({
      where: { id: dto.shipmentOrderId },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn vận chuyển');
    assertBranchScope(user, order.branchId);
    if (
      order.status !== ShipmentOrderStatus.CONFIRMED &&
      order.status !== ShipmentOrderStatus.PLANNED
    ) {
      throw new BadRequestException(
        'Chỉ đơn đã xác nhận mới có thể ghép vào chuyến',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const link = await tx.tripOrderLink.create({
        data: {
          tripId: trip.id,
          shipmentOrderId: dto.shipmentOrderId,
          splitReason: dto.splitReason,
        },
      });
      if (order.status === ShipmentOrderStatus.CONFIRMED) {
        await tx.shipmentOrder.update({
          where: { id: order.id },
          data: { status: ShipmentOrderStatus.PLANNED },
        });
      }
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: trip.id,
          action: 'LINK_ORDER',
          actorUserId: user.userId,
          reason: dto.splitReason,
          afterState: { shipmentOrderId: dto.shipmentOrderId },
        },
        tx,
      );
      return link;
    });
  }

  async unlinkOrder(
    user: AuthenticatedUser,
    tripId: string,
    shipmentOrderId: string,
    reason: string,
  ) {
    const trip = await this.findOne(user, tripId);
    const link = trip.orderLinks.find(
      (l) => l.shipmentOrderId === shipmentOrderId,
    );
    if (!link) throw new NotFoundException('Đơn này chưa được ghép vào chuyến');

    return this.prisma.$transaction(async (tx) => {
      await tx.tripOrderLink.delete({ where: { id: link.id } });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: trip.id,
          action: 'UNLINK_ORDER',
          actorUserId: user.userId,
          reason,
          beforeState: { shipmentOrderId },
        },
        tx,
      );
    });
  }

  /**
   * Gợi ý xe/tài xế (hoặc nhà vận tải nếu chuyến thuê ngoài) theo thông số đơn hàng
   * đã ghép vào chuyến — module 5 phân hệ "Gợi ý tối ưu". R1 chỉ có dữ liệu tải trọng
   * (`Cargo.weightKg`) và trạng thái bận/rảnh (đang giữ nguồn lực ở chuyến khác) để
   * xếp hạng — chưa có thể tích/loại thùng lạnh trong schema hiện tại nên không lọc
   * theo các tiêu chí đó, chỉ nêu cảnh báo khi thiếu dữ liệu thay vì tự suy đoán.
   * Đây là gợi ý bằng quy tắc thông thường, không phải AI — không thuộc phạm vi
   * "AI nâng cao" bị hoãn ở mục 6, CLAUDE.md.
   */
  async suggestResources(user: AuthenticatedUser, tripId: string) {
    const trip = await this.findOne(user, tripId);

    const orders = await this.prisma.shipmentOrder.findMany({
      where: { id: { in: trip.orderLinks.map((l) => l.shipmentOrderId) } },
      include: { cargos: true },
    });
    const cargos = orders.flatMap((o) => o.cargos);
    const hasWeightData = cargos.some((c) => c.weightKg !== null);
    const requiredWeightKg = hasWeightData
      ? cargos.reduce(
          (sum, c) => sum + (c.weightKg ? c.weightKg.toNumber() : 0),
          0,
        )
      : null;

    if (trip.isOutsourced) {
      const carriers = await this.prisma.carrier.findMany({
        where: { branchId: trip.branchId, status: 'ACTIVE' },
        orderBy: { code: 'asc' },
      });
      const busyCarrierIds = await this.busyResourceIds(
        trip.branchId,
        tripId,
        'carrierId',
      );
      const suggestions = carriers
        .map((carrier) => ({ carrier, busy: busyCarrierIds.has(carrier.id) }))
        .sort((a, b) => Number(a.busy) - Number(b.busy));
      return {
        requiredWeightKg,
        vehicles: [],
        drivers: [],
        carriers: suggestions,
      };
    }

    const [vehicles, drivers] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { branchId: trip.branchId, isMaintenance: false },
        orderBy: { plateNumber: 'asc' },
      }),
      this.prisma.driver.findMany({
        where: { branchId: trip.branchId, isActive: true, carrierId: null },
        orderBy: { fullName: 'asc' },
      }),
    ]);
    const [busyVehicleIds, busyDriverIds] = await Promise.all([
      this.busyResourceIds(trip.branchId, tripId, 'vehicleId'),
      this.busyResourceIds(trip.branchId, tripId, 'driverId'),
    ]);

    const vehicleSuggestions = vehicles
      .map((vehicle) => {
        const capacityKg = vehicle.loadCapacityKg
          ? vehicle.loadCapacityKg.toNumber()
          : null;
        const fitsCapacity =
          requiredWeightKg === null || capacityKg === null
            ? null
            : capacityKg >= requiredWeightKg;
        const excessCapacityKg =
          capacityKg !== null && requiredWeightKg !== null
            ? capacityKg - requiredWeightKg
            : null;
        const busy = busyVehicleIds.has(vehicle.id);
        const warnings: string[] = [];
        if (capacityKg === null) warnings.push('Xe chưa khai tải trọng');
        if (requiredWeightKg === null)
          warnings.push('Đơn chưa khai trọng lượng hàng');
        if (fitsCapacity === false)
          warnings.push(
            'Tải trọng xe nhỏ hơn tổng trọng lượng hàng của chuyến',
          );
        if (busy) warnings.push('Xe đang giữ ở chuyến khác chưa đóng');
        return { vehicle, fitsCapacity, excessCapacityKg, busy, warnings };
      })
      .sort((a, b) => {
        if (a.busy !== b.busy) return a.busy ? 1 : -1;
        if (a.fitsCapacity !== b.fitsCapacity) return a.fitsCapacity ? -1 : 1;
        return (
          (a.excessCapacityKg ?? Infinity) - (b.excessCapacityKg ?? Infinity)
        );
      });

    const driverSuggestions = drivers
      .map((driver) => ({ driver, busy: busyDriverIds.has(driver.id) }))
      .sort((a, b) => Number(a.busy) - Number(b.busy));

    return {
      requiredWeightKg,
      vehicles: vehicleSuggestions,
      drivers: driverSuggestions,
      carriers: [],
    };
  }

  /** Tập id nguồn lực (xe/tài xế/nhà vận tải) đang được giữ ở một chuyến khác của
   * cùng chi nhánh chưa đóng — dùng để đánh dấu "bận" khi gợi ý, không loại hẳn khỏi
   * danh sách (người điều phối vẫn có thể cố tình gán chồng khi cần). */
  private async busyResourceIds(
    branchId: string,
    excludeTripId: string,
    field: 'vehicleId' | 'driverId' | 'carrierId',
  ): Promise<Set<string>> {
    const rows = await this.prisma.trip.findMany({
      where: {
        branchId,
        id: { not: excludeTripId },
        status: { in: OCCUPYING_STATUSES },
        vehicleId: field === 'vehicleId' ? { not: null } : undefined,
        driverId: field === 'driverId' ? { not: null } : undefined,
        carrierId: field === 'carrierId' ? { not: null } : undefined,
      },
      select: { vehicleId: true, driverId: true, carrierId: true },
    });
    return new Set(
      rows.map((r) => r[field]).filter((v): v is string => v !== null),
    );
  }

  /** Gán/thay nguồn lực nội bộ hoặc thuê ngoài — module 5 phân hệ "Phân công nguồn lực". */
  async assignResource(
    user: AuthenticatedUser,
    tripId: string,
    dto: AssignResourceDto,
  ) {
    const before = await this.findOne(user, tripId);

    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: dto.vehicleId },
      });
      if (!vehicle) throw new NotFoundException('Không tìm thấy xe');
      assertBranchScope(user, vehicle.branchId);
      if (vehicle.isMaintenance) {
        throw new BadRequestException(
          'Xe đang bảo trì, không thể gán cho chuyến',
        );
      }
    }
    if (dto.driverId) {
      const driver = await this.prisma.driver.findUnique({
        where: { id: dto.driverId },
      });
      if (!driver) throw new NotFoundException('Không tìm thấy tài xế');
      assertBranchScope(user, driver.branchId);
    }
    if (dto.carrierId) {
      const carrier = await this.prisma.carrier.findUnique({
        where: { id: dto.carrierId },
      });
      if (!carrier) throw new NotFoundException('Không tìm thấy nhà vận tải');
      assertBranchScope(user, carrier.branchId);
    }

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.trip.update({
        where: { id: tripId },
        data: {
          vehicleId: dto.vehicleId,
          driverId: dto.driverId,
          carrierId: dto.carrierId,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: tripId,
          action: 'ASSIGN_RESOURCE',
          actorUserId: user.userId,
          beforeState: {
            vehicleId: before.vehicleId,
            driverId: before.driverId,
            carrierId: before.carrierId,
          },
          afterState: {
            vehicleId: after.vehicleId,
            driverId: after.driverId,
            carrierId: after.carrierId,
          },
        },
        tx,
      );
      return after;
    });
  }

  async dispatch(user: AuthenticatedUser, tripId: string) {
    const before = await this.findOne(user, tripId);
    if (before.status !== TripStatus.PLANNED) {
      throw new BadRequestException(
        'Chỉ chuyến ở trạng thái kế hoạch mới có thể phát lệnh',
      );
    }
    const hasInternalResource = Boolean(before.vehicleId && before.driverId);
    const hasCarrier = Boolean(before.carrierId);
    if (!hasInternalResource && !hasCarrier) {
      throw new BadRequestException(
        'Chuyến chưa được gán xe/tài xế hoặc nhà vận tải',
      );
    }
    return this.transitionStatus(
      user,
      before,
      TripStatus.DISPATCHED,
      'DISPATCH',
    );
  }

  async start(user: AuthenticatedUser, tripId: string) {
    const before = await this.findOne(user, tripId);
    if (before.status !== TripStatus.DISPATCHED) {
      throw new BadRequestException(
        'Chỉ chuyến đã phát lệnh mới có thể bắt đầu thực hiện',
      );
    }
    return this.transitionStatus(user, before, TripStatus.IN_PROGRESS, 'START');
  }

  async complete(user: AuthenticatedUser, tripId: string) {
    const before = await this.findOne(user, tripId);
    if (before.status !== TripStatus.IN_PROGRESS) {
      throw new BadRequestException(
        'Chỉ chuyến đang thực hiện mới có thể hoàn tất',
      );
    }
    return this.transitionStatus(
      user,
      before,
      TripStatus.COMPLETED_PENDING_DOCS,
      'COMPLETE',
    );
  }

  async pause(user: AuthenticatedUser, tripId: string, reason: string) {
    const before = await this.findOne(user, tripId);
    if (
      before.status !== TripStatus.IN_PROGRESS &&
      before.status !== TripStatus.DISPATCHED
    ) {
      throw new BadRequestException(
        'Chỉ chuyến đã phát lệnh hoặc đang thực hiện mới có thể tạm dừng',
      );
    }
    return this.transitionStatus(
      user,
      before,
      TripStatus.PAUSED,
      'PAUSE',
      reason,
    );
  }

  async resume(user: AuthenticatedUser, tripId: string) {
    const before = await this.findOne(user, tripId);
    if (before.status !== TripStatus.PAUSED) {
      throw new BadRequestException(
        'Chỉ chuyến đang tạm dừng mới có thể tiếp tục',
      );
    }
    return this.transitionStatus(
      user,
      before,
      TripStatus.IN_PROGRESS,
      'RESUME',
    );
  }

  async cancel(user: AuthenticatedUser, tripId: string, reason: string) {
    const before = await this.findOne(user, tripId);
    if (!CANCELLABLE_STATUSES.includes(before.status)) {
      throw new BadRequestException(
        `Không thể hủy chuyến ở trạng thái ${before.status}`,
      );
    }
    return this.transitionStatus(
      user,
      before,
      TripStatus.CANCELLED,
      'CANCEL',
      reason,
    );
  }

  /**
   * CompletedPendingDocs -> CompletedVerified khi đủ chứng từ bắt buộc đã xác thực
   * (bước 7, docs/data-model.md mục 2) — gọi từ module 7 (DocumentEvidenceService)
   * qua service export, không import thẳng bảng trips từ module đó (architecture.md
   * mục 4). Không phải lỗi nếu gọi khi chuyến chưa/không còn ở CompletedPendingDocs —
   * chỉ là no-op, vì đây là bước tự động tiện ích, không phải hành động người dùng
   * yêu cầu tường minh.
   */
  async completeDocumentVerification(user: AuthenticatedUser, tripId: string) {
    const before = await this.findOne(user, tripId);
    if (before.status !== TripStatus.COMPLETED_PENDING_DOCS) return before;
    return this.transitionStatus(
      user,
      before,
      TripStatus.COMPLETED_VERIFIED,
      'VERIFY_DOCS',
    );
  }

  private async transitionStatus(
    user: AuthenticatedUser,
    before: { id: string; status: TripStatus },
    status: TripStatus,
    action: string,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.trip.update({
        where: { id: before.id },
        data: {
          status,
          ...(action === 'CANCEL' ? { cancelReason: reason } : {}),
          ...(action === 'PAUSE' ? { pauseReason: reason } : {}),
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
