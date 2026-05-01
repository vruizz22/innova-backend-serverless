import { Injectable } from '@nestjs/common';
import { TeacherAlert } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma.service';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    classroomId: string,
    message: string,
    teacherId: string,
  ): Promise<TeacherAlert> {
    await this.prisma.ensureConnected();
    return this.prisma.teacherAlert.create({
      data: { teacherId, classroomId, message },
    });
  }

  async findByClassroom(classroomId: string): Promise<TeacherAlert[]> {
    await this.prisma.ensureConnected();
    return this.prisma.teacherAlert.findMany({
      where: { classroomId, resolved: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolve(id: string): Promise<TeacherAlert | null> {
    await this.prisma.ensureConnected();
    const existing = await this.prisma.teacherAlert.findUnique({
      where: { id },
    });
    if (!existing) return null;
    return this.prisma.teacherAlert.update({
      where: { id },
      data: { resolved: true },
    });
  }
}
