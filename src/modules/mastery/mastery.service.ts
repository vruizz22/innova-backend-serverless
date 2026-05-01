import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/database/prisma.service';

export interface MasteryState {
  studentId: string;
  skillKey: string;
  pKnown: number;
}

@Injectable()
export class MasteryService {
  constructor(private readonly prisma: PrismaService) {}

  async applyAttempt(
    studentId: string,
    skillKey: string,
    isCorrect: boolean,
  ): Promise<MasteryState> {
    await this.prisma.ensureConnected();

    const skill = await this.prisma.skill.findUnique({
      where: { key: skillKey },
      include: { bktParams: true },
    });

    const pL0 = skill?.bktParams?.pL0 ?? 0.3;
    const pT = skill?.bktParams?.pT ?? 0.1;
    const pS = skill?.bktParams?.pS ?? 0.1;
    const pG = skill?.bktParams?.pG ?? 0.2;

    const existing = skill
      ? await this.prisma.studentSkillMastery.findUnique({
          where: { studentId_skillId: { studentId, skillId: skill.id } },
        })
      : null;

    const prior = existing?.pKnown ?? pL0;

    const posteriorGivenObs = isCorrect
      ? ((1 - pS) * prior) / ((1 - pS) * prior + pG * (1 - prior))
      : (pS * prior) / (pS * prior + (1 - pG) * (1 - prior));

    const pKnown = Math.min(
      1,
      Math.max(0, posteriorGivenObs + (1 - posteriorGivenObs) * pT),
    );

    if (skill) {
      await this.prisma.studentSkillMastery.upsert({
        where: { studentId_skillId: { studentId, skillId: skill.id } },
        create: { studentId, skillId: skill.id, pKnown },
        update: { pKnown },
      });
    }

    return { studentId, skillKey, pKnown };
  }

  async getStudentMastery(studentId: string): Promise<MasteryState[]> {
    await this.prisma.ensureConnected();
    const records = await this.prisma.studentSkillMastery.findMany({
      where: { studentId },
      include: { skill: true },
    });
    return records.map((r) => ({
      studentId,
      skillKey: r.skill.key,
      pKnown: r.pKnown,
    }));
  }
}
