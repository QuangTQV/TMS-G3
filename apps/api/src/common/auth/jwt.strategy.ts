import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // Giá trị trả về ở đây trở thành request.user — xem AuthenticatedUser.
  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      branchId: payload.branchId,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
