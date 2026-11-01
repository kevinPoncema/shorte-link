# API, OpenAPI, Seguridad y Testing

Referencia rápida de contratos HTTP, controles de seguridad y cobertura de pruebas.

---

## 1. Documentación OpenAPI 3.0

Con `SWAGGER_ENABLED=true`, el servidor expone automáticamente:

- **Swagger UI interactivo:** `GET /docs` (esquema Bearer `jwt-auth` con persistencia de token).
- **Especificación JSON:** `GET /docs-json`
- **Especificación YAML:** `GET /docs-yaml`

---

## 2. Catálogo de Endpoints

| Método | Ruta | Auth | Código | Descripción |
| :--- | :--- | :---: | :---: | :--- |
| `POST` | `/auth/register` | Pública | `201` | Registra usuario (`bcrypt`), asegura plan `STARTER` y emite JWT. |
| `POST` | `/auth/login` | Pública | `200` | Valida credenciales y emite JWT stateless con el plan vigente. |
| `GET` | `/auth/me` | Bearer JWT | `200` | Retorna el perfil actualizado desde PostgreSQL y rota `accessToken` si el plan cambió. |
| `POST` | `/links` | Bearer JWT | `201` | Valida cuota vía `PlanStrategy`, crea link y precalienta `SET r:{shortCode}`. |
| `GET` | `/links` | Bearer JWT | `200` | Lista los enlaces del usuario autenticado (`createdAt DESC`). |
| `GET` | `/links/:id` | Bearer JWT | `200` | Obtiene el detalle de un enlace propio. |
| `GET` | `/links/:id/stats` | Bearer JWT | `200` | KPIs, serie temporal y desgloses (`os`, `browsers`, `countries`, `referrers`) acotados por retención del plan. |
| `GET` | `/links/:id/qr` | Bearer JWT | `200` | Renderiza QR dinámico (`image/png` o `image/svg+xml`, query opcional `?format=png\|svg`). |
| `PATCH` | `/links/:id` | Bearer JWT | `200` | Actualiza `name`, `targetUrl`, `isActive` o `qrConfig` e invalida reactivamente `DEL r:{shortCode}`. |
| `DELETE` | `/links/:id` | Bearer JWT | `204` | Elimina el enlace e invalida `DEL r:{shortCode}`. |
| `GET` | `/billing/config` | Bearer JWT | `200` | Consulta el estado del flag booleano `physicalOrdersEnabled`, `proPriceIdConfigured` y precios de hardware. |
| `PATCH` | `/billing/config/physical-orders` | Bearer JWT | `200` | Activa o desactiva en caliente el módulo de pedidos físicos (`{ enabled: boolean }`). |
| `GET` | `/billing/subscription` | Bearer JWT | `200` | Retorna `{ subscription }` activa del usuario o `null`. |
| `POST` | `/billing/checkout/subscription` | Bearer JWT | `201` | Crea sesión de Stripe Checkout (`mode: subscription`) usando `dto.priceId` o `STRIPE_PRO_PRICE_ID`. |
| `GET` | `/billing/portal` | Bearer JWT | `200` | Genera URL temporal al Stripe Customer Portal (`?returnUrl=...`). |
| `POST` | `/billing/simulate-upgrade` | Bearer JWT | `200` | Activa el plan `PRO` directamente en entorno dev/pruebas garantizando integridad FK y rotando `accessToken`. |
| `POST` | `/billing/cancel` | Bearer JWT | `200` | Cancela la suscripción activa, revierte la cuenta a `STARTER` y rota `accessToken`. |
| `POST` | `/billing/checkout/physical` | Bearer JWT | `201` | Crea orden de hardware QR/NFC y sesión de Stripe Checkout (`mode: payment`), sujeto a `ENABLE_PHYSICAL_ORDERS`. |
| `POST` | `/billing/orders/direct` | Bearer JWT | `201` | Emite directamente una orden física de producción (`in_production` / `paid`), sujeto a `ENABLE_PHYSICAL_ORDERS`. |
| `GET` | `/billing/orders` | Bearer JWT | `200` | Lista el historial de órdenes físicas emitidas por el usuario autenticado. |
| `POST` | `/billing/webhook` | Firma HMAC | `200` | Webhook idempotente de Stripe verificado contra `req.rawBody` y `stripe-signature`. |
| `GET` | `/:shortCode` | Pública | `302` | **Fast-Path:** Redirige con cabecera `Location` y encola en `queue:clicks`. |

### Payload JWT Stateless y Rotación Reactiva

```json
{
  "sub": "a3bb189e-8bf9-3888-9912-ace4e6543002",
  "email": "cliente@empresa.com",
  "plan": "STARTER",
  "iat": 1730419200,
  "exp": 1730505600
}
```

- Cuando el usuario cambia de plan (`POST /billing/simulate-upgrade`, `POST /billing/cancel` o tras un Webhook de Stripe consultando `GET /auth/me`), la API emite un `accessToken` renovado con el `plan` vigente (`STARTER` o `PRO`).
- Adicionalmente, si un JWT emitido antes de un Webhook aún contiene `plan: "STARTER"`, `LinksService` y `LinkStatsService` verifican el `planId` persistido en `UsersService` para habilitar capacidades `PRO` sin obligar a cerrar sesión.

---

## 3. Controles de Seguridad

- **Anti-XSS / Open Redirect:** `targetUrl` exige protocolo explícito `http` o `https` (rechaza `javascript:`, `data:`, `ftp:`).
- **Anti-IDOR Multi-Tenant:** Lectura, edición, borrado y generación QR consultan siempre por `{ id, userId: req.user.sub }`, respondiendo `404` ante accesos cruzados sin invalidar caché ajena.
- **Validación Estricta de Entrada:** `ValidationPipe` global con `whitelist: true`, `forbidNonWhitelisted: true` y `transform: true`.
- **Límites Criptográficos:** Contraseñas acotadas entre `8` y `72` caracteres (límite nativo de `bcrypt`) y `password` con `select: false` en la entidad `User`.
- **Anonimización de IP:** Hash truncado `SHA-256(IP_HASH_SALT:ip)` antes de enviar métricas a Redis.
- **Slugs Reservados (`RESERVED_SLUGS`):** Bloquea colisiones contra `auth`, `links`, `plans`, `billing`, `health`, `metrics`, `docs`, `docs-json`, `docs-yaml`, `openapi`, `openapi.json`, `swagger` y `favicon.ico`.

---

## 4. Estrategia de Testing

```bash
npm test                     # 11 suites unitarias del backend (Jest)
npm run test:cov             # Cobertura global del backend
npm run test:e2e             # Suite integral HTTP sobre Fastify + OpenAPI 3.0 + Billing + CORS
npm test --prefix frontend   # Suites de interfaz y modales con Vitest + Testing Library
```

- **Happy Paths:** Registro/login JWT, siembra automática de catálogo `plans` (`STARTER`, `PRO`), CRUD links con precalentamiento Redis, redirección `302` en *Cache Hit* y *Cache Miss*, renderizado QR `PNG`/`SVG`, analíticas detalladas, flujo completo de facturación (`checkout/subscription`, `simulate-upgrade`, `cancel`, `orders/direct`, Webhooks de Stripe) y rutas OpenAPI.
- **Sad Paths:** Emails inválidos/duplicados (`409`), credenciales erróneas (`401`), tokens ausentes/malformados/expirados/otra firma (`401`), URLs `javascript:`/`ftp:` (`400`), intentos IDOR entre usuarios (`404`), cuotas de plan superadas (`403`), bloqueo por flag booleano `ENABLE_PHYSICAL_ORDERS=false` (`403`), firmas HMAC de Stripe inválidas (`400`) y enlaces inactivos o eliminados (`404`).
- **Casos Borde:** Integridad referencial FK al promover usuarios a `PRO` sin registros previos en `plans`, rotación transparente de JWT ante cambios asíncronos de plan, fallback local cuando `STRIPE_SECRET_KEY` es un placeholder de desarrollo, normalización de espacios/mayúsculas en emails, fronteras `<8` y `>72` en contraseñas, cortocircuito en `/favicon.ico`, bloqueo de `CONFIG` en Redis administrado y resiliencia del `302` ante fallos en `queue:clicks`.
