import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Course, ClassroomInvite } from '@prisma/client';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { CreateClassroomDto } from '@modules/classrooms/dto/create-classroom.dto';

export type CourseWithInviteUrl = Course & { inviteCode?: string };

@Injectable()
export class ClassroomsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForTeacher(
    teacherUserId: string,
    dto: CreateClassroomDto,
  ): Promise<Course> {
    await this.prisma.ensureConnected();

    const teacher = await this.prisma.teacher.findFirst({
      where: { userId: teacherUserId },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher profile not found for current user');
    }

    // Get or create a default subject for the demo
    const subject = await this.prisma.subject.findFirst({
      where: { code: 'MATH' },
    });
    if (!subject) {
      throw new NotFoundException(
        'Default subject MATH not found — run seed first',
      );
    }

    // Get or create a school for this teacher (use first available)
    const school = await this.prisma.school.findFirst();
    if (!school) {
      throw new NotFoundException('No school found — run seed first');
    }

    const course = await this.prisma.course.create({
      data: {
        name: dto.name,
        schoolId: school.id,
        subjectId: subject.id,
        gradeLevel: 4,
        academicYear: new Date().getFullYear(),
        courseTeachers: {
          create: { teacherId: teacher.id, role: 'LEAD' },
        },
      },
    });

    return course;
  }

  async findMineAsTeacher(teacherUserId: string): Promise<Course[]> {
    await this.prisma.ensureConnected();

    const teacher = await this.prisma.teacher.findFirst({
      where: { userId: teacherUserId },
    });

    if (!teacher) return [];

    const links = await this.prisma.courseTeacher.findMany({
      where: { teacherId: teacher.id },
      include: { course: true },
      orderBy: { addedAt: 'asc' },
    });

    return links.map((l) => l.course);
  }

  async findById(id: string): Promise<Course | null> {
    await this.prisma.ensureConnected();
    return this.prisma.course.findUnique({ where: { id } });
  }

  async createInvite(
    courseId: string,
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

    const link = await this.prisma.courseTeacher.findFirst({
      where: { teacherId: teacher.id, courseId },
    });

    if (!link) {
      throw new ForbiddenException('You do not own this course');
    }

    const invite: ClassroomInvite = await this.prisma.classroomInvite.create({
      data: {
        courseId,
        createdBy: teacher.id,
      },
    });

    const base = practiceBaseUrl.replace(/\/$/, '');
    return {
      code: invite.code,
      url: `${base}/join?code=${invite.code}`,
    };
  }

  async findMineAsStudent(studentUserId: string): Promise<Course[]> {
    await this.prisma.ensureConnected();

    const student = await this.prisma.student.findFirst({
      where: { userId: studentUserId },
      include: {
        enrollments: {
          where: { status: 'ACTIVE' },
          include: { course: true },
        },
      },
    });

    if (!student) return [];
    return student.enrollments.map((e) => e.course);
  }

  async joinWithCode(code: string, studentUserId: string): Promise<Course> {
    await this.prisma.ensureConnected();

    const invite = await this.prisma.classroomInvite.findUnique({
      where: { code },
      include: { course: true },
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
      this.prisma.enrollment.upsert({
        where: {
          courseId_studentId: {
            courseId: invite.courseId,
            studentId: student.id,
          },
        },
        update: { status: 'ACTIVE' },
        create: {
          courseId: invite.courseId,
          studentId: student.id,
          status: 'ACTIVE',
        },
      }),
      this.prisma.classroomInvite.update({
        where: { id: invite.id },
        data: { useCount: invite.useCount + 1 },
      }),
    ]);

    return invite.course;
  }
}
