import { createServer } from 'node:http';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { GradingRetryWorker } from './grading/grading-retry.worker';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { ProctoringModule } from './proctoring/proctoring.module';
import { ScoringModule } from './scoring/scoring.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    PrismaModule,
    AuthModule,
    ScoringModule,
    StorageModule,
    ProctoringModule,
  ],
})
class BackgroundWorkerModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(BackgroundWorkerModule);
  const logger = new Logger('BackgroundWorker');
  const prisma = app.get(PrismaService);
  app.get(GradingRetryWorker);
  const port = Number(process.env.CBT_BACKGROUND_WORKER_PORT || 3020);
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' || request.url !== '/health') {
      response.statusCode = 404;
      response.end(JSON.stringify({ ok: false }));
      return;
    }
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      response.end(JSON.stringify({ ok: true }));
    } catch {
      response.statusCode = 503;
      response.end(JSON.stringify({ ok: false }));
    }
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.listen(port, '0.0.0.0', () => logger.log(`Worker pemulihan nilai dan bukti siap di port ${port}`));

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
  };
  process.once('SIGTERM', () => void stop());
  process.once('SIGINT', () => void stop());
}

void bootstrap().catch((error) => {
  console.error('Background worker gagal dimulai:', error);
  process.exitCode = 1;
});
