import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentEvidenceStatus, Prisma, TripStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { assertBranchScope } from '../../common/auth/data-scope.util';
import { toCursorPage } from '../../common/pagination/paginate';
import { TripService } from '../trip/trip.service';
import { UploadDocumentEvidenceDto } from './dto/upload-document-evidence.dto';

const ENTITY_TYPE = 'DocumentEvidence';
const UPLOAD_ENDPOINT = 'POST /v1/trips/:tripId/documents';

@Injectable()
export class DocumentEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly idempotency: IdempotencyService,
    private readonly tripService: TripService,
  ) {}

  /**
   * Thu thập bằng chứng cho 1 chuyến — file đã được client upload lên storage trước,
   * ở đây chỉ ghi nhận tham chiếu. Nếu loại chứng từ có cấu hình AI, tạo luôn
   * AIProcessingJob(QUEUED) để worker (chưa xây dựng — xem docs/ai-processing.md) xử
   * lý bất đồng bộ, không chờ kết quả (ràng buộc 2, CLAUDE.md).
   * Bắt buộc Idempotency-Key vì đây là endpoint ghi dữ liệu gọi từ app tài xế
   * (docs/api-conventions.md mục 4).
   */
  async upload(
    user: AuthenticatedUser,
    tripId: string,
    dto: UploadDocumentEvidenceDto,
    idempotencyKey: string | undefined,
  ) {
    return this.idempotency.withIdempotency(
      idempotencyKey,
      UPLOAD_ENDPOINT,
      async (tx) => {
        const trip = await tx.trip.findUnique({ where: { id: tripId } });
        if (!trip) throw new NotFoundException('Không tìm thấy chuyến');
        assertBranchScope(user, trip.branchId);

        const docType = await tx.requiredDocumentType.findUnique({
          where: { id: dto.requiredDocumentTypeId },
        });
        if (!docType || !docType.isActive) {
          throw new NotFoundException('Không tìm thấy loại chứng từ hợp lệ');
        }

        const evidence = await tx.documentEvidence.create({
          data: {
            branchId: trip.branchId,
            tripId: trip.id,
            requiredDocumentTypeId: docType.id,
            fileUrl: dto.fileUrl,
            fileHash: dto.fileHash,
            uploadedByUserId: user.userId,
          },
        });
        await this.auditLog.record(
          {
            entityType: ENTITY_TYPE,
            entityId: evidence.id,
            action: 'UPLOAD',
            actorUserId: user.userId,
            afterState: evidence,
          },
          tx,
        );

        let aiJob: Prisma.AIProcessingJobGetPayload<object> | null = null;
        if (docType.aiJobType) {
          aiJob = await tx.aIProcessingJob.create({
            data: {
              documentEvidenceId: evidence.id,
              jobType: docType.aiJobType,
            },
          });
          await this.auditLog.record(
            {
              entityType: 'AIProcessingJob',
              entityId: aiJob.id,
              action: 'QUEUE',
              actorUserId: user.userId,
              afterState: aiJob,
            },
            tx,
          );
        }

        return { ...evidence, aiJob };
      },
    );
  }

  async findManyByTrip(
    user: AuthenticatedUser,
    tripId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến');
    assertBranchScope(user, trip.branchId);

    const rows = await this.prisma.documentEvidence.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { requiredDocumentType: true, aiJobs: true },
    });
    return toCursorPage(rows, limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const evidence = await this.prisma.documentEvidence.findUnique({
      where: { id },
      include: {
        requiredDocumentType: true,
        aiJobs: { include: { extractionResult: true } },
      },
    });
    if (!evidence) throw new NotFoundException('Không tìm thấy chứng từ');
    assertBranchScope(user, evidence.branchId);
    return evidence;
  }

  /** Duyệt thủ công — kể cả khi AI đã báo VERIFIED, người phụ trách vẫn có thể xác
   * nhận lại (chức năng "Kiểm tra, phiên bản, khóa và chia sẻ", module 7). */
  async verify(user: AuthenticatedUser, id: string) {
    const after = await this.prisma.$transaction(async (tx) => {
      const before = await this.assertMutable(tx, user, id);
      const after = await tx.documentEvidence.update({
        where: { id },
        data: { status: DocumentEvidenceStatus.VERIFIED, rejectedReason: null },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
          action: 'VERIFY',
          actorUserId: user.userId,
          beforeState: { status: before.status },
          afterState: { status: after.status },
        },
        tx,
      );
      return after;
    });
    await this.recomputeTripCompletion(user, after.tripId);
    return after;
  }

  async reject(user: AuthenticatedUser, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.assertMutable(tx, user, id);
      const after = await tx.documentEvidence.update({
        where: { id },
        data: {
          status: DocumentEvidenceStatus.REJECTED,
          rejectedReason: reason,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
          action: 'REJECT',
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

  /** Khóa — chứng từ đã khóa không cho sửa/xóa, chỉ chia sẻ (module 7, "Kiểm tra,
   * phiên bản, khóa và chia sẻ"). */
  async lock(user: AuthenticatedUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.documentEvidence.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Không tìm thấy chứng từ');
      assertBranchScope(user, before.branchId);
      if (before.status !== DocumentEvidenceStatus.VERIFIED) {
        throw new BadRequestException(
          'Chỉ chứng từ đã xác thực mới có thể khóa',
        );
      }
      const after = await tx.documentEvidence.update({
        where: { id },
        data: {
          status: DocumentEvidenceStatus.LOCKED,
          lockedAt: new Date(),
          lockedByUserId: user.userId,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
          action: 'LOCK',
          actorUserId: user.userId,
          beforeState: { status: before.status },
          afterState: { status: after.status },
        },
        tx,
      );
      return after;
    });
  }

  async share(user: AuthenticatedUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.documentEvidence.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Không tìm thấy chứng từ');
      assertBranchScope(user, before.branchId);
      if (before.status !== DocumentEvidenceStatus.LOCKED) {
        throw new BadRequestException(
          'Chỉ chứng từ đã khóa mới có thể chia sẻ',
        );
      }
      const after = await tx.documentEvidence.update({
        where: { id },
        data: { sharedAt: new Date() },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
          action: 'SHARE',
          actorUserId: user.userId,
          afterState: { sharedAt: after.sharedAt },
        },
        tx,
      );
      return after;
    });
  }

  private async assertMutable(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    id: string,
  ) {
    const evidence = await tx.documentEvidence.findUnique({ where: { id } });
    if (!evidence) throw new NotFoundException('Không tìm thấy chứng từ');
    assertBranchScope(user, evidence.branchId);
    if (evidence.status === DocumentEvidenceStatus.LOCKED) {
      throw new BadRequestException('Chứng từ đã khóa, không thể sửa');
    }
    return evidence;
  }

  /**
   * Điều kiện qua bước 7 (data-model.md mục 2): "Đủ loại bắt buộc và đúng đơn/chuyến"
   * — khi mọi RequiredDocumentType đang active đã có bằng chứng VERIFIED/LOCKED cho
   * chuyến, tự chuyển Trip sang CompletedVerified qua TripService (không tự sửa bảng
   * trips từ module này — ranh giới module, architecture.md mục 4). Chạy ngoài
   * transaction ghi chứng từ: đây là bước tiện ích tự động, không phải điều kiện tài
   * chính bắt buộc đồng bộ tuyệt đối trong cùng transaction.
   */
  async recomputeTripCompletion(user: AuthenticatedUser, tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip || trip.status !== TripStatus.COMPLETED_PENDING_DOCS) return;

    const requiredTypes = await this.prisma.requiredDocumentType.findMany({
      where: { isActive: true },
    });
    if (requiredTypes.length === 0) return;

    const evidences = await this.prisma.documentEvidence.findMany({
      where: { tripId },
    });
    const satisfied = requiredTypes.every((type) =>
      evidences.some(
        (e) =>
          e.requiredDocumentTypeId === type.id &&
          (e.status === DocumentEvidenceStatus.VERIFIED ||
            e.status === DocumentEvidenceStatus.LOCKED),
      ),
    );
    if (!satisfied) return;

    await this.tripService.completeDocumentVerification(user, tripId);
  }
}
