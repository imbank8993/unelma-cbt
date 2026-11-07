import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      const dbName = process.env.DATABASE_URL?.split('/')?.pop()?.split('?')[0] || 'PostgreSQL';
      this.logger.log(`Prisma Client terhubung ke PostgreSQL (${dbName})`);
    } catch (error) {
      // Koneksi tidak diputus paksa: Prisma menyambung ulang secara malas pada
      // query pertama. Membuat bootstrap gagal di sini berarti seluruh API mati
      // hanya karena database sempat tidak terjangkau saat start.
      this.logger.warn(
        `Koneksi Prisma tertunda: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Prisma Client terputus dari PostgreSQL');
  }
}
