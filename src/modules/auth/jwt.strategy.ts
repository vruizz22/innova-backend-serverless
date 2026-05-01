import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

export interface CognitoJwtPayload {
  sub: string;
  email?: string;
  'cognito:groups'?: string[];
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
  constructor() {
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

  validate(payload: CognitoJwtPayload): CognitoJwtPayload {
    return payload;
  }
}
