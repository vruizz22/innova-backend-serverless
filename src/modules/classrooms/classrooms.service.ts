import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Classroom, ClassroomInvite } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { CreateClassroomDto } from '@modules/classrooms/dto/create-classroom.dto';

export type ClassroomWithInviteUrl = Classroom & { inviteCode?: string };

@Injectable()
export class ClassroomsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForTeacher(
    teacherUserId: string,
    dto: CreateClassroomDto,
  ): Promise<Classroom> {
    await this.prisma.ensureConnected();

    const teacher = await this.prisma.teacher.findFirst({
      where: { userId: teacherUserId },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher profile not found for current user');
    }

    const classroom = await this.prisma.classroom.create({
      data: {
        name: dto.name,
        description: dto.description,
        teachers: {
          create: { teacherId: teacher.id },
        },
      },
    });

    return classroom;
  }

  async findMineAsTeacher(teacherUserId: string): Promise<Classroom[]> {
    await this.prisma.ensureConnected();

    const teacher = await this.prisma.teacher.findFirst({
      where: { userId: teacherUserId },
    });

    if (!teacher) return [];

    const links = await this.prisma.teacherClassroom.findMany({
      where: { teacherId: teacher.id },
      include: { classroom: true },
      orderBy: { createdAt: 'asc' },
    });

    return links.map((l) => l.classroom);
  }

  async findById(id: string): Promise<Classroom | null> {
    await this.prisma.ensureConnected();
    return this.prisma.classroom.findUnique({ where: { id } });
  }

  async createInvite(
    classroomId: string,
    teacherUserId: string,
    practiceBaseUrl: string,
  ): Promise<{ code: string; url: string }> {
    await this.prisma.ensureConnected();

    const teacher = await this.prisma.teacher.findFirst({
      where: { userId: teacherUserId },
    });

    if (!teacher) {
      throw new ForbiddenException('Teacher profile not found');
    }

    const link = await this.prisma.teacherClassroom.findFirst({
      where: { teacherId: teacher.id, classroomId },
    });

    if (!link) {
      throw new ForbiddenException('You do not own this classroom');
    }

    const invite: ClassroomInvite = await this.prisma.classroomInvite.create({
      data: {
        classroomId,
        createdBy: teacher.id,
      },
    });

    const base = practiceBaseUrl.replace(/\/$/, '');
    return {
      code: invite.code,
      url: `${base}/join?code=${invite.code}`,
    };
  }

  async findMineAsStudent(studentUserId: string): Promise<Classroom[]> {
    await this.prisma.ensureConnected();

    const student = await this.prisma.student.findFirst({
      where: { userId: studentUserId },
      include: { classroom: true },
    });

    if (!student?.classroom) return [];
    return [student.classroom];
  }

  async joinWithCode(code: string, studentUserId: string): Promise<Classroom> {
    await this.prisma.ensureConnected();

    const invite = await this.prisma.classroomInvite.findUnique({
      where: { code },
      include: { classroom: true },
    });

    if (!invite) throw new NotFoundException('Invalid invitation code');

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException('Invitation code has expired');
    }

    if (invite.maxUses !== null && invite.useCount >= invite.maxUses) {
      throw new BadRequestException(
        'Invitation code has reached its usage limit',
      );
    }

    const student = await this.prisma.student.findFirst({
      where: { userId: studentUserId },
    });

    if (!student) throw new NotFoundException('Student profile not found');

    await this.prisma.$transaction([
      this.prisma.student.update({
        where: { id: student.id },
        data: { classroomId: invite.classroomId },
      }),
      this.prisma.classroomInvite.update({
        where: { id: invite.id },
        data: { useCount: invite.useCount + 1 },
      }),
    ]);

    return invite.classroom;
  }
}
