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
    void app
      .close()
      .then(flushRequestLogs)
      .then(() => Promise.all([sql.end(), redis.quit()]))
      .then(() => process.exit(0));
  });
