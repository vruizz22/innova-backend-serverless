import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import jwt from 'jsonwebtoken';
import { UsersService } from '@modules/auth/users.service';
import { Role } from '@modules/auth/roles.enum';
import {
  LOCAL_AUTH_ACCESS_SECRET,
  LOCAL_AUTH_ISSUER,
} from '@modules/auth/auth.constants';

export interface CognitoJwtPayload {
  sub: string;
  email?: string;
  'cognito:groups'?: string[];
  role?: Role;
  token_use: string;
  iss: string;
  exp: number;
  iat: number;
}

export interface LinkedPrismaUser {
  id: string;
  email: string;
  cognitoSub: string | null;
  tokenVersion?: number;
}

export interface AuthenticatedPrincipal {
  sub: string;
  email?: string;
  role?: Role;
  prismaUser: LinkedPrismaUser | null;
  token_use: string;
  iss: string;
  exp: number;
  iat: number;
  tokenVersion: number;
}

type RequestLike = { headers: { authorization?: string } };

function extractBearerToken(req: RequestLike): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    const region = process.env['COGNITO_REGION'] ?? 'us-east-1';
    const userPoolId = process.env['COGNITO_USER_POOL_ID'] ?? '';
    const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    const cognitoJwtSecret = passportJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      jwksUri: `${issuer}/.well-known/jwks.json`,
    });

    super({
      jwtFromRequest: extractBearerToken,
      secretOrKeyProvider: (_request, rawJwtToken, done): void => {
        const decodedToken = jwt.decode(rawJwtToken as string, {
          complete: true,
        });
        const payload = decodedToken?.payload;

        if (
          payload &&
          typeof payload === 'object' &&
          'iss' in payload &&
          payload.iss === LOCAL_AUTH_ISSUER
        ) {
          done(null, LOCAL_AUTH_ACCESS_SECRET);
          return;
        }

        cognitoJwtSecret(_request, rawJwtToken, done);
      },
      algorithms: ['RS256', 'HS256'],
    });
  }

  // Passport supports async validate
  async validate(payload: CognitoJwtPayload): Promise<AuthenticatedPrincipal> {
    const isLocalToken = payload.iss === LOCAL_AUTH_ISSUER;
    const region = process.env['COGNITO_REGION'] ?? 'us-east-1';
    const userPoolId = process.env['COGNITO_USER_POOL_ID'] ?? '';
    const cognitoIssuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;

    if (payload.token_use !== 'access') {
      throw new UnauthorizedException('Only access tokens are allowed');
    }

    if (!isLocalToken && payload.iss !== cognitoIssuer) {
      throw new UnauthorizedException('Invalid token issuer');
    }

    const groups = payload['cognito:groups'] ?? [];
    let role: Role | undefined;
    if (groups && groups.length > 0) {
      const g = groups[0].toLowerCase();
      if (g === 'teacher' || g === 'teachers' || g === 'TEACHER')
        role = Role.TEACHER;
      if (g === 'student' || g === 'students' || g === 'STUDENT')
        role = Role.STUDENT;
      if (g === 'parent' || g === 'parents' || g === 'PARENT')
        role = Role.PARENT;
      if (g === 'admin' || g === 'admins' || g === 'ADMIN') role = Role.ADMIN;
    }

    if (isLocalToken) {
      const maybeRole = payload.role;
      if (maybeRole) role = maybeRole;
    }

    // attempt to find or link a Prisma user by cognito sub or email
    const prismaUser = await this.usersService.findOrLinkByPayload({
      sub: payload.sub,
      email: payload.email,
    });

    if (prismaUser?.tokenVersion !== undefined) {
      const tokenVersion =
        (payload as CognitoJwtPayload & { tokenVersion?: number })
          .tokenVersion ?? 0;
      if (tokenVersion !== prismaUser.tokenVersion) {
        throw new UnauthorizedException('Session has been revoked');
      }
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role,
      prismaUser,
      token_use: payload.token_use,
      iss: payload.iss,
      exp: payload.exp,
      iat: payload.iat,
      tokenVersion:
        (payload as CognitoJwtPayload & { tokenVersion?: number })
          .tokenVersion ?? 0,
    };
  }
}
