import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private connected = false;

  /**
   * Lazy connect to Prisma. Call `ensureConnected()` from consumers
   * before issuing queries in serverless handlers to avoid connection leaks.
   */
  async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.$connect();
      this.connected = true;
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.$disconnect();
      this.connected = false;
    }
  }
}
