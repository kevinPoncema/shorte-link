# Arquitectura del Sistema

El backend separa la ejecución en dos planos independientes sobre **NestJS + Fastify** para aislar la redirección pública de alta concurrencia respecto a la lógica transaccional del SaaS.

---

## 1. Vista General de Componentes

```mermaid
flowchart LR
  Visitor([Visitante / Lector QR])
  Owner([Usuario Autenticado])

  subgraph DataPlane["Data Plane (Fast-Path)"]
    Redirect["RedirectController\nGET /:shortCode"]
    Redis[(Redis RAM\nallkeys-lru)]
    Clicks[["Cola Redis\nqueue:clicks"]]
  end

  subgraph ControlPlane["Control Plane (SaaS)"]
    Auth["AuthController\n/auth/*"]
    Links["LinksController\n/links/*"]
    Stats["LinkStatsService\n/links/:id/stats"]
    Billing["BillingController\n/billing/*"]
    Plans["PlanContextService\nStrategy Map O(1)"]
    Worker["AnalyticsWorkerService\nWorker Daemon (15s)"]
    PG[(PostgreSQL)]
  end

  Visitor -->|"GET /:shortCode"| Redirect
  Redirect -->|"GET r:{code}"| Redis
  Redirect -.->|"Async LPUSH"| Clicks
  Redirect -.->|"Cache Miss"| PG

  Clicks -.->|"RPOP Batch (15s)"| Worker
  Worker -->|"Bulk Insert link_events"| PG
  Worker -.->|"shortCode -> linkId cache"| PG

  Owner -->|"POST /auth/*"| Auth
  Owner -->|"Bearer JWT"| Links
  Owner -->|"Bearer JWT"| Stats
  Owner -->|"Bearer JWT"| Billing

  Auth --> PG
  Links -->|"O(1)"| Plans
  Links -->|"CRUD"| PG
  Links -->|"SET / DEL r:{code}"| Redis
  Stats -->|"Agregaciones SQL"| PG
  Billing --> PG
```

---

## 2. Secuencia UML — Fast-Path de Redirección (`Data Plane`)

```mermaid
sequenceDiagram
  autonumber
  actor V as Visitante
  participant RC as RedirectController
  participant LS as LinksService
  participant R as Redis
  participant DB as PostgreSQL

  V->>RC: GET /:shortCode
  RC->>LS: resolveShortCodeForRedirect(shortCode)
  LS->>R: GET r:{shortCode}

  alt Cache Hit
    R-->>LS: targetUrl
    LS-->>RC: { targetUrl }
  else Cache Miss
    R-->>LS: null
    LS->>DB: SELECT id, short_code, target_url, is_active FROM links
    alt No existe o is_active == false
      DB-->>LS: null / inactivo
      LS-->>V: HTTP 404 Not Found
    else Enlace activo
      DB-->>LS: link
      LS->>R: SET r:{shortCode} {targetUrl}
      LS-->>RC: { targetUrl, linkId }
    end
  end

  RC-)R: Async LPUSH queue:clicks (IP anonimizada + headers)
  RC-->>V: HTTP 302 Found (Location: targetUrl)
```

---

## 3. Secuencia UML — Mutación e Invalidación Reactiva (`Control Plane`)

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuario (JWT)
  participant G as JwtAuthGuard
  participant LC as LinksController
  participant PC as PlanContextService
  participant LS as LinksService
  participant DB as PostgreSQL
  participant R as Redis

  U->>G: PATCH /links/:id (Bearer JWT)
  G->>G: verifyAsync(token) -> req.user { sub, email, plan }
  G->>LC: update(user, id, dto)
  LC->>LS: updateLink(user, id, dto)
  LS->>DB: SELECT link WHERE id AND user_id
  LS->>PC: getStrategy(user.plan)
  PC-->>LS: PlanStrategy
  LS->>DB: UPDATE links SET ...
  LS->>R: DEL r:{shortCode}
  LS-->>U: HTTP 200 OK (Link actualizado)
```

---

## 4. Secuencia UML — Ingestión en Lote y Vaciado de RAM (`AnalyticsWorkerService`)

El worker de analíticas procesa periódicamente cada 15 segundos la cola `queue:clicks` mediante el patrón **Orquestador**:

```mermaid
sequenceDiagram
  autonumber
  participant T as Timer (15s)
  participant W as AnalyticsWorkerService (Orquestador)
  participant CS as CacheService (Redis)
  participant LR as LinkRepository (PostgreSQL)
  participant ER as LinkEventRepository (PostgreSQL)

  T->>W: runCycle()
  alt isProcessing == true
    W-->>T: Omitir ciclo (evita concurrencia solapada)
  else isProcessing == false
    W->>CS: popClickEventsBatch(batchSize: 200)
    CS-->>W: rawEvents[] (RPOP queue:clicks - Libera RAM)
    alt rawEvents.length == 0
      W-->>T: Fin de ciclo (0 ms)
    else Hay eventos
      W->>W: resolveLinkIds(rawEvents)
      opt Slugs no encontrados en caché local
        W->>LR: findIdsByShortCodes(missingSlugs)
        LR-->>W: [{ id, shortCode }]
      end
      W->>W: transformEventsToEntities(rawEvents, linkIdMap)
      Note over W: Parseo de OS, Navegador y timestamp
      W->>ER: insertBatch(recordsToInsert)
      ER-->>W: Batch insert exitoso
      W-->>T: Clics persistidos y log informativo
    end
  end
```

---

## 5. Decisiones Técnicas Clave

- **Fastify + `trustProxy: true` + `rawBody: true`:** Minimiza overhead HTTP, extrae la IP real del cliente desde `X-Forwarded-For` detrás de proxies/CDNs y conserva el buffer crudo (`req.rawBody`) indispensable para validar firmas criptográficas HMAC (`stripe-signature`) en Webhooks de Stripe.
- **Autorización Stateless con Resolución Reactiva de Plan:** El JWT transporta `{ sub, email, plan }`, permitiendo validar permisos y cuotas en memoria (`O(1)`). Cuando ocurren cambios de plan (`simulate-upgrade`, `cancel` o Webhooks asíncronos de Stripe), el backend rota el `accessToken` y reconcilia el plan efectivo en `UsersService` para habilitar funciones `PRO` de inmediato.
- **Siembra Automática del Catálogo de Planes (`OnModuleInit`):** `PlanContextService` y `UsersService` sincronizan de forma idempotente las estrategias registradas (`STARTER`, `PRO`) en la tabla `plans`, eliminando violaciones de llave foránea (`users.plan_id -> plans.id`) en entornos nuevos o contenedores recién inicializados.
- **Feature Flag Booleano para Pedidos Físicos (`ENABLE_PHYSICAL_ORDERS`):** El flujo de emisión de órdenes de impresión QR/NFC (tarjetas PVC, acrílicos, etiquetas NFC) se gobierna mediante un flag booleano configurable por entorno y conmutable en tiempo real (`PATCH /billing/config/physical-orders`).
- **Telemetría No Bloqueante & Consumo en Lotes:** `recordClickAsync` ejecuta `LPUSH queue:clicks` en modo *fire-and-forget* (Data Plane). Cada 15 segundos, `AnalyticsWorkerService` realiza `RPOP` en bloque (hasta 200 eventos), purga la memoria RAM de Redis y ejecuta una única inserción masiva (`INSERT INTO link_events VALUES (...)`) en PostgreSQL.
- **Tolerancia a Apagados (`Graceful Shutdown`):** Al detener el servicio (`onModuleDestroy`), el worker ejecuta un vaciado forzado final de los eventos pendientes en Redis para prevenir pérdida de datos.
- **Geolocalización Multi-Capa (Cloudflare + Nginx + GeoIP):** `country-resolver.helper.ts` extrae el país antes de anonimizar la IP. Prioriza cabeceras perimetrales (`CF-IPCountry`, `X-Country-Code`, `CloudFront-Viewer-Country`) en 0 ms; si no existen, consulta la base de datos offline `geoip-lite` (0.01 ms), y para IPs privadas/locales aplica un fallback configurable (`DEV_GEOIP_FALLBACK_COUNTRY`).
- **Invalidación Reactiva (`DEL`):** En actualizaciones y borrados se elimina `r:{shortCode}` en lugar de sobreescribir ciegamente, evitando condiciones de carrera y destinos obsoletos.
