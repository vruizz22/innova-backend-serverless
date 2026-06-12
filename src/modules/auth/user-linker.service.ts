import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma.service';

@Injectable()
export class UserLinkerService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureUser(payload: {
    supabaseUid: string;
    email: string;
    role: string;
  }): Promise<{ id: string; email: string; supabaseUid: string }> {
    const user = await this.prisma.user.upsert({
      where: { supabaseUid: payload.supabaseUid },
      create: {
        supabaseUid: payload.supabaseUid,
        email: payload.email,
        authRole: payload.role,
      },
      update: {},
      select: { id: true, email: true, supabaseUid: true },
    });
    // supabaseUid is always non-null here since we just upserted with it
    return {
      id: user.id,
      email: user.email,
      supabaseUid: user.supabaseUid ?? payload.supabaseUid,
    };
  }
}
