import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface RecordAuditLogInput {
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string;
  actorRole?: string;
  reason?: string;
  beforeState?: unknown;
  afterState?: unknown;
}

/**
 * Kernel dùng chung cho mọi module theo docs/security-audit.md — bảng audit_logs
 * là append-only: service này chỉ cung cấp `record()`, không có update/delete.
 * Luôn gọi trong cùng transaction Prisma với thay đổi dữ liệu nghiệp vụ (truyền
 * `tx` khi có) để tránh trường hợp dữ liệu đổi nhưng audit log bị mất.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditLogInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.auditLog.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        reason: input.reason,
        beforeState: toJsonInput(input.beforeState),
        afterState: toJsonInput(input.afterState),
      },
    });
  }
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
