import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private connected = false;

  constructor() {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) throw new Error('DATABASE_URL env var is not set');
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureConnected();
  }

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
