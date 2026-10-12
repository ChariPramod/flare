import 'reflect-metadata';
import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Redis } from 'ioredis';
import { connectDatabase } from '@flare/db';
import { createLogger, infrastructureConfig } from '@flare/shared';

const config = infrastructureConfig.parse(process.env);
const logger = createLogger('api');
const { client } = connectDatabase(config.DATABASE_URL);
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
redis.on('error', (error: Error) => logger.error({ err: error }, 'Redis connection failed'));

@Controller()
class HealthController {
  @Get('health') health() { return { status: 'ok', service: 'api' }; }
  @Get('ready') async ready() {
    try { await Promise.all([client`select 1`, redis.ping()]); return { status: 'ready' }; }
    catch { throw new ServiceUnavailableException('Dependencies unavailable'); }
  }
}
@Module({ controllers: [HealthController] })
class AppModule {}

const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
app.use(helmet());
app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });
const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Flare API').setVersion('1').addBearerAuth().build());
SwaggerModule.setup('docs', app, document);
await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
logger.info('Flare API listening');
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  void Promise.all([app.close(), client.end(), redis.quit()]).then(() => process.exit(0));
});
