import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { Role } from '@modules/auth/roles.enum';

@Injectable()
export class UserLinkerService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureUser(payload: {
    supabaseUid: string;
    email: string;
    role: string;
    name?: string;
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

    // Always ensure role profile exists. Supabase users never go through
    // /auth/register, so the Student/Teacher/Parent row may not exist yet —
    // even if the User row does (e.g. created before this fix was deployed).
    // findFirst on the unique userId index is fast and idempotent.
    await this.ensureRoleProfile(user.id, payload.role as Role, payload.name);

    return {
      id: user.id,
      email: user.email,
      supabaseUid: user.supabaseUid ?? payload.supabaseUid,
    };
  }

  private async ensureRoleProfile(
    userId: string,
    role: Role,
    name?: string,
  ): Promise<void> {
    if (role === Role.TEACHER) {
      const existing = await this.prisma.teacher.findFirst({
        where: { userId },
      });
      if (!existing) await this.prisma.teacher.create({ data: { userId } });
      return;
    }
    if (role === Role.PARENT) {
      const existing = await this.prisma.parent.findFirst({
        where: { userId },
      });
      if (!existing) await this.prisma.parent.create({ data: { userId } });
      return;
    }
    if (role === Role.STUDENT) {
      const existing = await this.prisma.student.findFirst({
        where: { userId },
        select: { id: true, displayName: true },
      });
      if (!existing) {
        await this.prisma.student.create({
          data: { userId, displayName: name ?? 'Nuevo Alumno' },
        });
      } else if (name && existing.displayName === 'Nuevo Alumno') {
        await this.prisma.student.update({
          where: { id: existing.id },
          data: { displayName: name },
        });
      }
    }
  }
}
