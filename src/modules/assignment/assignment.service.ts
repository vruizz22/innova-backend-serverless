import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma.service';
import {
  CreateAssignmentDto,
  AssignmentReason,
} from '@modules/assignment/dto/create-assignment.dto';

export interface ExerciseWithFisher {
  exerciseId: string;
  topicCode: string;
  prompt: string;
  irtA: number;
  irtB: number;
  fisherInformation: number;
  pCorrect: number;
}

function irt2PLProbability(theta: number, a: number, b: number): number {
  return 1 / (1 + Math.exp(-a * (theta - b)));
}

function fisherInformation(theta: number, a: number, b: number): number {
  const p = irt2PLProbability(theta, a, b);
  return a * a * p * (1 - p);
}

@Injectable()
export class AssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(teacherUserId: string, dto: CreateAssignmentDto) {
    await this.prisma.ensureConnected();

    const teacher = await this.prisma.teacher.findFirst({
      where: { userId: teacherUserId },
    });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const assignment = await this.prisma.assignment.create({
      data: {
        courseId: dto.courseId ?? null,
        createdByTeacherId: teacher.id,
        title: dto.title,
        reason: dto.reason,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        assignmentExercises: {
          create: dto.exerciseIds.map((exerciseId, sequence) => ({
            exerciseId,
            sequence,
          })),
        },
        targets: dto.studentIds
          ? {
              create: dto.studentIds.map((studentId) => ({
                studentId,
                status: 'PENDING',
              })),
            }
          : undefined,
      },
      include: {
        assignmentExercises: { include: { exercise: true } },
        targets: true,
      },
    });

    return assignment;
  }

  async recommendForStudent(
    studentId: string,
    topicId?: string,
    topN = 5,
  ): Promise<ExerciseWithFisher[]> {
    await this.prisma.ensureConnected();

    const masteryRecords = await this.prisma.studentTopicMastery.findMany({
      where: { studentId, ...(topicId ? { topicId } : {}) },
      include: {
        topic: {
          include: {
            prerequisites: { include: { prerequisite: true } },
          },
        },
      },
    });

    const results: ExerciseWithFisher[] = [];

    for (const mastery of masteryRecords) {
      const theta = mastery.pKnown;

      // Skip topic if any prerequisite has pKnown < 0.6
      const prereqsMet = mastery.topic.prerequisites.every((prereq) => {
        const prereqMastery = masteryRecords.find(
          (m) => m.topicId === prereq.prerequisiteTopicId,
        );
        return (prereqMastery?.pKnown ?? 0) >= 0.6;
      });
      if (!prereqsMet) continue;

      const exercises = await this.prisma.exercise.findMany({
        where: { topicId: mastery.topicId, status: 'ACTIVE' },
      });

      for (const exercise of exercises) {
        const fisher = fisherInformation(theta, exercise.irtA, exercise.irtB);
        const pCorrect = irt2PLProbability(theta, exercise.irtA, exercise.irtB);
        const content = exercise.content as Record<string, unknown>;
        const prompt =
          typeof content['prompt'] === 'string' ? content['prompt'] : '';

        results.push({
          exerciseId: exercise.id,
          topicCode: mastery.topic.code,
          prompt,
          irtA: exercise.irtA,
          irtB: exercise.irtB,
          fisherInformation: fisher,
          pCorrect,
        });
      }
    }

    return results
      .sort((a, b) => b.fisherInformation - a.fisherInformation)
      .slice(0, topN);
  }

  async findByStudent(studentId: string) {
    await this.prisma.ensureConnected();
    return this.prisma.assignmentTarget.findMany({
      where: { studentId, assignment: { kind: { not: 'GUIDE' } } },
      include: {
        assignment: {
          include: {
            assignmentExercises: {
              include: { exercise: { include: { topic: true } } },
              orderBy: { sequence: 'asc' },
            },
          },
        },
      },
      orderBy: { assignment: { createdAt: 'desc' } },
    });
  }

  async createRecommended(
    teacherUserId: string,
    studentId: string,
    topicId?: string,
  ) {
    const recommended = await this.recommendForStudent(studentId, topicId);
    if (recommended.length === 0) {
      throw new NotFoundException(
        'No exercises found matching student mastery level',
      );
    }
    return this.create(teacherUserId, {
      studentIds: [studentId],
      exerciseIds: recommended.map((r) => r.exerciseId),
      title: `Práctica recomendada — ${recommended[0].topicCode}`,
      reason: AssignmentReason.PRACTICE_RECOMMENDER,
    });
  }
}
