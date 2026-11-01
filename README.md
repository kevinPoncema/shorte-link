# Dynamic QR & Link Shortener API

Plataforma backend de alta concurrencia para acortamiento de enlaces y generación de códigos QR dinámicos, construida sobre **NestJS 11** con **Fastify** (`@nestjs/platform-fastify`), **PostgreSQL** (`TypeORM`), **Redis** (`ioredis`) y especificación completa **OpenAPI 3.0** (`@nestjs/swagger`).

---

## 1. Filosofía de Arquitectura

El sistema separa estrictamente dos planos de ejecución:

1. **Data Plane (Fast-Path de Redirección — `GET /:shortCode`):**
   - Resolución en sub-milisegundos vía memoria RAM (`Redis`, clave `r:{shortCode}`) bajo política de desalojo `allkeys-lru`.
   - Respuesta inmediata `HTTP 302 Found` con cabecera `Location: {targetUrl}`.
   - Emisión asíncrona (*fire-and-forget*) de telemetría hacia la cola `LPUSH queue:clicks` con dirección IP anonimizada (`SHA-256` con sal).
   - Fallback transparente a PostgreSQL en caso de *Cache Miss*, validando `isActive === true` y repoblando Redis.
2. **Control Plane (Gestión SaaS — `/auth/*`, `/links/*`, `/billing/*`):**
   - Autenticación stateless mediante JWT (`{ sub, email, plan, iat, exp }`) y hashing de contraseñas con `bcrypt`.
   - Motor de reglas y cuotas desacoplado en memoria mediante el patrón **Strategy** (`PlansModule` / `PlanContextService`).
   - Invalidación reactiva obligatoria en Redis (`DEL r:{shortCode}`) ante cualquier modificación o eliminación de un enlace.

---

## 2. Documentación Interactiva OpenAPI 3.0 (Swagger)

Al iniciar el servidor (`SWAGGER_ENABLED=true` por defecto), la documentación OpenAPI queda expuesta automáticamente sin colisionar con el Fast-Path `GET /:shortCode` (las rutas de documentación forman parte de `RESERVED_SLUGS`):

| Recurso | Ruta por defecto | Descripción |
| :--- | :--- | :--- |
| **Swagger UI** | `http://localhost:3000/docs` | Consola interactiva con soporte `Bearer JWT` (`persistAuthorization`) |
| **OpenAPI JSON** | `http://localhost:3000/docs-json` | Especificación OpenAPI 3.0 exportable en formato JSON |
| **OpenAPI YAML** | `http://localhost:3000/docs-yaml` | Especificación OpenAPI 3.0 exportable en formato YAML |

---

## 3. Estructura Modular

```text
src/
├── core/
│   ├── auth/
│   │   ├── controllers/auth.controller.ts
│   │   ├── decorators/current-user.decorator.ts
│   │   ├── dto/{register,login,auth-response}.dto.ts
│   │   ├── guards/jwt-auth.guard.ts
│   │   ├── interfaces/jwt-payload.interface.ts
│   │   └── services/auth.service.ts
│   ├── links/
│   │   ├── controllers/{links,redirect}.controller.ts
│   │   ├── dto/{create-link,update-link,qr-config}.dto.ts
│   │   └── services/links.service.ts
│   ├── cache/
│   │   └── cache.service.ts
│   ├── models/
│   │   ├── user.entity.ts
│   │   ├── link.entity.ts
│   │   └── link-event.entity.ts
│   └── core.module.ts
├── plans/
│   ├── interfaces/plan-strategy.interface.ts
│   ├── strategies/default-plan.strategy.ts
│   ├── services/plan-context.service.ts
│   ├── models/plan.entity.ts
│   └── plans.module.ts
├── billing/
│   ├── controllers/billing.controller.ts
│   ├── dto/subscription-response.dto.ts
│   ├── services/billing.service.ts
│   ├── models/subscription.entity.ts
│   └── billing.module.ts
├── openapi.config.ts
├── app.module.ts
└── main.ts
```

---

## 4. Puesta en Marcha

1. **Configurar variables de entorno:**
   ```bash
   cp .env.example .env
   ```

2. **Levantar PostgreSQL 16 y Redis 7 (`--maxmemory-policy allkeys-lru`):**
   ```bash
   docker compose up -d
   ```

3. **Instalar dependencias y arrancar en modo desarrollo:**
   ```bash
   npm install
   npm run start:dev
   ```

---

## 5. Catálogo de Endpoints

| Método | Ruta | Seguridad | Descripción |
| :--- | :--- | :---: | :--- |
| `POST` | `/auth/register` | Pública | Registra usuario (`bcrypt`), asegura plan `DEFAULT` y emite JWT |
| `POST` | `/auth/login` | Pública | Valida credenciales y emite JWT `{ sub, email, plan, iat, exp }` |
| `POST` | `/links` | Bearer JWT | Valida estrategia de plan, crea link y precalienta `SET r:{shortCode}` |
| `GET` | `/links` | Bearer JWT | Lista los enlaces pertenecientes al usuario autenticado |
| `GET` | `/links/:id` | Bearer JWT | Obtiene el detalle de un enlace validando propiedad |
| `GET` | `/links/:id/qr` | Bearer JWT | Renderiza imagen QR dinámica (`image/png` o `image/svg+xml`) |
| `PATCH` | `/links/:id` | Bearer JWT | Actualiza destino/estado/QR y ejecuta `DEL r:{shortCode}` |
| `DELETE` | `/links/:id` | Bearer JWT | Elimina enlace y ejecuta `DEL r:{shortCode}` |
| `GET` | `/billing/subscription` | Bearer JWT | Retorna la suscripción activa del usuario o `null` |
| `GET` | `/:shortCode` | Pública | **Fast-Path**: Redirección `302 Found` + `LPUSH queue:clicks` |

---

## 6. Estrategia de Testing (Happy Path, Sad Path y Casos Borde)

Ejecución completa de pruebas unitarias con reporte de cobertura, pruebas E2E sobre Fastify y compilación de producción:

```bash
npm run test:cov
npm run test:e2e
npm run build
```

Cobertura verificada de escenarios:
- **Happy Paths:** Registro/login con JWT, precalentamiento Redis al crear enlaces, resolución `302` por *Cache Hit* y *Cache Miss*, generación QR en `PNG` y `SVG`, actualización con invalidación reactiva, consulta de suscripción y exposición de OpenAPI (`/docs`, `/docs-json`, `/docs-yaml`).
- **Sad Paths:** Emails inválidos o duplicados (`409`), credenciales erróneas (`401`), tokens ausentes/malformados/expirados/adulterados (`401`), prevención de XSS en URLs (`javascript:` / `ftp:` -> `400`), colores hex y márgenes inválidos (`400`), aislamiento multi-tenant contra IDOR (`404`), cuotas de plan y diseño QR restringidos (`403`), enlaces inactivos o eliminados (`404`).
- **Casos Borde (*Edge Cases*):** Normalización de mayúsculas/espacios en correos, límites exactos de `bcrypt` (`<8` y `>72` caracteres), usuario con `planId: null` haciendo fallback a `DEFAULT`, protección de `RESERVED_SLUGS` (incluyendo rutas Swagger y `favicon.ico`), reintentos y agotamiento de colisiones Base62 (`500`), reactivación de enlaces frente a `getMaxActiveLinks()`, cabeceras HTTP múltiples (`string[]`), servidores Redis administrados con comando `CONFIG` restringido y resiliencia de la redirección `302` incluso ante fallos asíncronos en `queue:clicks`.
