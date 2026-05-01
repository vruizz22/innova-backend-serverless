import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface AssignmentView {
  id: string;
  studentId: string;
  itemIds: string[];
  dueAt?: string;
}

@Injectable()
export class PracticeService {
  createAssignment(
    studentId: string,
    itemIds: string[],
    dueAt?: string,
  ): AssignmentView {
    return {
      id: randomUUID(),
      studentId,
      itemIds,
      dueAt,
    };
  }
}
