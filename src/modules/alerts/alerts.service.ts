import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface AlertView {
  id: string;
  classroomId: string;
  message: string;
  resolved: boolean;
}

@Injectable()
export class AlertsService {
  private readonly alerts = new Map<string, AlertView>();

  create(classroomId: string, message: string): AlertView {
    const created: AlertView = {
      id: randomUUID(),
      classroomId,
      message,
      resolved: false,
    };
    this.alerts.set(created.id, created);
    return created;
  }

  findByClassroom(classroomId: string): AlertView[] {
    return [...this.alerts.values()].filter(
      (alert) => alert.classroomId === classroomId,
    );
  }

  resolve(id: string): AlertView | null {
    const existing = this.alerts.get(id);
    if (!existing) {
      return null;
    }
    const updated: AlertView = { ...existing, resolved: true };
    this.alerts.set(id, updated);
    return updated;
  }
}
