import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { UsersService } from '@modules/auth/users.service';
import { Role } from '@modules/auth/roles.enum';

export interface CognitoJwtPayload {
  sub: string;
  email?: string;
  'cognito:groups'?: string[];
  token_use: string;
  iss: string;
  exp: number;
  iat: number;
}

export interface LinkedPrismaUser {
  id: string;
  email: string;
  cognitoSub: string | null;
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

    super({
      jwtFromRequest: extractBearerToken,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: `${issuer}/.well-known/jwks.json`,
      }),
      issuer,
      algorithms: ['RS256'],
    });
  }

  // Passport supports async validate
  async validate(payload: CognitoJwtPayload): Promise<AuthenticatedPrincipal> {
    const groups = payload['cognito:groups'] ?? [];
    let role: Role | undefined;
    if (groups && groups.length > 0) {
      const g = groups[0].toLowerCase();
      if (g === 'teacher' || g === 'teachers' || g === 'TEACHER')
        role = Role.TEACHER;
      if (g === 'student' || g === 'students' || g === 'STUDENT')
        role = Role.STUDENT;
      if (g === 'admin' || g === 'admins' || g === 'ADMIN') role = Role.ADMIN;
    }

    // attempt to find or link a Prisma user by cognito sub or email
    const prismaUser = await this.usersService.findOrLinkByPayload({
      sub: payload.sub,
      email: payload.email,
    });

    return {
      sub: payload.sub,
      email: payload.email,
      role,
      prismaUser,
      token_use: payload.token_use,
      iss: payload.iss,
      exp: payload.exp,
      iat: payload.iat,
    };
  }
}
