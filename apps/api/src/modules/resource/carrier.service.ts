import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { assertBranchScope } from '../../common/auth/data-scope.util';
import { toCursorPage } from '../../common/pagination/paginate';
import { CreateCarrierDto } from './dto/create-carrier.dto';

@Injectable()
export class CarrierService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUser, dto: CreateCarrierDto) {
    const existing = await this.prisma.carrier.findUnique({
      where: { code: dto.code },
    });
    if (existing)
      throw new ConflictException(`Mã nhà vận tải ${dto.code} đã tồn tại`);

    return this.prisma.carrier.create({
      data: { branchId: user.branchId, ...dto },
    });
  }

  async findMany(
    user: AuthenticatedUser,
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await this.prisma.carrier.findMany({
      where: { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return toCursorPage(rows, limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const carrier = await this.prisma.carrier.findUnique({ where: { id } });
    if (!carrier) throw new NotFoundException('Không tìm thấy nhà vận tải');
    assertBranchScope(user, carrier.branchId);
    return carrier;
  }
}
