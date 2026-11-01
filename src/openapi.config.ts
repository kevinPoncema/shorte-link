import { ConfigService } from '@nestjs/config';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * Nombre del esquema de seguridad JWT utilizado en los decoradores `@ApiBearerAuth()`.
 */
export const JWT_BEARER_AUTH = 'jwt-auth';

/**
 * Configura y monta la especificación interactiva OpenAPI 3.0 (Swagger UI)
 * junto con los endpoints exportables en JSON (`/docs-json`) y YAML (`/docs-yaml`).
 *
 * @param app Instancia de la aplicación NestJS sobre Fastify.
 * @returns Documento OpenAPI generado.
 */
export function setupOpenApi(app: NestFastifyApplication): OpenAPIObject {
  const configService = app.get(ConfigService);
  const baseUrl = configService.get<string>(
    'APP_BASE_URL',
    'http://localhost:3000',
  );
  const swaggerPath = configService.get<string>('SWAGGER_PATH', 'docs');

  const builder = new DocumentBuilder()
    .setTitle('Dynamic QR & Link Shortener API')
    .setDescription(
      [
        'Plataforma backend de alta concurrencia para acortamiento de URLs y generación de códigos QR dinámicos sobre **NestJS + Fastify**.',
        '',
        '### Separación de Planos de Ejecución',
        '- **Data Plane (`GET /:shortCode`):** Resolución en memoria RAM vía Redis (`allkeys-lru`), respuesta inmediata `HTTP 302 Found` y registro asíncrono de eventos en `queue:clicks`.',
        '- **Control Plane (`/auth/*`, `/links/*`, `/billing/*`):** Gestión autenticada mediante JWT stateless, validación de cuotas desacoplada por patrón **Strategy** (`PlansModule`) e invalidación reactiva en Redis (`DEL r:{shortCode}`).',
      ].join('\n'),
    )
    .setVersion('0.1.0')
    .addServer(baseUrl, 'Active Runtime Server')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Token JWT stateless emitido por `/auth/register` o `/auth/login`. Contiene `{ sub, email, plan, iat, exp }`.',
      },
      JWT_BEARER_AUTH,
    )
    .addTag(
      'Auth',
      'Registro de cuentas, autenticación con bcrypt y emisión de tokens JWT stateless',
    )
    .addTag(
      'Links & QR',
      'Administración de enlaces cortos, renderizado de códigos QR dinámicos e invalidación reactiva de caché',
    )
    .addTag(
      'Redirect (Fast-Path)',
      'Endpoint público de redirección HTTP 302 de ultra-baja latencia respaldado por Redis',
    )
    .addTag(
      'Billing',
      'Consulta de estado de suscripción asociada a la cuenta del usuario',
    )
    .build();

  const document = SwaggerModule.createDocument(app, builder);

  const isSwaggerEnabled =
    configService.get<string>('SWAGGER_ENABLED', 'true') !== 'false';

  if (isSwaggerEnabled) {
    SwaggerModule.setup(swaggerPath, app, document, {
      jsonDocumentUrl: `${swaggerPath}-json`,
      yamlDocumentUrl: `${swaggerPath}-yaml`,
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
    });
  }

  return document;
}
