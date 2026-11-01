import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { setupOpenApi } from './openapi.config';

/**
 * Punto de entrada principal de la aplicación.
 * Inicializa NestJS con `FastifyAdapter` (`trustProxy: true`), validación global
 * de DTOs, CORS, hooks de apagado limpio y documentación interactiva OpenAPI 3.0.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: true,
    }),
    { rawBody: true },
  );

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  const resolvedOrigin =
    corsOrigin && corsOrigin.trim().length > 0
      ? corsOrigin.includes(',')
        ? corsOrigin.split(',').map((origin) => origin.trim())
        : corsOrigin.trim()
      : nodeEnv === 'production'
        ? false
        : true;

  app.enableCors({
    origin: resolvedOrigin,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  setupOpenApi(app);

  const port = Number(configService.get<number>('PORT', 3000));
  const host = configService.get<string>('HOST', '0.0.0.0');
  const swaggerPath = configService.get<string>('SWAGGER_PATH', 'docs');

  await app.listen(port, host);
  logger.log(
    `Dynamic QR & Link Shortener API running on http://${host}:${port}`,
  );
  logger.log(
    `OpenAPI documentation available at http://${host}:${port}/${swaggerPath}`,
  );
}

void bootstrap();
