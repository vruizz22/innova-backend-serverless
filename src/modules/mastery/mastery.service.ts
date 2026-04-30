import { Injectable } from '@nestjs/common';

export interface MasteryState {
  studentId: string;
  skillKey: string;
  pKnown: number;
}

@Injectable()
export class MasteryService {
  private readonly masteryStore = new Map<string, MasteryState>();

  applyAttempt(
    studentId: string,
    skillKey: string,
    isCorrect: boolean,
  ): Promise<MasteryState> {
    const key = `${studentId}:${skillKey}`;
    const existing = this.masteryStore.get(key) ?? {
      studentId,
      skillKey,
      pKnown: 0.2,
    };

    const pT = 0.1;
    const pS = 0.02;
    const pG = 0.2;

    const prior = existing.pKnown;
    const posteriorGivenObs = isCorrect
      ? ((1 - pS) * prior) / ((1 - pS) * prior + pG * (1 - prior))
      : (pS * prior) / (pS * prior + (1 - pG) * (1 - prior));

    const updated = Math.min(
      1,
      Math.max(0, posteriorGivenObs + (1 - posteriorGivenObs) * pT),
    );
    const state: MasteryState = { ...existing, pKnown: updated };
    this.masteryStore.set(key, state);
    return Promise.resolve(state);
  }

  getStudentMastery(studentId: string): Promise<MasteryState[]> {
    return Promise.resolve(
      [...this.masteryStore.values()].filter(
        (state) => state.studentId === studentId,
      ),
    );
  }
}
