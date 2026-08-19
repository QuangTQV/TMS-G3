import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/auth/jwt-payload.interface';
import { assertBranchScope } from '../../common/auth/data-scope.util';
import { toCursorPage } from '../../common/pagination/paginate';
import { CreateDriverDto } from './dto/create-driver.dto';

@Injectable()
export class DriverService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUser, dto: CreateDriverDto) {
    return this.prisma.driver.create({
      data: { branchId: user.branchId, ...dto },
    });
  }

  async findMany(
    user: AuthenticatedUser,
    cursor: string | undefined,
    limit: number,
  ) {
    const rows = await this.prisma.driver.findMany({
      where: { branchId: user.branchId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return toCursorPage(rows, limit);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) throw new NotFoundException('Không tìm thấy tài xế');
    assertBranchScope(user, driver.branchId);
    return driver;
  }
}
