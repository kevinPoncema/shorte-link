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
    Billing["BillingController\n/billing/*"]
    Plans["PlanContextService\nStrategy Map O(1)"]
    PG[(PostgreSQL)]
  end

  Visitor -->|"GET /:shortCode"| Redirect
  Redirect -->|"GET r:{code}"| Redis
  Redirect -.->|"Async LPUSH"| Clicks
  Redirect -.->|"Cache Miss"| PG

  Owner -->|"POST /auth/*"| Auth
  Owner -->|"Bearer JWT"| Links
  Owner -->|"Bearer JWT"| Billing

  Auth --> PG
  Links -->|"O(1)"| Plans
  Links -->|"CRUD"| PG
  Links -->|"SET / DEL r:{code}"| Redis
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

## 4. Decisiones Técnicas Clave

- **Fastify + `trustProxy: true`:** Minimiza overhead HTTP y extrae la IP real del cliente desde `X-Forwarded-For` detrás de proxies/CDNs.
- **Autorización Stateless:** El JWT transporta `{ sub, email, plan }`, permitiendo validar permisos y cuotas en memoria (`O(1)`) sin consultar la tabla `users` o `plans` en cada request.
- **Telemetría No Bloqueante:** `recordClickAsync` ejecuta `LPUSH queue:clicks` en modo *fire-and-forget*; cualquier latencia o fallo puntual en la cola analítica nunca bloquea ni rompe la respuesta `HTTP 302`.
- **Invalidación Reactiva (`DEL`):** En actualizaciones y borrados se elimina `r:{shortCode}` en lugar de sobreescribir ciegamente, evitando condiciones de carrera y destinos obsoletos.
