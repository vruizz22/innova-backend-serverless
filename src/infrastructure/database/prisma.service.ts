import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private connected = false;

  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
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
