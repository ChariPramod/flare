import { dependencyReady } from '@flare/shared';
import { objectStore } from '@flare/mail';
import {
  startTelemetry,
  stopTelemetry,
  shutdownDeadline,
  registry,
  metricsAuthorized,
} from '@flare/shared';
import { Res, Req, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DeadLettersController } from './dead-letters.js';
import { PublicationController } from './publication.js';
import { ContentController } from './content.js';
import { InboundController } from './inbound.js';
import 'reflect-metadata';
import { AutomationController } from './automations.js';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AuthController, AuthGuard, Public } from './auth.js';
import { WorkflowController } from './workflows.js';
import { IntegrationController } from './integrations.js';
import { IdentityController } from './identity.js';
import { logger, redis, sql } from './context.js';
import { MailController, MailExceptionFilter } from './mail.js';
import { MailEventController } from './mail-events.js';
import { OperationsController } from './operations.js';
import { AudienceController } from './audience.js';
import { MetricsController } from './metrics.js';
import { requestLogs, flushRequestLogs } from './request-logs.js';

startTelemetry();
const readinessStore = objectStore();
@Controller()
class HealthController {
  @Public() @Get('internal/metrics') async prometheus(@Req() req: Request, @Res() res: Response) {
    if (!metricsAuthorized(req.headers.authorization)) throw new NotFoundException();
    res.type(registry.contentType).send(await registry.metrics());
  }

  @Public() @Get('health') health() {
    return { status: 'ok', service: 'api' };
  }
  @Public() @Get('ready') async ready() {
    try {
      await dependencyReady([sql`select 1`, redis.ping(), readinessStore.ready()]);
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Dependencies unavailable');
    }
  }
}
@Module({
  controllers: [
    HealthController,
    AuthController,
    IdentityController,
    WorkflowController,
    IntegrationController,
    MailController,
    MailEventController,
    OperationsController,
    MetricsController,
    AudienceController,
    AutomationController,
    InboundController,
    ContentController,
    PublicationController,
    DeadLettersController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: MailExceptionFilter },
  ],
})
class AppModule {}
const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  logger: ['error', 'warn', 'log'],
  rawBody: true,
});
if (process.env.TRUST_PROXY)
  app.set(
    'trust proxy',
    process.env.TRUST_PROXY.split(',').map((v) => v.trim()),
  );
app.use(requestLogs);
app.useBodyParser('json', {
  limit: process.env.API_BODY_LIMIT ?? '40mb',
  type: ['application/json', 'text/plain'],
});
app.use(helmet());
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
    shutdownDeadline();
    void app
      .close()
      .then(flushRequestLogs)
      .then(stopTelemetry)
      .then(() => Promise.all([sql.end(), redis.quit()]))
      .then(() => process.exit(0));
  });
