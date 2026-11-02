# Configuración y Variables de Entorno

La configuración se carga globalmente mediante `@nestjs/config` desde variables de entorno o archivo `.env` (plantilla en `.env.example`).

---

## 1. Runtime y OpenAPI

| Variable | Default | Descripción |
| :--- | :--- | :--- |
| `PORT` | `3000` | Puerto TCP de escucha del servidor Fastify. |
| `HOST` | `0.0.0.0` | Interfaz de red (`0.0.0.0` requerido en contenedores Docker). |
| `NODE_ENV` | `development` | Entorno activo (`development`, `production`, `test`). |
| `APP_BASE_URL` | `http://localhost:3000` | URL base pública codificada en cada QR dinámico (`{APP_BASE_URL}/{shortCode}`). |
| `SWAGGER_ENABLED` | `true` | Monta Swagger UI y especificaciones OpenAPI (`false` las desactiva). |
| `SWAGGER_PATH` | `docs` | Ruta base para UI (`/docs`), JSON (`/docs-json`) y YAML (`/docs-yaml`). |

---

## 2. PostgreSQL (`Control Plane`)

| Variable | Default | Descripción |
| :--- | :--- | :--- |
| `DB_HOST` | `localhost` | Host o endpoint del servidor PostgreSQL. |
| `DB_PORT` | `5432` | Puerto de PostgreSQL. |
| `DB_USERNAME` | `postgres` | Usuario de conexión. |
| `DB_PASSWORD` | `postgres` | Contraseña de conexión. |
| `DB_NAME` | `qr_shortener` | Nombre de la base de datos. |
| `DB_SYNCHRONIZE` | `true` | Sincronización automática de entidades TypeORM (**obligatorio `false` en producción**). |
| `DB_MIGRATIONS_RUN` | `false` | Ejecuta migraciones pendientes automáticamente al iniciar la aplicación. |
| `DB_LOGGING` | `false` | Imprime en consola las consultas SQL ejecutadas. |

### Comandos de Migraciones TypeORM (CLI)

| Script NPM | Comando | Propósito |
| :--- | :--- | :--- |
| `npm run migration:run` | `typeorm-ts-node-commonjs migration:run -d src/data-source.ts` | Aplica todas las migraciones pendientes en PostgreSQL. |
| `npm run migration:revert` | `typeorm-ts-node-commonjs migration:revert -d src/data-source.ts` | Revierte la última migración aplicada. |
| `npm run migration:show` | `typeorm-ts-node-commonjs migration:show -d src/data-source.ts` | Lista el estado de las migraciones ejecutadas `[X]` y pendientes `[ ]`. |
| `npm run migration:generate` | `typeorm-ts-node-commonjs migration:generate -d src/data-source.ts <ruta>` | Genera un archivo de migración diferencial a partir de cambios en entidades. |

---

## 3. Redis (`Data Plane` y Cola de Analíticas)

| Variable | Default | Descripción |
| :--- | :--- | :--- |
| `REDIS_HOST` | `localhost` | Host de la instancia Redis. |
| `REDIS_PORT` | `6379` | Puerto de Redis. |
| `REDIS_PASSWORD` | *(vacío)* | Contraseña de autenticación Redis (opcional en local). |
| `REDIS_DB` | `0` | Índice numérico de base lógica Redis. |

---

## 4. Autenticación y Criptografía

| Variable | Default | Descripción |
| :--- | :--- | :--- |
| `JWT_SECRET` | `dev-fallback-jwt-secret` | Clave secreta de firma JWT (**usar >= 32 bytes aleatorios en producción**). |
| `JWT_EXPIRES_IN` | `1d` | Expiración de tokens emitidos (`15m`, `12h`, `1d`, `7d`). |
| `BCRYPT_SALT_ROUNDS` | `10` | Factor de costo `bcrypt` para hashing de contraseñas. |
| `IP_HASH_SALT` | `default-ip-anonymization-salt` | Sal secreta para anonimizar IPs (`SHA-256`) antes de encolar clics. |
| `CORS_ORIGIN` | `*` | Origen(es) permitidos por CORS en Fastify (`http://localhost:5173` o dominio de producción). |
| `THROTTLE_TTL_MS` | `60000` | Ventana de tiempo (ms) para el rate limiting global de `@nestjs/throttler`. |
| `THROTTLE_LIMIT` | `120` | Cantidad máxima de solicitudes por IP dentro de la ventana `THROTTLE_TTL_MS`. *(Nota: `GET /:shortCode` cuenta con `@SkipThrottle()` para nunca bloquear redirecciones de códigos QR bajo tráfico masivo).* |

---

## 5. Worker de Analíticas (`AnalyticsWorkerService` - Ingesta desde Redis)

| Variable | Default | Descripción |
| :--- | :--- | :--- |
| `ANALYTICS_WORKER_ENABLED` | `true` | Habilita el worker en segundo plano para consumir `queue:clicks`. Si se establece en `false`, desactiva el timer (útil en despliegues con worker dedicado). |
| `ANALYTICS_WORKER_INTERVAL_MS` | `15000` | Frecuencia de ejecución en milisegundos (15 segundos por defecto). |
| `ANALYTICS_WORKER_BATCH_SIZE` | `200` | Cantidad máxima de eventos extraídos y persistidos en bloque por ciclo para liberar RAM. |

---

## 6. Geolocalización y Proxy Inverso (Cloudflare / Nginx / GeoIP)

| Variable | Default | Descripción |
| :--- | :--- | :--- |
| `DEV_GEOIP_FALLBACK_COUNTRY` | `HN` | Código de país ISO-2 por defecto cuando se ejecutan pruebas en loopback (`127.0.0.1`, `::1`) o subredes privadas (ej. Docker `172.x`). En producción con IPs públicas o detrás de Cloudflare (`cf-ipcountry`) / Nginx (`x-country-code`), se detecta automáticamente. |

---

## 7. Facturación SaaS, Stripe y Pedidos Físicos (`BillingModule`)

| Variable | Default | Descripción |
| :--- | :--- | :--- |
| `STRIPE_SECRET_KEY` | `sk_test_placeholder` | Clave secreta de Stripe (`sk_test_...` o `sk_live_...`). Si en desarrollo contiene un placeholder de pruebas, el backend habilita fallback seguro de simulación local. |
| `STRIPE_WEBHOOK_SECRET` | *(vacío)* | Secreto de firma HMAC (`whsec_...`) para validar `POST /billing/webhook` sobre `req.rawBody`. |
| `STRIPE_PRO_PRICE_ID` | *(configurado en `.env`)* | ID del precio recurrente mensual del Plan PRO en Stripe (`price_...`) usado cuando el cliente no envía `priceId` explícito. |
| `ENABLE_PHYSICAL_ORDERS` | `true` | **Feature Flag booleano** (`true` / `false`) que activa o desactiva el módulo de pedidos físicos de tarjetas/acrílicos QR + NFC. También puede conmutarse dinámicamente vía `PATCH /billing/config/physical-orders`. |
| `PRICE_ACRYLIC_STAND` | `15.00` | Precio unitario (USD) para expositor acrílico QR + NFC (`acrylic_stand`). |
| `PRICE_PLASTIC_CARD` | `10.00` | Precio unitario (USD) para tarjeta PVC impresa QR + NFC (`plastic_card`). |
| `PRICE_NFC_CARD` | `12.50` | Precio unitario (USD) para tarjeta inteligente NFC empresarial (`nfc_card`). |
| `PRICE_NFC_STICKER` | `5.00` | Precio unitario (USD) para etiqueta adhesiva NFC (`nfc_sticker`). |

---

## 8. Frontend (`React + Vite`)

| Variable | Default | Descripción |
| :--- | :--- | :--- |
| `FRONTEND_PORT` | `5173` | Puerto expuesto en el host por el contenedor Nginx del frontend. |
| `VITE_API_BASE_URL` | `http://localhost:3000` | URL base del backend consumida por el cliente HTTP de la SPA. |
| `VITE_STRIPE_PRO_PRICE_ID` | *(opcional)* | Sobrescribe desde el cliente el `priceId` enviado a `POST /billing/checkout/subscription` (si se omite, el backend usa `STRIPE_PRO_PRICE_ID`). |

---

## 9. Perfil Recomendado por Entorno

| Parámetro | Desarrollo | Producción |
| :--- | :--- | :--- |
| `DB_SYNCHRONIZE` | `true` | `false` |
| `SWAGGER_ENABLED` | `true` | `false` *(o protegido por red interna)* |
| `BCRYPT_SALT_ROUNDS` | `10` | `10` – `12` |
| `JWT_SECRET` / `IP_HASH_SALT` | Valores locales | Secretos aleatorios de alta entropía |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Claves `sk_test_...` / simulación | Claves reales `sk_live_...` y `whsec_...` |
| `ENABLE_PHYSICAL_ORDERS` | `true` (`boolean`) | `true` o `false` según disponibilidad logística |
