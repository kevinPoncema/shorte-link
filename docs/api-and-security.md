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
| `POST` | `/auth/register` | Pública | `201` | Registra usuario (`bcrypt`), asegura plan `DEFAULT` y emite JWT. |
| `POST` | `/auth/login` | Pública | `200` | Valida credenciales y emite JWT stateless. |
| `POST` | `/links` | Bearer JWT | `201` | Valida cuota vía `PlanStrategy`, crea link y precalienta `SET r:{shortCode}`. |
| `GET` | `/links` | Bearer JWT | `200` | Lista los enlaces del usuario autenticado (`createdAt DESC`). |
| `GET` | `/links/:id` | Bearer JWT | `200` | Obtiene el detalle de un enlace propio. |
| `GET` | `/links/:id/qr` | Bearer JWT | `200` | Renderiza QR dinámico (`image/png` o `image/svg+xml`, query opcional `?format=png\|svg`). |
| `PATCH` | `/links/:id` | Bearer JWT | `200` | Actualiza `targetUrl`, `isActive` o `qrConfig` e invalida `DEL r:{shortCode}`. |
| `DELETE` | `/links/:id` | Bearer JWT | `204` | Elimina el enlace e invalida `DEL r:{shortCode}`. |
| `GET` | `/billing/subscription` | Bearer JWT | `200` | Retorna `{ subscription }` activa del usuario o `null`. |
| `GET` | `/:shortCode` | Pública | `302` | **Fast-Path:** Redirige con cabecera `Location` y encola en `queue:clicks`. |

### Payload JWT Stateless

```json
{
  "sub": "a3bb189e-8bf9-3888-9912-ace4e6543002",
  "email": "cliente@empresa.com",
  "plan": "DEFAULT",
  "iat": 1730419200,
  "exp": 1730505600
}
```

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
npm test           # 6 suites unitarias (33 tests)
npm run test:cov   # Cobertura (~95% líneas globales / ~100% servicios, guards y controllers)
npm run test:e2e   # Suite integral HTTP sobre Fastify + contrato OpenAPI 3.0
```

- **Happy Paths:** Registro/login JWT, CRUD links con precalentamiento Redis, redirección `302` en *Cache Hit* y *Cache Miss*, renderizado QR `PNG`/`SVG`, consulta de suscripción y rutas OpenAPI.
- **Sad Paths:** Emails inválidos/duplicados (`409`), credenciales erróneas (`401`), tokens ausentes/malformados/expirados/otra firma (`401`), URLs `javascript:`/`ftp:` (`400`), intentos IDOR entre usuarios (`404`), cuotas de plan superadas (`403`) y enlaces inactivos o eliminados (`404`).
- **Casos Borde:** Normalización de espacios/mayúsculas en emails, fronteras `<8` y `>72` en contraseñas, `planId: null` con fallback a `DEFAULT`, `qrConfig: {}` en planes restringidos, reactivación frente a `getMaxActiveLinks()`, reintentos y agotamiento de colisiones Base62 (`500`), cortocircuito en `/favicon.ico`, cabeceras HTTP como `string[]`, bloqueo de `CONFIG` en Redis administrado y resiliencia del `302` ante fallos en `queue:clicks`.
