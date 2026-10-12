import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { AuthController, AuthGuard, Public } from './auth.js';
import { IdentityController } from './identity.js';
import { logger, redis, sql } from './context.js';

@Controller()
class HealthController {
  @Public() @Get('health') health() {
    return { status: 'ok', service: 'api' };
  }
  @Public() @Get('ready') async ready() {
    try {
      await Promise.all([sql`select 1`, redis.ping()]);
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Dependencies unavailable');
    }
  }
}
@Module({
  controllers: [HealthController, AuthController, IdentityController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
class AppModule {}
const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn', 'log'],
  rawBody: true,
});
app.use(helmet());
app.use((req: Request, res: Response, next: NextFunction) => {
  const id = randomUUID();
  res.setHeader('x-request-id', id);
  const start = performance.now();
  res.on('finish', () =>
    logger.info(
      {
        requestId: id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        latencyMs: Math.round(performance.now() - start),
      },
      'HTTP request',
    ),
  );
  next();
});
app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });
const document = SwaggerModule.createDocument(
  app,
  new DocumentBuilder().setTitle('Flare API').setVersion('1').addBearerAuth().build(),
);
SwaggerModule.setup('docs', app, document);
await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
logger.info('Flare API listening');
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    void Promise.all([app.close(), sql.end(), redis.quit()]).then(() => process.exit(0));
  });
