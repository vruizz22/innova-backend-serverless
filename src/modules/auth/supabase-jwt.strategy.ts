import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { Role } from '@modules/auth/roles.enum';
import { UserLinkerService } from '@modules/auth/user-linker.service';

interface SupabaseJwtPayload {
  sub: string;
  email: string;
  aud: string;
  exp: number;
  iat: number;
  app_metadata?: { role?: string; provider?: string; [k: string]: unknown };
  user_metadata?: Record<string, unknown>;
}

export interface SupabaseUser {
  supabaseUid: string;
  email: string;
  role: Role;
  prismaUserId: string;
}

function toRole(raw: string | undefined): Role {
  if (raw === Role.TEACHER) return Role.TEACHER;
  if (raw === Role.PARENT) return Role.PARENT;
  if (raw === Role.ADMIN) return Role.ADMIN;
  return Role.STUDENT;
}

@Injectable()
export class SupabaseJwtStrategy extends PassportStrategy(
  Strategy,
  'supabase-jwt',
) {
  constructor(
    config: ConfigService,
    private readonly userLinker: UserLinkerService,
  ) {
    const supabaseUrl = config.getOrThrow<string>('SUPABASE_URL');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      audience: 'authenticated',
      issuer: `${supabaseUrl}/auth/v1`,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      }),
    });
  }

  async validate(payload: SupabaseJwtPayload): Promise<SupabaseUser> {
    const role = toRole(payload.app_metadata?.role);
    const user = await this.userLinker.ensureUser({
      supabaseUid: payload.sub,
      email: payload.email,
      role,
    });
    return {
      supabaseUid: payload.sub,
      email: payload.email,
      role,
      prismaUserId: user.id,
    };
  }
}
