import { ConfigModule } from '@nestjs/config';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { JWT_BEARER_AUTH, setupOpenApi } from './openapi.config';

describe('OpenAPI Configuration (setupOpenApi)', () => {
  it('mounts Swagger UI, JSON, and YAML routes when SWAGGER_ENABLED is true (default)', async () => {
    delete process.env.SWAGGER_ENABLED;

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
    }).compile();

    const app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    setupOpenApi(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const jsonRes = await app.inject({ method: 'GET', url: '/docs-json' });
    expect(jsonRes.statusCode).toBe(200);
    expect(jsonRes.json().openapi).toMatch(/^3\.0\./);

    await app.close();
  });

  it('generates OpenAPI 3.0 document with jwt-auth security scheme and respects SWAGGER_ENABLED=false', async () => {
    process.env.SWAGGER_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
    }).compile();

    const app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();

    const doc = setupOpenApi(app);
    expect(doc.openapi).toMatch(/^3\.0\./);
    expect(doc.info.title).toBe('Dynamic QR & Link Shortener API');
    expect(doc.components?.securitySchemes?.[JWT_BEARER_AUTH]).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });

    const disabledRes = await app.inject({
      method: 'GET',
      url: '/docs-json',
    });
    expect(disabledRes.statusCode).toBe(404);

    await app.close();
    delete process.env.SWAGGER_ENABLED;
  });
});
