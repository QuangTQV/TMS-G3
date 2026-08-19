import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { CreateRequiredDocumentTypeDto } from './dto/create-required-document-type.dto';

const ENTITY_TYPE = 'RequiredDocumentType';

/**
 * Danh mục chứng từ bắt buộc (module 7, phân hệ "Danh mục chứng từ bắt buộc").
 * R1: danh mục dùng chung cho mọi chuyến — lọc theo khách hàng/loại chuyến là mở
 * rộng sau, chưa cần cho luồng tối thiểu (docs/data-model.md mục 1).
 */
@Injectable()
export class RequiredDocumentTypeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateRequiredDocumentTypeDto) {
    return this.prisma.$transaction(async (tx) => {
      const type = await tx.requiredDocumentType.create({
        data: {
          code: dto.code,
          name: dto.name,
          aiJobType: dto.aiJobType,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: type.id,
          action: 'CREATE',
          actorUserId: user.userId,
          afterState: type,
        },
        tx,
      );
      return type;
    });
  }

  async findMany() {
    return this.prisma.requiredDocumentType.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async deactivate(user: AuthenticatedUser, id: string) {
    const before = await this.prisma.requiredDocumentType.findUnique({
      where: { id },
    });
    if (!before) throw new NotFoundException('Không tìm thấy loại chứng từ');

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.requiredDocumentType.update({
        where: { id },
        data: { isActive: false },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
          action: 'DEACTIVATE',
          actorUserId: user.userId,
          beforeState: { isActive: before.isActive },
          afterState: { isActive: after.isActive },
        },
        tx,
      );
      return after;
    });
  }
}
