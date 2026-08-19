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
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCreditTermsDto } from './dto/update-credit-terms.dto';
import { SetCustomerStatusDto } from './dto/set-customer-status.dto';

const ENTITY_TYPE = 'Customer';

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateCustomerDto) {
    const existing = await this.prisma.customer.findUnique({
      where: { code: dto.code },
    });
    if (existing)
      throw new ConflictException(`Mã khách hàng ${dto.code} đã tồn tại`);

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          branchId: user.branchId,
          code: dto.code,
          legalName: dto.legalName,
          taxCode: dto.taxCode,
          paymentTermDays: dto.paymentTermDays ?? 30,
          creditLimit: dto.creditLimit,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: customer.id,
          action: 'CREATE',
          actorUserId: user.userId,
          afterState: customer,
        },
        tx,
      );
      return customer;
    });
  }

  async findMany(
    user: AuthenticatedUser,
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await this.prisma.customer.findMany({
      where: { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return toCursorPage(rows, limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { contacts: true, locations: true },
    });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    assertBranchScope(user, customer.branchId);
    return customer;
  }

  /** Điều khoản thanh toán/hạn mức tín dụng — liên quan tiền, bắt buộc audit log + reason. */
  async updateCreditTerms(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateCreditTermsDto,
  ) {
    const before = await this.findOne(user, id);

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.customer.update({
        where: { id },
        data: {
          paymentTermDays: dto.paymentTermDays ?? before.paymentTermDays,
          creditLimit: dto.creditLimit ?? before.creditLimit,
        },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
          action: 'UPDATE_CREDIT_TERMS',
          actorUserId: user.userId,
          reason: dto.reason,
          beforeState: before,
          afterState: after,
        },
        tx,
      );
      return after;
    });
  }

  async setStatus(
    user: AuthenticatedUser,
    id: string,
    dto: SetCustomerStatusDto,
  ) {
    const before = await this.findOne(user, id);

    return this.prisma.$transaction(async (tx) => {
      const after = await tx.customer.update({
        where: { id },
        data: { status: dto.status },
      });
      await this.auditLog.record(
        {
          entityType: ENTITY_TYPE,
          entityId: id,
          action: dto.status === 'LOCKED' ? 'LOCK' : 'UNLOCK',
          actorUserId: user.userId,
          reason: dto.reason,
          beforeState: { status: before.status },
          afterState: { status: after.status },
        },
        tx,
      );
      return after;
    });
  }
}
