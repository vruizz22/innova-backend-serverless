import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import {
  LOCAL_AUTH_ACCESS_SECRET,
  LOCAL_AUTH_ACCESS_TTL,
  LOCAL_AUTH_ISSUER,
  LOCAL_AUTH_REFRESH_SECRET,
  LOCAL_AUTH_REFRESH_TTL,
  LOCAL_AUTH_RESET_SECRET,
  LOCAL_AUTH_RESET_TTL,
} from '@modules/auth/auth.constants';
import { Role } from '@modules/auth/roles.enum';

export interface LocalAuthTokenClaims extends JwtPayload {
  sub: string;
  email: string;
  role: Role;
  token_use: 'access' | 'refresh' | 'reset';
  tokenVersion: number;
  iss: string;
}

export interface LocalAuthSession {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
}

@Injectable()
export class AuthTokenService {
  signAccessToken(params: {
    sub: string;
    email: string;
    role: Role;
    tokenVersion: number;
  }): string {
    return jwt.sign(
      {
        sub: params.sub,
        email: params.email,
        role: params.role,
        token_use: 'access',
        tokenVersion: params.tokenVersion,
        iss: LOCAL_AUTH_ISSUER,
      } satisfies LocalAuthTokenClaims,
      LOCAL_AUTH_ACCESS_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: LOCAL_AUTH_ACCESS_TTL,
      },
    );
  }

  signRefreshToken(params: {
    sub: string;
    email: string;
    role: Role;
    tokenVersion: number;
  }): string {
    return jwt.sign(
      {
        sub: params.sub,
        email: params.email,
        role: params.role,
        token_use: 'refresh',
        tokenVersion: params.tokenVersion,
        iss: LOCAL_AUTH_ISSUER,
      } satisfies LocalAuthTokenClaims,
      LOCAL_AUTH_REFRESH_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: LOCAL_AUTH_REFRESH_TTL,
      },
    );
  }

  signResetToken(params: { email: string; tokenVersion: number }): string {
    return jwt.sign(
      {
        jti: randomUUID(),
        email: params.email,
        token_use: 'reset',
        tokenVersion: params.tokenVersion,
        iss: LOCAL_AUTH_ISSUER,
      },
      LOCAL_AUTH_RESET_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: LOCAL_AUTH_RESET_TTL,
      },
    );
  }

  verifyAccessToken(token: string): LocalAuthTokenClaims {
    return jwt.verify(token, LOCAL_AUTH_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: LOCAL_AUTH_ISSUER,
    }) as LocalAuthTokenClaims;
  }

  verifyRefreshToken(token: string): LocalAuthTokenClaims {
    return jwt.verify(token, LOCAL_AUTH_REFRESH_SECRET, {
      algorithms: ['HS256'],
      issuer: LOCAL_AUTH_ISSUER,
    }) as LocalAuthTokenClaims;
  }

  verifyResetToken(token: string): JwtPayload {
    return jwt.verify(token, LOCAL_AUTH_RESET_SECRET, {
      algorithms: ['HS256'],
      issuer: LOCAL_AUTH_ISSUER,
    }) as JwtPayload;
  }

  buildSession(params: {
    sub: string;
    email: string;
    role: Role;
    tokenVersion: number;
  }): LocalAuthSession {
    const accessToken = this.signAccessToken(params);
    const refreshToken = this.signRefreshToken(params);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresInSeconds: 60 * 60,
    };
  }
}
