import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdvanceStatus,
  TripCostActualStatus,
  TripStatus,
} from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { assertBranchScope } from '../../common/auth/data-scope.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAdvanceDto,
  CreateTripCostActualDto,
  CreateTripCostPlanDto,
} from './dto/trip-cost.dto';

@Injectable()
export class TripCostService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async summary(user: AuthenticatedUser, tripId: string) {
    const trip = await this.getTrip(user, tripId);
    const [plans, actuals, advances] = await Promise.all([
      this.prisma.tripCostPlan.findMany({
        where: { tripId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tripCostActual.findMany({
        where: { tripId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.advance.findMany({
        where: { tripId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const sum = (rows: Array<{ amount: { toNumber(): number } }>) =>
      rows.reduce((total, row) => total + row.amount.toNumber(), 0);
    return {
      tripId: trip.id,
      plans,
      actuals,
      advances,
      totals: {
        planned: sum(plans),
        actualApproved: sum(
          actuals.filter(
            (cost) => cost.status === TripCostActualStatus.APPROVED,
          ),
        ),
        advancePaid: sum(
          advances.filter((advance) => advance.status === AdvanceStatus.PAID),
        ),
      },
    };
  }

  async createPlan(
    user: AuthenticatedUser,
    tripId: string,
    dto: CreateTripCostPlanDto,
  ) {
    const trip = await this.getTrip(user, tripId);
    this.assertNotCancelled(trip.status);
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.tripCostPlan.create({
        data: {
          branchId: trip.branchId,
          tripId,
          ...dto,
          createdByUserId: user.userId,
        },
      });
      await this.auditLog.record(
        {
          entityType: 'TripCostPlan',
          entityId: plan.id,
          action: 'CREATE',
          actorUserId: user.userId,
          afterState: plan,
        },
        tx,
      );
      return plan;
    });
  }

  async createActual(
    user: AuthenticatedUser,
    tripId: string,
    dto: CreateTripCostActualDto,
  ) {
    const trip = await this.getTrip(user, tripId);
    const allowedTripStatuses: TripStatus[] = [
      TripStatus.COMPLETED_VERIFIED,
      TripStatus.CLOSED,
    ];
    if (!allowedTripStatuses.includes(trip.status)) {
      throw new BadRequestException(
        'Chỉ khai chi phí sau khi chuyến đã xác thực chứng từ',
      );
    }
    if (dto.evidenceId) await this.assertEvidence(user, trip, dto.evidenceId);
    return this.prisma.$transaction(async (tx) => {
      const actual = await tx.tripCostActual.create({
        data: {
          ...dto,
          branchId: trip.branchId,
          tripId,
          incurredAt: new Date(dto.incurredAt),
          submittedByUserId: user.userId,
        },
      });
      await this.auditLog.record(
        {
          entityType: 'TripCostActual',
          entityId: actual.id,
          action: 'CREATE_DRAFT',
          actorUserId: user.userId,
          afterState: actual,
        },
        tx,
      );
      return actual;
    });
  }

  /** Module 8 là nơi sở hữu phiếu chi phí. Module AI chỉ yêu cầu tạo nháp từ kết
   * quả OCR đã qua validate, tuyệt đối không tự duyệt hay tự sửa số tiền. */
  async createDraftFromAiJob(user: AuthenticatedUser, aiJobId: string) {
    const job = await this.prisma.aIProcessingJob.findUnique({
      where: { id: aiJobId },
      include: { documentEvidence: true, extractionResult: true },
    });
    if (!job || !job.extractionResult) {
      throw new NotFoundException('Không tìm thấy kết quả AI');
    }
    const extraction = job.extractionResult;
    assertBranchScope(user, job.documentEvidence.branchId);
    if (job.jobType !== 'INVOICE_OCR' || job.status !== 'VERIFIED') {
      throw new BadRequestException(
        'Chỉ kết quả OCR hóa đơn đã xác thực mới tạo được chi phí nháp',
      );
    }
    if (extraction.invoiceTotal === null) {
      throw new BadRequestException('Kết quả OCR không có tổng tiền hóa đơn');
    }
    const invoiceTotal = extraction.invoiceTotal;
    return this.prisma.$transaction(async (tx) => {
      const actual = await tx.tripCostActual.create({
        data: {
          branchId: job.documentEvidence.branchId,
          tripId: job.documentEvidence.tripId,
          category: 'OTHER',
          description:
            `OCR hóa đơn ${extraction.invoiceNumber ?? ''} - ${extraction.invoiceIssuer ?? ''}`.trim(),
          amount: invoiceTotal,
          incurredAt: extraction.invoiceDate ?? new Date(),
          evidenceId: job.documentEvidenceId,
          submittedByUserId: user.userId,
        },
      });
      await this.auditLog.record(
        {
          entityType: 'TripCostActual',
          entityId: actual.id,
          action: 'CREATE_FROM_AI',
          actorUserId: user.userId,
          afterState: {
            aiJobId,
            amount: actual.amount,
            evidenceId: actual.evidenceId,
          },
        },
        tx,
      );
      return actual;
    });
  }

  async submitActual(user: AuthenticatedUser, id: string) {
    return this.changeActualStatus(
      user,
      id,
      TripCostActualStatus.DRAFT,
      TripCostActualStatus.SUBMITTED,
      'SUBMIT',
    );
  }

  async approveActual(user: AuthenticatedUser, id: string) {
    const result = await this.changeActualStatus(
      user,
      id,
      TripCostActualStatus.SUBMITTED,
      TripCostActualStatus.APPROVED,
      'APPROVE',
      {
        approvedByUserId: user.userId,
        approvedAt: new Date(),
        rejectionReason: null,
      },
    );
    return result;
  }

  async rejectActual(user: AuthenticatedUser, id: string, reason: string) {
    return this.changeActualStatus(
      user,
      id,
      TripCostActualStatus.SUBMITTED,
      TripCostActualStatus.REJECTED,
      'REJECT',
      { rejectionReason: reason },
      reason,
    );
  }

  async createAdvance(
    user: AuthenticatedUser,
    tripId: string,
    dto: CreateAdvanceDto,
  ) {
    const trip = await this.getTrip(user, tripId);
    this.assertNotCancelled(trip.status);
    return this.prisma.$transaction(async (tx) => {
      const advance = await tx.advance.create({
        data: {
          branchId: trip.branchId,
          tripId,
          ...dto,
          requestedByUserId: user.userId,
        },
      });
      await this.auditLog.record(
        {
          entityType: 'Advance',
          entityId: advance.id,
          action: 'REQUEST',
          actorUserId: user.userId,
          afterState: advance,
        },
        tx,
      );
      return advance;
    });
  }

  async approveAdvance(user: AuthenticatedUser, id: string) {
    return this.changeAdvanceStatus(
      user,
      id,
      AdvanceStatus.REQUESTED,
      AdvanceStatus.APPROVED,
      'APPROVE',
      { approvedByUserId: user.userId },
    );
  }

  async markAdvancePaid(user: AuthenticatedUser, id: string) {
    return this.changeAdvanceStatus(
      user,
      id,
      AdvanceStatus.APPROVED,
      AdvanceStatus.PAID,
      'PAY',
      { paidByUserId: user.userId, paidAt: new Date() },
    );
  }

  async settleAdvance(user: AuthenticatedUser, id: string) {
    return this.changeAdvanceStatus(
      user,
      id,
      AdvanceStatus.PAID,
      AdvanceStatus.SETTLED,
      'SETTLE',
      { settledAt: new Date() },
    );
  }

  async cancelAdvance(user: AuthenticatedUser, id: string, reason: string) {
    const advance = await this.prisma.advance.findUnique({ where: { id } });
    if (!advance) throw new NotFoundException('Không tìm thấy tạm ứng');
    assertBranchScope(user, advance.branchId);
    const nonCancellableStatuses: AdvanceStatus[] = [
      AdvanceStatus.PAID,
      AdvanceStatus.SETTLED,
      AdvanceStatus.CANCELLED,
    ];
    if (nonCancellableStatuses.includes(advance.status)) {
      throw new BadRequestException(
        'Tạm ứng ở trạng thái hiện tại không thể hủy',
      );
    }
    return this.changeAdvanceStatus(
      user,
      id,
      advance.status,
      AdvanceStatus.CANCELLED,
      'CANCEL',
      { cancelReason: reason },
      reason,
    );
  }

  private async changeActualStatus(
    user: AuthenticatedUser,
    id: string,
    from: TripCostActualStatus,
    to: TripCostActualStatus,
    action: string,
    data: object = {},
    reason?: string,
  ) {
    const before = await this.prisma.tripCostActual.findUnique({
      where: { id },
    });
    if (!before) throw new NotFoundException('Không tìm thấy chi phí thực tế');
    assertBranchScope(user, before.branchId);
    if (before.status !== from)
      throw new BadRequestException(`Chi phí phải ở trạng thái ${from}`);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.tripCostActual.update({
        where: { id },
        data: { status: to, ...data },
      });
      await this.auditLog.record(
        {
          entityType: 'TripCostActual',
          entityId: id,
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

  private async changeAdvanceStatus(
    user: AuthenticatedUser,
    id: string,
    from: AdvanceStatus,
    to: AdvanceStatus,
    action: string,
    data: object = {},
    reason?: string,
  ) {
    const before = await this.prisma.advance.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Không tìm thấy tạm ứng');
    assertBranchScope(user, before.branchId);
    if (before.status !== from)
      throw new BadRequestException(`Tạm ứng phải ở trạng thái ${from}`);
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.advance.update({
        where: { id },
        data: { status: to, ...data },
      });
      await this.auditLog.record(
        {
          entityType: 'Advance',
          entityId: id,
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

  private async getTrip(user: AuthenticatedUser, id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến');
    assertBranchScope(user, trip.branchId);
    return trip;
  }

  private assertNotCancelled(status: TripStatus) {
    if (status === TripStatus.CANCELLED)
      throw new BadRequestException(
        'Không thể ghi nhận tài chính cho chuyến đã hủy',
      );
  }

  private async assertEvidence(
    user: AuthenticatedUser,
    trip: { id: string; branchId: string },
    evidenceId: string,
  ) {
    const evidence = await this.prisma.documentEvidence.findUnique({
      where: { id: evidenceId },
    });
    if (
      !evidence ||
      evidence.tripId !== trip.id ||
      evidence.branchId !== trip.branchId
    ) {
      throw new BadRequestException('Chứng từ chi phí không thuộc chuyến này');
    }
    assertBranchScope(user, evidence.branchId);
  }
}
