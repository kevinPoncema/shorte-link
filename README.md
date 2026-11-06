# Dynamic QR & Link Shortener Platform (SaaS + Hardware NFC)

Plataforma fullstack de alta concurrencia para acortamiento de enlaces, códigos QR dinámicos, analíticas avanzadas y emisión de pedidos físicos (tarjetas PVC/acrílicos con chip NFC) construida con **NestJS 11**, **Fastify**, **PostgreSQL** (`TypeORM`), **Redis** (`ioredis`), **Stripe**, **React 19** y **OpenAPI 3.0**.

Incluye:
- **Data Plane (`Fast-Path`):** Redirección `302` en sub-milisegundos vía Redis (`allkeys-lru`) y encolado no bloqueante en `queue:clicks`.
- **Worker de Analíticas (`AnalyticsWorkerService`):** Vacía en bloque `queue:clicks` hacia PostgreSQL (`link_events`) cada 15 segundos liberando RAM continuamente.
- **Facturación SaaS & Pedidos Físicos (`BillingModule`):** Suscripciones recurrentes (`STARTER` / `PRO`) con Stripe Checkout, Customer Portal, Webhooks HMAC (`rawBody: true`), siembra automática del catálogo `plans` (`OnModuleInit`) y emisión de órdenes de impresión QR/NFC controlada por flag booleano (`ENABLE_PHYSICAL_ORDERS` + toggle dinámico en runtime).

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
npm run start:dev            # Backend en desarrollo con hot-reload (:3000)
npm run dev:frontend         # Frontend React + Vite con Tailwind (:5173)
npm run build                # Compilación del backend a dist/
npm run build:frontend       # Compilación del frontend a frontend/dist/
npm run start:prod           # Ejecución del backend en producción
npm run mcp                  # Ejecuta el servidor MCP sobre stdio (compilado)
npm run mcp:dev              # Ejecuta el servidor MCP con ts-node (desarrollo)
npm test                     # Pruebas unitarias del backend (Jest)
npm run test:cov             # Cobertura de pruebas del backend
npm run test:e2e             # Pruebas E2E sobre Fastify
npm test --prefix frontend   # Pruebas unitarias/integración del frontend (Vitest)
```

## Documentación

- [Requerimientos Funcionales y No Funcionales (SRS)](docs/requirements.md)
- [Guía de Producto y Brief para Diseñadores UI/UX](docs/product-and-ui-brief.md)
- [Arquitectura (Data Plane & Control Plane)](docs/architecture.md)
- [Esquema de Base de Datos en UML y Redis](docs/database.md)
- [Módulos y Patrón Strategy](docs/modules.md)
- [Configuración y Variables de Entorno](docs/configuration.md)
- [API, OpenAPI, Seguridad y Testing](docs/api-and-security.md)
- [Servidor MCP (Model Context Protocol)](docs/mcp-server.md)
- [Guía de Despliegue](docs/deployment.md)
- [Hoja de Ruta de Auditoría y Refactorización](docs/audit-roadmap.md)
