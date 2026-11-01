# Dynamic QR & Link Shortener API

Backend de alta concurrencia para acortamiento de enlaces y códigos QR dinámicos construido con **NestJS 11**, **Fastify**, **PostgreSQL** (`TypeORM`), **Redis** (`ioredis`) y **OpenAPI 3.0**.

## Inicio Rápido

```bash
cp .env.example .env
docker compose up -d
npm install
npm run start:dev
```

- **API Base:** `http://localhost:3000`
- **Swagger UI:** `http://localhost:3000/docs` (`/docs-json`, `/docs-yaml`)

## Scripts

```bash
npm run start:dev   # Desarrollo con hot-reload
npm run build       # Compilación a dist/
npm run start:prod  # Ejecución de producción
npm test            # Pruebas unitarias
npm run test:cov    # Cobertura de pruebas
npm run test:e2e    # Pruebas E2E sobre Fastify
```

## Documentación

- [Arquitectura (Data Plane & Control Plane)](docs/architecture.md)
- [Esquema de Base de Datos en UML y Redis](docs/database.md)
- [Módulos y Patrón Strategy](docs/modules.md)
- [Configuración y Variables de Entorno](docs/configuration.md)
- [API, OpenAPI, Seguridad y Testing](docs/api-and-security.md)
- [Guía de Despliegue](docs/deployment.md)
