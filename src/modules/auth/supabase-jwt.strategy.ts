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
  /**
   * Display name from `user_metadata.full_name`; falls back to the email local
   * part. Optional so existing test fixtures (and any non-JWT construction)
   * stay valid; the JWT strategy always populates it.
   */
  name?: string;
}

function toRole(raw: string | undefined, fallback?: string): Role {
  const candidate = raw ?? fallback;
  if (candidate === Role.TEACHER) return Role.TEACHER;
  if (candidate === Role.PARENT) return Role.PARENT;
  if (candidate === Role.ADMIN) return Role.ADMIN;
  return Role.STUDENT;
}

function toDisplayName(
  meta: Record<string, unknown> | undefined,
  email: string,
): string {
  for (const key of ['full_name', 'name', 'display_name']) {
    const value = meta?.[key];
    if (typeof value === 'string' && value.trim().length > 0)
      return value.trim();
  }
  return email.split('@')[0] ?? email;
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
      // Supabase signs user JWTs with asymmetric keys served via JWKS. New
      // projects default to ES256 (EC P-256); RS256 is used when the project's
      // signing key is RSA. Accept both so key rotation/algorithm choice does
      // not break auth — and so a local Supabase stack configured with either
      // key type validates identically to prod.
      algorithms: ['ES256', 'RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      }),
    });
  }

  async validate(payload: SupabaseJwtPayload): Promise<SupabaseUser> {
    // app_metadata.role is set by seed/admin; user_metadata.role is set by the
    // frontend at signup for users who never went through the admin provisioning.
    const roleMeta = payload.user_metadata?.['role'];
    const role = toRole(
      payload.app_metadata?.role,
      typeof roleMeta === 'string' ? roleMeta : undefined,
    );
    const user = await this.userLinker.ensureUser({
      supabaseUid: payload.sub,
      email: payload.email,
      role,
      name: toDisplayName(payload.user_metadata, payload.email),
    });
    return {
      supabaseUid: payload.sub,
      email: payload.email,
      role,
      prismaUserId: user.id,
      name: toDisplayName(payload.user_metadata, payload.email),
    };
  }
}
