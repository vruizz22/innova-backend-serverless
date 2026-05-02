import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma.service';
import type { LinkedPrismaUser } from '@modules/auth/jwt.strategy';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByCognitoSub(cognitoSub: string): Promise<LinkedPrismaUser | null> {
    return this.prisma.user.findUnique({ where: { cognitoSub } });
  }

  async findByEmail(email: string): Promise<LinkedPrismaUser | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async linkCognitoSubToUser(
    userId: string,
    cognitoSub: string,
  ): Promise<LinkedPrismaUser> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { cognitoSub },
    });
  }

  /**
   * Find user by cognito sub or email. If user exists by email but missing cognitoSub,
   * link it automatically so subsequent logins map cleanly.
   */
  async findOrLinkByPayload(payload: {
    sub: string;
    email?: string;
  }): Promise<LinkedPrismaUser | null> {
    const { sub, email } = payload;
    if (!sub) return null;

    const bySub = await this.findByCognitoSub(sub);
    if (bySub) return bySub;

    if (email) {
      const byEmail = await this.findByEmail(email);
      if (byEmail) {
        // link the cognito sub for future fast lookups
        await this.linkCognitoSubToUser(byEmail.id, sub);
        return { ...byEmail, cognitoSub: sub };
      }
    }

    return null;
  }
}
