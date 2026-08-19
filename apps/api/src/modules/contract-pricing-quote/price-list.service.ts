import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PriceListStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { assertBranchScope } from '../../common/auth/data-scope.util';
import { CreatePriceListDto } from './dto/create-price-list.dto';

const ENTITY_TYPE = 'PriceList';

@Injectable()
export class PriceListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreatePriceListDto) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: dto.contractId },
    });
    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
    assertBranchScope(user, contract.branchId);

    const latestVersion = await this.prisma.priceList.count({
      where: { contractId: dto.contractId },
    });

    return this.prisma.$transaction(async (tx) => {
      const priceList = await tx.priceList.create({
        data: {
          contractId: dto.contractId,
          version: latestVersion + 1,
          effectiveFrom: new Date(dto.effectiveFrom),
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
          lines: { create: dto.lines },
          surcharges: { create: dto.surcharges },
        },
        include: { lines: true, surcharges: true },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: priceList.id,
          action: 'CREATE',
          actorUserId: user.userId,
          afterState: priceList,
        },
        tx,
      );
      return priceList;
    });
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const priceList = await this.prisma.priceList.findUnique({
      where: { id },
      include: { lines: true, surcharges: true, contract: true },
    });
    if (!priceList) throw new NotFoundException('Không tìm thấy bảng giá');
    assertBranchScope(user, priceList.contract.branchId);
    return priceList;
  }

  /** Phiên bản, hiệu lực, duyệt và lịch sử thay đổi bảng giá — phân hệ module 3. */
  async approve(user: AuthenticatedUser, id: string) {
    const before = await this.findOne(user, id);
    if (
      before.status !== PriceListStatus.DRAFT &&
      before.status !== PriceListStatus.PENDING_APPROVAL
    ) {
      throw new BadRequestException(
        'Chỉ bảng giá ở trạng thái nháp/chờ duyệt mới có thể duyệt',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Bảng giá ACTIVE trước đó của cùng hợp đồng chuyển sang SUPERSEDED khi có
      // bảng giá mới được duyệt — chỉ một bảng giá ACTIVE tại một thời điểm.
      await tx.priceList.updateMany({
        where: {
          contractId: before.contractId,
          status: PriceListStatus.ACTIVE,
        },
        data: { status: PriceListStatus.SUPERSEDED },
      });

      const after = await tx.priceList.update({
        where: { id },
        data: {
          status: PriceListStatus.ACTIVE,
          approvedAt: new Date(),
          approvedByUserId: user.userId,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
          action: 'APPROVE',
          actorUserId: user.userId,
          beforeState: { status: before.status },
          afterState: { status: after.status },
        },
        tx,
      );
      return after;
    });
  }
}
