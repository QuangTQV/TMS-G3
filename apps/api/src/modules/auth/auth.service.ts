import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../common/auth/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    // Không phân biệt "email không tồn tại" và "sai mật khẩu" trong message trả về —
    // tránh lộ thông tin tài khoản nào tồn tại.
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sai email hoặc mật khẩu');
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);
    if (!passwordValid) {
      throw new UnauthorizedException('Sai email hoặc mật khẩu');
    }

    const roles = user.roles.map((ur) => ur.role.code);
    const permissions = Array.from(
      new Set(
        user.roles.flatMap((ur) =>
          ur.role.permissions.map((rp) => rp.permission.code),
        ),
      ),
    );

    const payload: JwtPayload = {
      sub: user.id,
      branchId: user.branchId,
      roles,
      permissions,
    };

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        branchId: user.branchId,
        roles,
        permissions,
      },
    };
  }

  static async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain);
  }
}
