# Esquema de Base de Datos (UML) y Redis

Modelo de persistencia relacional en **PostgreSQL** (`TypeORM`) para el *Control Plane* y modelo clave-valor en **Redis** (`ioredis`) para el *Data Plane*.

---

## 1. Diagrama UML de Dominio (`classDiagram`)

```mermaid
classDiagram
  direction LR

  class Plan {
    <<entity>>
    +String id
    +String name
    +Boolean isActive
  }

  class User {
    <<entity>>
    +UUID id
    +String email
    -String password
    +String planId
    +DateTime createdAt
    +DateTime updatedAt
  }

  class Link {
    <<entity>>
    +UUID id
    +String shortCode
    +String name
    +String targetUrl
    +Boolean isActive
    +QrConfig qrConfig
    +UUID userId
    +DateTime createdAt
    +DateTime updatedAt
  }

  class QrConfig {
    <<value_object>>
    +String foregroundColor
    +String backgroundColor
    +String format
    +Int margin
    +Int width
    +String errorCorrectionLevel
  }

  class LinkEvent {
    <<entity>>
    +BigInt id
    +UUID linkId
    +String ipAddress
    +String userAgent
    +String country
    +String os
    +String browser
    +String referer
    +DateTime scannedAt
  }

  class Subscription {
    <<entity>>
    +UUID id
    +UUID userId
    +String providerName
    +String providerCustomerId
    +String providerSubscriptionId
    +String providerPriceId
    +SubscriptionStatus status
    +DateTime currentPeriodStart
    +DateTime currentPeriodEnd
    +Boolean cancelAtPeriodEnd
    +DateTime createdAt
    +DateTime updatedAt
  }

  class Order {
    <<entity>>
    +UUID id
    +UUID userId
    +String providerPaymentIntentId
    +Decimal totalAmount
    +String currency
    +OrderPaymentStatus paymentStatus
    +OrderFulfillmentStatus fulfillmentStatus
    +ShippingAddress shippingAddress
    +DateTime createdAt
    +DateTime updatedAt
  }

  class OrderItem {
    <<entity>>
    +UUID id
    +UUID orderId
    +UUID linkId
    +String itemType
    +Int quantity
    +Decimal unitPrice
    +Record specifications
  }

  Plan "0..1" --> "0..*" User : categoriza
  User "1" --> "0..*" Link : posee
  User "1" --> "0..1" Subscription : titular
  User "1" --> "0..*" Order : solicita
  Order "1" *-- "1..*" OrderItem : contiene
  Link "0..1" <-- "0..*" OrderItem : imprime QR/NFC
  Link "1" *-- "1" QrConfig : embebe (jsonb)
  Link "1" --> "0..*" LinkEvent : registra
```

---

## 2. Diagrama Entidad-Relación Físico (`erDiagram`)

```mermaid
erDiagram
  PLANS ||--o{ USERS : "plan_id (ON DELETE SET NULL)"
  USERS ||--o{ LINKS : "user_id (ON DELETE CASCADE)"
  USERS ||--o| SUBSCRIPTIONS : "user_id (ON DELETE CASCADE)"
  USERS ||--o{ ORDERS : "user_id"
  ORDERS ||--|{ ORDER_ITEMS : "order_id (ON DELETE CASCADE)"
  LINKS ||--o{ LINK_EVENTS : "link_id (ON DELETE CASCADE)"
  LINKS |o--o{ ORDER_ITEMS : "link_id (opcional)"

  PLANS {
    varchar id PK "varchar(50) - STARTER, PRO"
    varchar name "varchar(100)"
    boolean is_active "default true"
  }

  USERS {
    uuid id PK "UUID v4"
    varchar email UK "varchar(255) NOT NULL"
    varchar password "bcrypt hash (select: false)"
    varchar plan_id FK "nullable -> plans.id"
    timestamptz created_at
    timestamptz updated_at
  }

  LINKS {
    uuid id PK "UUID v4"
    varchar short_code UK "varchar(16) Base62"
    varchar name "varchar(150) nullable (nombre referencia)"
    text target_url "NOT NULL"
    boolean is_active "default true"
    jsonb qr_config "default {}"
    uuid user_id FK "NOT NULL -> users.id"
    timestamptz created_at
    timestamptz updated_at
  }

  LINK_EVENTS {
    bigint id PK "autoincrement"
    uuid link_id FK "NOT NULL -> links.id"
    varchar ip_address "varchar(128) SHA-256 + salt"
    text user_agent "nullable"
    varchar country "char(2) ISO-2 nullable"
    varchar os "varchar(64) nullable"
    varchar browser "varchar(64) nullable"
    text referer "nullable"
    timestamptz scanned_at "default CURRENT_TIMESTAMP"
  }

  SUBSCRIPTIONS {
    uuid id PK "UUID v4"
    uuid user_id UK "FK NOT NULL -> users.id"
    varchar provider_name "varchar(32) default STRIPE"
    varchar provider_customer_id "varchar(255) NOT NULL"
    varchar provider_subscription_id UK "varchar(255) nullable"
    varchar provider_price_id "varchar(255) nullable"
    varchar status "varchar(32) default incomplete"
    timestamptz current_period_start "nullable"
    timestamptz current_period_end "nullable"
    boolean cancel_at_period_end "default false"
    timestamptz created_at
    timestamptz updated_at
  }

  ORDERS {
    uuid id PK "UUID v4"
    uuid user_id "UUID NOT NULL"
    varchar provider_payment_intent_id UK "varchar(255) nullable"
    decimal total_amount "decimal(10,2) NOT NULL"
    varchar currency "varchar(3) default USD"
    varchar payment_status "varchar(32) default pending"
    varchar fulfillment_status "varchar(32) default unfulfilled"
    jsonb shipping_address "nullable"
    timestamptz created_at
    timestamptz updated_at
  }

  ORDER_ITEMS {
    uuid id PK "UUID v4"
    uuid order_id FK "NOT NULL -> orders.id"
    uuid link_id "UUID nullable (enlace impreso)"
    varchar item_type "varchar(64) NOT NULL"
    int quantity "NOT NULL (> 0)"
    decimal unit_price "decimal(10,2) NOT NULL"
    jsonb specifications "nullable (color, chip, size)"
  }
```

---

## 3. Índices y Reglas de Integridad

| Tabla | Índice / Regla | Columnas | Propósito |
| :--- | :--- | :--- | :--- |
| `plans` | Auto-Seeding (`OnModuleInit`) | `(id)` `PK` | `PlanContextService` y `UsersService` garantizan de forma idempotente la existencia de `STARTER` y `PRO` antes de mutar `users.plan_id`. |
| `users` | `idx_users_email` | `(email)` `UNIQUE` | Búsqueda `O(log n)` en login y unicidad de cuentas. |
| `links` | `idx_links_short_code` | `(short_code)` `UNIQUE` | Resolución inmediata en *Cache Miss* y unicidad de slugs. |
| `links` | `idx_links_user_id` | `(user_id)` | Conteo de cuota por usuario y listados del dashboard. |
| `link_events` | `idx_link_events_link_id` | `(link_id)` | Filtrado por enlace y borrado en cascada eficiente. |
| `link_events` | `idx_link_events_scanned` | `(link_id, scanned_at DESC)` | Series de tiempo y analíticas recientes por enlace. |
| `subscriptions` | `idx_subscriptions_user_id` | `(user_id)` `UNIQUE` | Garantiza relación `1:1` entre usuario y suscripción. |
| `subscriptions` | `idx_subscriptions_provider_customer_id` | `(provider_customer_id)` | Correlación rápida en Webhooks (`invoice.payment_failed`, `customer.subscription.*`). |
| `orders` | `idx_orders_user_id` | `(user_id)` | Historial de pedidos físicos de placas y tarjetas NFC por cliente. |
| `order_items` | `idx_order_items_order_id` | `(order_id)` | Carga relacional eficiente de ítems por orden (`ON DELETE CASCADE`). |

---

## 4. Estructura en Memoria (Redis)

Configurado con política de desalojo **`allkeys-lru`** para liberar automáticamente enlaces fríos bajo presión de RAM.

| Clave | Tipo Redis | Operaciones | Estructura / Valor |
| :--- | :--- | :--- | :--- |
| `r:{shortCode}` | `STRING` | `GET`, `SET`, `DEL` | Cadena con `targetUrl` para respuesta `302` directa. |
| `queue:clicks` | `LIST` | `LPUSH`, `RPOP` | Buffer en RAM de clics entrantes. `LPUSH` asíncrono desde el Fast-Path y `RPOP` en lote cada 15s desde `AnalyticsWorkerService` para inserción en `link_events`. JSON: `{ shortCode, linkId?, ipAddress, userAgent, referer, scannedAt }`. |
