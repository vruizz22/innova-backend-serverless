import { Injectable } from '@nestjs/common';

@Injectable()
export class CognitoAdapter {
  getUserById(userId: string): Promise<{ id: string; email: string } | null> {
    if (!userId) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      id: userId,
      email: `${userId}@example.com`,
    });
  }
}
