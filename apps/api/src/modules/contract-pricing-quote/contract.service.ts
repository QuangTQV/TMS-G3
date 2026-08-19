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
import { CreateContractDto } from './dto/create-contract.dto';

const ENTITY_TYPE = 'Contract';

@Injectable()
export class ContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateContractDto) {
    const existing = await this.prisma.contract.findUnique({
      where: { code: dto.code },
    });
    if (existing)
      throw new ConflictException(`Mã hợp đồng ${dto.code} đã tồn tại`);

    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.create({
        data: {
          branchId: user.branchId,
          customerId: dto.customerId,
          code: dto.code,
          effectiveFrom: new Date(dto.effectiveFrom),
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: contract.id,
          action: 'CREATE',
          actorUserId: user.userId,
          afterState: contract,
        },
        tx,
      );
      return contract;
    });
  }

  async findMany(
    user: AuthenticatedUser,
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await this.prisma.contract.findMany({
      where: { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return toCursorPage(rows, limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: { priceLists: true },
    });
    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
    assertBranchScope(user, contract.branchId);
    return contract;
  }
}
