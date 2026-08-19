import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AIJobStatus,
  AIJobType,
  DocumentEvidenceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { assertBranchScope } from '../../common/auth/data-scope.util';
import { toCursorPage } from '../../common/pagination/paginate';
import { DocumentEvidenceService } from './document-evidence.service';
import { TripCostService } from '../trip-cost/trip-cost.service';
import { ImageExtractionService } from './image-extraction.service';
import { SubmitAiResultDto } from './dto/submit-ai-result.dto';
import { isValidContainerNumber } from './validators/container-number.util';
import {
  isInvoiceDateValid,
  isInvoiceTotalConsistent,
} from './validators/invoice-fields.util';

const ENTITY_TYPE = 'AIProcessingJob';

// Ngưỡng độ tin cậy cấu hình được (docs/ai-processing.md nhóm A #3) — R1 dùng hằng số
// cố định, chuyển sang cấu hình theo chi nhánh/loại chứng từ khi có yêu cầu cụ thể.
const CONFIDENCE_THRESHOLD = 0.8;

interface ValidationOutcome {
  status: typeof AIJobStatus.VERIFIED | typeof AIJobStatus.NEEDS_REVIEW;
  notes?: string;
}

/**
 * Vòng đời AIProcessingJob (module 7, docs/ai-processing.md). Worker gọi LLM thật
 * chưa được xây dựng — nhà cung cấp và chính sách bảo mật dữ liệu gửi ra ngoài chưa
 * chốt (docs/open-questions.md). Service này nhận kết quả AI đã có sẵn (từ worker
 * tương lai hoặc công cụ vận hành) và chạy lớp validate bắt buộc bằng code thường
 * trước khi chấp nhận (ràng buộc 3, CLAUDE.md) — không tự gọi LLM.
 */
@Injectable()
export class AIProcessingJobService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly documentEvidenceService: DocumentEvidenceService,
    private readonly tripCostService: TripCostService,
    private readonly imageExtractionService: ImageExtractionService,
  ) {}

  async findOne(user: AuthenticatedUser, id: string) {
    const job = await this.prisma.aIProcessingJob.findUnique({
      where: { id },
      include: { documentEvidence: true, extractionResult: true },
    });
    if (!job) throw new NotFoundException('Không tìm thấy job AI');
    assertBranchScope(user, job.documentEvidence.branchId);
    return job;
  }

  /** Hàng đợi nghiệp vụ cho worker/nhân viên vận hành. Job chỉ hiển thị trong
   * chi nhánh hiện tại, không lộ chứng từ liên chi nhánh. */
  async findMany(
    user: AuthenticatedUser,
    cursor: string | undefined,
    limit: number,
    status?: AIJobStatus,
  ) {
    const rows = await this.prisma.aIProcessingJob.findMany({
      where: {
        documentEvidence: { branchId: user.branchId },
        ...(status ? { status } : {}),
      },
      include: {
        documentEvidence: { include: { requiredDocumentType: true } },
      },
      orderBy: { requestedAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return toCursorPage(rows, limit);
  }

  async markProcessing(user: AuthenticatedUser, id: string) {
    return this.transitionJob(
      user,
      id,
      AIJobStatus.QUEUED,
      AIJobStatus.PROCESSING,
      'START',
    );
  }

  /** Retry chỉ tái lập job FAILED: không ghi đè kết quả cũ hay tăng trạng thái tùy
   * tiện. Worker sẽ phải start lại trước khi submit kết quả. */
  async retry(user: AuthenticatedUser, id: string) {
    const job = await this.prisma.aIProcessingJob.findUnique({
      where: { id },
      include: { documentEvidence: true },
    });
    if (!job) throw new NotFoundException('Không tìm thấy job AI');
    assertBranchScope(user, job.documentEvidence.branchId);
    if (job.status !== AIJobStatus.FAILED) {
      throw new BadRequestException('Chỉ job thất bại mới có thể chạy lại');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.aIProcessingJob.update({
        where: { id },
        data: {
          status: AIJobStatus.QUEUED,
          retryCount: { increment: 1 },
          errorMessage: null,
          completedAt: null,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
          action: 'RETRY',
          actorUserId: user.userId,
          beforeState: { status: job.status, retryCount: job.retryCount },
          afterState: {
            status: updated.status,
            retryCount: updated.retryCount,
          },
        },
        tx,
      );
      return updated;
    });
  }

  async fail(user: AuthenticatedUser, id: string, errorMessage: string) {
    return this.transitionJob(
      user,
      id,
      AIJobStatus.PROCESSING,
      AIJobStatus.FAILED,
      'FAIL',
      errorMessage,
    );
  }

  createCostDraft(user: AuthenticatedUser, id: string) {
    return this.tripCostService.createDraftFromAiJob(user, id);
  }

  /** Worker entrypoint: lấy URL đã lưu từ chứng từ, gọi extractor được cấu hình,
   * rồi đi qua đúng cùng một validate path với kết quả từ worker bên ngoài. */
  async process(user: AuthenticatedUser, id: string) {
    const job = await this.prisma.aIProcessingJob.findUnique({
      where: { id },
      include: {
        documentEvidence: { include: { requiredDocumentType: true } },
      },
    });
    if (!job) throw new NotFoundException('Không tìm thấy job AI');
    assertBranchScope(user, job.documentEvidence.branchId);
    await this.markProcessing(user, id);
    try {
      const output = await this.imageExtractionService.extract({
        imageUrl: job.documentEvidence.fileUrl,
        jobType: job.jobType,
        documentName: job.documentEvidence.requiredDocumentType.name,
      });
      return this.submitResult(user, id, output);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Không thể trích xuất ảnh';
      await this.fail(user, id, message);
      throw error;
    }
  }

  async submitResult(
    user: AuthenticatedUser,
    jobId: string,
    dto: SubmitAiResultDto,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const job = await tx.aIProcessingJob.findUnique({
        where: { id: jobId },
        include: { documentEvidence: true, extractionResult: true },
      });
      if (!job) throw new NotFoundException('Không tìm thấy job AI');
      assertBranchScope(user, job.documentEvidence.branchId);
      if (job.extractionResult) {
        throw new BadRequestException('Job này đã có kết quả');
      }
      if (
        job.status !== AIJobStatus.PROCESSING &&
        job.status !== AIJobStatus.QUEUED
      ) {
        throw new BadRequestException('Job không ở trạng thái chờ xử lý');
      }

      const outcome = await this.validate(tx, job, dto);

      const extraction = await tx.aIExtractionResult.create({
        data: {
          aiProcessingJobId: job.id,
          rawResult: dto.rawResult as Prisma.InputJsonValue,
          confidence: dto.confidence,
          validatedStatus: outcome.status,
          validationNotes: outcome.notes,
          invoiceIssuer: dto.invoice?.issuer,
          invoiceNumber: dto.invoice?.invoiceNumber,
          invoiceDate: dto.invoice
            ? new Date(dto.invoice.invoiceDate)
            : undefined,
          invoiceSubtotal: dto.invoice?.subtotal,
          invoiceVatAmount: dto.invoice?.vatAmount,
          invoiceTotal: dto.invoice?.total,
          containerNumber: dto.containerNumber,
          plateNumber: dto.plateNumber,
        },
      });

      const updatedJob = await tx.aIProcessingJob.update({
        where: { id: job.id },
        data: { status: outcome.status, completedAt: new Date() },
      });

      // Nhóm A map thẳng kết quả AI sang trạng thái chứng từ (đạt/cần kiểm tra lại).
      // Nhóm B chỉ đẩy NEEDS_REVIEW khi nghi vấn — kết quả hợp lệ vẫn chờ người phụ
      // trách bấm "Xác thực" (module 8 chỉ tiêu thụ dữ liệu, không tự khóa chứng từ).
      if (job.jobType === AIJobType.PHOTO_CHECK) {
        await tx.documentEvidence.update({
          where: { id: job.documentEvidenceId },
          data: {
            status:
              outcome.status === AIJobStatus.VERIFIED
                ? DocumentEvidenceStatus.VERIFIED
                : DocumentEvidenceStatus.NEEDS_REVIEW,
          },
        });
      } else if (outcome.status === AIJobStatus.NEEDS_REVIEW) {
        await tx.documentEvidence.update({
          where: { id: job.documentEvidenceId },
          data: { status: DocumentEvidenceStatus.NEEDS_REVIEW },
        });
      }

      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: job.id,
          action: 'SUBMIT_RESULT',
          actorUserId: user.userId,
          afterState: { validatedStatus: outcome.status, notes: outcome.notes },
        },
        tx,
      );

      return {
        job: updatedJob,
        extraction,
        tripId: job.documentEvidence.tripId,
      };
    });

    if (
      result.job.jobType === AIJobType.PHOTO_CHECK &&
      result.job.status === AIJobStatus.VERIFIED
    ) {
      await this.documentEvidenceService.recomputeTripCompletion(
        user,
        result.tripId,
      );
    }
    return { ...result.job, extractionResult: result.extraction };
  }

  private async validate(
    tx: Prisma.TransactionClient,
    job: {
      jobType: AIJobType;
      documentEvidence: { id: string; fileHash: string; tripId: string };
    },
    dto: SubmitAiResultDto,
  ): Promise<ValidationOutcome> {
    if (dto.confidence !== undefined && dto.confidence < CONFIDENCE_THRESHOLD) {
      return {
        status: AIJobStatus.NEEDS_REVIEW,
        notes: `Độ tin cậy AI dưới ngưỡng (${dto.confidence} < ${CONFIDENCE_THRESHOLD})`,
      };
    }

    if (job.jobType === AIJobType.PHOTO_CHECK) {
      if (!dto.containerNumber && !dto.plateNumber) {
        return {
          status: AIJobStatus.NEEDS_REVIEW,
          notes: 'Thiếu số container/biển số để đối chiếu',
        };
      }
      if (dto.containerNumber && !isValidContainerNumber(dto.containerNumber)) {
        return {
          status: AIJobStatus.NEEDS_REVIEW,
          notes: 'Số container không hợp lệ (sai check digit ISO 6346)',
        };
      }
      if (dto.plateNumber) {
        const trip = await tx.trip.findUnique({
          where: { id: job.documentEvidence.tripId },
        });
        if (trip?.vehicleId) {
          const vehicle = await tx.vehicle.findUnique({
            where: { id: trip.vehicleId },
          });
          if (
            vehicle &&
            vehicle.plateNumber.replaceAll(' ', '').toUpperCase() !==
              dto.plateNumber.replaceAll(' ', '').toUpperCase()
          ) {
            return {
              status: AIJobStatus.NEEDS_REVIEW,
              notes: 'Biển số AI đọc được không khớp xe đã phân công',
            };
          }
        }
      }
      return { status: AIJobStatus.VERIFIED };
    }

    // INVOICE_OCR
    if (!dto.invoice) {
      return {
        status: AIJobStatus.NEEDS_REVIEW,
        notes: 'Không có dữ liệu hóa đơn trích xuất',
      };
    }
    if (
      !isInvoiceTotalConsistent(
        dto.invoice.subtotal,
        dto.invoice.vatAmount,
        dto.invoice.total,
      )
    ) {
      return {
        status: AIJobStatus.NEEDS_REVIEW,
        notes: 'Tổng tiền không khớp: total phải bằng subtotal + vatAmount',
      };
    }
    if (!isInvoiceDateValid(new Date(dto.invoice.invoiceDate))) {
      return {
        status: AIJobStatus.NEEDS_REVIEW,
        notes: 'Ngày hóa đơn ở tương lai',
      };
    }
    const duplicate = await tx.aIExtractionResult.findFirst({
      where: {
        invoiceIssuer: dto.invoice.issuer,
        invoiceNumber: dto.invoice.invoiceNumber,
        invoiceDate: new Date(dto.invoice.invoiceDate),
      },
    });
    if (duplicate) {
      return {
        status: AIJobStatus.NEEDS_REVIEW,
        notes:
          'Trùng số hóa đơn/nhà phát hành/ngày với hóa đơn đã đọc trước đó',
      };
    }

    const duplicateFile = await tx.documentEvidence.findFirst({
      where: {
        fileHash: job.documentEvidence.fileHash,
        id: { not: job.documentEvidence.id },
      },
    });
    if (duplicateFile) {
      return {
        status: AIJobStatus.NEEDS_REVIEW,
        notes: 'Tệp hóa đơn trùng hash với chứng từ khác',
      };
    }

    return { status: AIJobStatus.VERIFIED };
  }

  private async transitionJob(
    user: AuthenticatedUser,
    id: string,
    from: AIJobStatus,
    to: AIJobStatus,
    action: string,
    errorMessage?: string,
  ) {
    const before = await this.prisma.aIProcessingJob.findUnique({
      where: { id },
      include: { documentEvidence: true },
    });
    if (!before) throw new NotFoundException('Không tìm thấy job AI');
    assertBranchScope(user, before.documentEvidence.branchId);
    if (before.status !== from)
      throw new BadRequestException(`Job phải ở trạng thái ${from}`);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.aIProcessingJob.update({
        where: { id },
        data: {
          status: to,
          ...(to === AIJobStatus.FAILED
            ? { errorMessage, completedAt: new Date() }
            : {}),
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
          action,
          actorUserId: user.userId,
          reason: errorMessage,
          beforeState: { status: before.status },
          afterState: {
            status: after.status,
            errorMessage: after.errorMessage,
          },
        },
        tx,
      );
      return after;
    });
  }
}
