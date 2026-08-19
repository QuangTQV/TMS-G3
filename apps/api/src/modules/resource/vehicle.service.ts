import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { assertBranchScope } from '../../common/auth/data-scope.util';
import { toCursorPage } from '../../common/pagination/paginate';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { SetVehicleMaintenanceDto } from './dto/set-vehicle-maintenance.dto';

const ENTITY_TYPE = 'Vehicle';

@Injectable()
export class VehicleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateVehicleDto) {
    const existing = await this.prisma.vehicle.findUnique({
      where: { plateNumber: dto.plateNumber },
    });
    if (existing)
      throw new ConflictException(`Biển số ${dto.plateNumber} đã tồn tại`);

    return this.prisma.vehicle.create({
      data: { branchId: user.branchId, ...dto },
    });
  }

  async findMany(
    user: AuthenticatedUser,
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await this.prisma.vehicle.findMany({
      where: { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return toCursorPage(rows, limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException('Không tìm thấy xe');
    assertBranchScope(user, vehicle.branchId);
    return vehicle;
  }

  async setMaintenance(
    user: AuthenticatedUser,
    id: string,
    dto: SetVehicleMaintenanceDto,
  ) {
    const before = await this.findOne(user, id);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.vehicle.update({
        where: { id },
        data: {
          isMaintenance: dto.isMaintenance,
          maintenanceUntil: dto.maintenanceUntil
            ? new Date(dto.maintenanceUntil)
            : null,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
          action: dto.isMaintenance ? 'START_MAINTENANCE' : 'END_MAINTENANCE',
          actorUserId: user.userId,
          beforeState: { isMaintenance: before.isMaintenance },
          afterState: {
            isMaintenance: after.isMaintenance,
            maintenanceUntil: after.maintenanceUntil,
          },
        },
        tx,
      );
      return after;
    });
  }
}
