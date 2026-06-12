import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma.service';

export interface AlertView {
  id: string;
  teacherId: string;
  courseId: string;
  topicId: string | null;
  studentId: string | null;
  alertType: string;
  severity: string;
  payload: unknown;
  createdAt: string;
  resolvedAt: string | null;
}

function toAlertView(a: {
  id: string;
  teacherId: string;
  courseId: string;
  topicId: string | null;
  studentId: string | null;
  alertType: string;
  severity: string;
  payload: unknown;
  createdAt: Date;
  resolvedAt: Date | null;
}): AlertView {
  return {
    id: a.id,
    teacherId: a.teacherId,
    courseId: a.courseId,
    topicId: a.topicId,
    studentId: a.studentId,
    alertType: a.alertType,
    severity: a.severity,
    payload: a.payload,
    createdAt: a.createdAt.toISOString(),
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: {
    teacherId: string;
    courseId: string;
    topicId?: string;
    studentId?: string;
    alertType: string;
    severity?: string;
    payload?: Record<string, unknown>;
  }): Promise<AlertView> {
    await this.prisma.ensureConnected();
    const alert = await this.prisma.teacherAlert.create({
      data: {
        teacherId: params.teacherId,
        courseId: params.courseId,
        topicId: params.topicId ?? null,
        studentId: params.studentId ?? null,
        alertType: params.alertType,
        severity: params.severity ?? 'MED',
        payload: (params.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
    return toAlertView(alert);
  }

  async findByCourse(courseId: string): Promise<AlertView[]> {
    await this.prisma.ensureConnected();
    const alerts = await this.prisma.teacherAlert.findMany({
      where: { courseId, resolvedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return alerts.map(toAlertView);
  }

  // Legacy compat
  async findByClassroom(courseId: string): Promise<AlertView[]> {
    return this.findByCourse(courseId);
  }

  async resolve(id: string): Promise<AlertView | null> {
    await this.prisma.ensureConnected();
    const existing = await this.prisma.teacherAlert.findUnique({
      where: { id },
    });
    if (!existing) return null;
    const updated = await this.prisma.teacherAlert.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });
    return toAlertView(updated);
  }
}
