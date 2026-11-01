# Dynamic QR & Link Shortener API

Backend de alta concurrencia para acortamiento de enlaces y códigos QR dinámicos construido con **NestJS 11**, **Fastify**, **PostgreSQL** (`TypeORM`), **Redis** (`ioredis`) y **OpenAPI 3.0**.

## Inicio Rápido (Stack Completo con Docker)

```bash
cp .env.example .env
docker compose up -d --build
```

- **Frontend UI:** `http://localhost:5173`
- **Backend API:** `http://localhost:3000`
- **Swagger Docs:** `http://localhost:3000/docs` (`/docs-json`, `/docs-yaml`)

## Scripts

```bash
npm run start:dev       # Backend en desarrollo con hot-reload (:3000)
npm run dev:frontend    # Frontend React + Vite con Tailwind (:5173)
npm run build           # Compilación del backend a dist/
npm run build:frontend  # Compilación del frontend a frontend/dist/
npm run start:prod      # Ejecución del backend en producción
npm test                # Pruebas unitarias
npm run test:cov        # Cobertura de pruebas
npm run test:e2e        # Pruebas E2E sobre Fastify
```

## Documentación

- [Arquitectura (Data Plane & Control Plane)](docs/architecture.md)
- [Esquema de Base de Datos en UML y Redis](docs/database.md)
- [Módulos y Patrón Strategy](docs/modules.md)
- [Configuración y Variables de Entorno](docs/configuration.md)
- [API, OpenAPI, Seguridad y Testing](docs/api-and-security.md)
- [Guía de Despliegue](docs/deployment.md)
