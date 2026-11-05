# Documento de Especificación de Requerimientos de Software (SRS)

Este documento especifica los requerimientos funcionales y no funcionales que cumple la plataforma **Dynamic QR & Link Shortener Platform (SaaS + Hardware NFC)**.

---

## 1. Alcance y Objetivos del Sistema

La plataforma proporciona un ecosistema integrado para:
1. Generar y administrar enlaces cortos y códigos QR dinámicos cuya URL de destino puede modificarse en cualquier momento sin alterar el código impreso ni el chip físico.
2. Servir redirecciones públicas de ultra-baja latencia con captura asíncrona de telemetría y analíticas.
3. Ofrecer planes de suscripción digital (Starter y Pro) con cuotas y permisos diferenciados.
4. Proveer un canal de comercio electrónico para la compra de soportes físicos de hardware (tarjetas plásticas PVC, expositores acrílicos para mesas y stickers resinados con chips NFC).

---

## 2. Requerimientos Funcionales (RF)

### Módulo 1: Autenticación, Usuarios y Control de Acceso
* **RF-01 (Registro de Usuarios):** El sistema debe permitir a nuevos usuarios registrarse mediante correo electrónico y contraseña. El correo debe normalizarse (eliminación de espacios y minúsculas) y la contraseña debe almacenarse cifrada con un algoritmo robusto (`bcrypt`). Al registrarse, se asigna automáticamente el plan base `STARTER`.
* **RF-02 (Inicio de Sesión):** El sistema debe autenticar credenciales y emitir un token de acceso seguro e intercambiable (`JWT Stateless`) que contenga el identificador del usuario, su email y su nivel de plan activo.
* **RF-03 (Consulta de Perfil y Rotación de Token):** El sistema debe permitir a los usuarios autenticados consultar su perfil (`GET /auth/me`), devolviendo el estado actualizado de su cuenta y emitiendo un nuevo token si su plan cambió de forma asíncrona (ej. mediante webhook de pago).
* **RF-04 (Aislamiento de Cuentas - Anti-IDOR):** Todas las operaciones de lectura, modificación y eliminación de recursos deben validar que el recurso pertenezca exclusivamente al usuario autenticado en la sesión actual.

### Módulo 2: Enlaces Dinámicos y Códigos QR
* **RF-05 (Creación de Enlace Corto):** Los usuarios autenticados pueden crear enlaces cortos indicando un nombre descriptivo y una URL de destino (`targetUrl`).
* **RF-06 (Generación de Slug Único):** Si el usuario no proporciona un código corto (`shortCode`), el sistema debe generar aleatoriamente un identificador alfanumérico único. En caso de colisión, el sistema debe reintentar automáticamente la generación.
* **RF-07 (Slug Personalizado):** Los usuarios pueden definir un slug personalizado, siempre que no colisione con slugs existentes ni con rutas reservadas del sistema (como `auth`, `links`, `docs`, `billing`, etc.).
* **RF-08 (Validación Estricta de Destino):** La URL de destino debe validar obligatoriamente esquemas seguros `http://` o `https://`, bloqueando esquemas no seguros como `javascript:`, `data:` o `ftp:`.
* **RF-09 (Personalización del Diseño QR):** Los usuarios con planes que lo permitan pueden configurar el color de primer plano (`foregroundColor`), color de fondo (`backgroundColor`), margen, nivel de corrección de error y formato de salida.
* **RF-10 (Renderizado de Códigos QR):** El sistema debe generar dinámicamente imágenes de códigos QR en formatos vectoriales `SVG` (`image/svg+xml`) o matriciales `PNG` (`image/png`), permitiendo su descarga directa desde la API o visualización en la interfaz.
* **RF-11 (Edición de Enlaces):** Los usuarios pueden modificar en cualquier momento el nombre, la URL de destino, el estado activo/inactivo y la configuración del código QR sin cambiar el código corto.
* **RF-12 (Eliminación de Enlaces):** Los usuarios pueden eliminar sus enlaces. La eliminación debe purgar el enlace de la base de datos y retirar de inmediato la clave de memoria en caché.

### Módulo 3: Redirección Pública (Fast-Path)
* **RF-13 (Redirección HTTP 302 Inmediata):** Al acceder a `GET /:shortCode`, el sistema debe responder con un código `HTTP 302 Found` con la cabecera `Location` apuntando a la URL de destino configurada.
* **RF-14 (Resolución desde Memoria):** El enlace debe resolverse prioritariamente en memoria RAM (Redis). Si no está en memoria (Cache Miss), se consulta la base de datos relacional y se repuebla la memoria.
* **RF-15 (Manejo de Enlaces Inexistentes o Inactivos):** Si el código corto no existe o el enlace está desactivado (`isActive: false`), el sistema debe devolver inmediatamente un código `HTTP 404 Not Found` sin redirigir ni registrar métricas falsas.
* **RF-16 (Exclusión de Rutas de Sistema):** Peticiones a archivos automáticos del navegador como `/favicon.ico` deben responder `404` sin consultar bases de datos.

### Módulo 4: Analíticas y Telemetría
* **RF-17 (Encolado Asíncrono de Clics):** Cada redirección exitosa debe registrar asíncronamente un evento de escaneo en una cola en memoria (`queue:clicks`) en modo no bloqueante (*fire-and-forget*).
* **RF-18 (Geolocalización del Visitante):** El sistema debe detectar el país del visitante evaluando cabeceras perimetrales (`CF-IPCountry`, `X-Country-Code`, `CloudFront-Viewer-Country`) y aplicando bases GeoIP como respaldo.
* **RF-19 (Detección de Plataforma):** El sistema debe parsear el encabezado `User-Agent` para identificar el sistema operativo (iOS, Android, Windows, macOS, Linux) y el navegador (Chrome, Safari, Firefox, Edge).
* **RF-20 (Anonimización de Dirección IP):** La dirección IP del visitante debe anonimizarse mediante un hash criptográfico `SHA-256` con sal secreta antes de su almacenamiento permanente.
* **RF-21 (Ingesta y Vaciado en Lote):** Un proceso en segundo plano debe extraer periódicamente lotes de eventos desde la memoria RAM hacia la base de datos relacional para optimizar escrituras masivas y liberar memoria.
* **RF-22 (Consulta de Métricas y KPIs):** Los usuarios pueden consultar estadísticas detalladas de cada enlace (`GET /links/:id/stats`), incluyendo total de clics, visitantes únicos, serie temporal diaria, distribución por país, sistema operativo, navegador y páginas de procedencia (*referrers*).

### Módulo 5: Motor de Planes y Límites (Strategy Pattern)
* **RF-23 (Límites de Enlaces Activos):** El sistema debe validar que los usuarios no excedan el número de enlaces dinámicos permitidos por su plan (3 en Starter, 50 en Pro).
* **RF-24 (Retención Histórica de Métricas):** El sistema debe restringir la ventana temporal de analíticas según el plan (máximo 7 días para Starter, hasta 365 días para Pro).
* **RF-25 (Control de Personalización Visual):** El sistema debe bloquear intentos de personalizar colores o logos en usuarios del plan gratuito Starter.
* **RF-26 (Fallback Seguro de Planes):** Si una cuenta no tiene un plan asignado o contiene un identificador inválido, el sistema debe aplicar de forma predeterminada las reglas del plan Starter sin interrumpir el servicio.

### Módulo 6: Facturación SaaS y Pedidos Físicos
* **RF-27 (Suscripción a Plan Pro):** El sistema debe permitir iniciar suscripciones recurrentes generando sesiones oficiales de Stripe Checkout en modo `subscription`.
* **RF-28 (Portal de Clientes de Stripe):** Los usuarios con suscripción activa pueden generar enlaces temporales al portal de autoservicio de Stripe para gestionar métodos de pago y descargar facturas.
* **RF-29 (Cancelación de Suscripción):** Los usuarios pueden cancelar su suscripción en cualquier momento, revirtiendo su cuenta de forma inmediata al plan Starter y cancelando la renovación en Stripe.
* **RF-30 (Procesamiento de Webhooks de Stripe):** El sistema debe procesar eventos asíncronos de Stripe (`customer.subscription.updated`, `customer.subscription.deleted`, `checkout.session.completed`, `invoice.payment_failed`) garantizando idempotencia y sincronizando el estado del plan.
* **RF-31 (Compra de Hardware QR + NFC):** El sistema debe permitir la creación de pedidos de insumos físicos (tarjetas plásticas PVC, expositores acrílicos, stickers NFC) con datos de envío, calculando el importe total con precios oficiales del servidor y generando una sesión de cobro en Stripe Checkout (`mode: payment`).
* **RF-32 (Validación de Enlaces Impresos):** Los ítems de hardware que especifiquen un enlace asociado deben validar que dicho enlace pertenezca al usuario comprador antes de confirmar la orden.
* **RF-33 (Emisión Directa de Órdenes):** El sistema debe permitir registrar pedidos físicos marcados directamente como pagados y en manufactura para ventas de mostrador o pruebas.
* **RF-34 (Feature Flag de Pedidos Físicos):** El módulo de hardware físico debe poder activarse o desactivarse en tiempo real tanto por variable de entorno como mediante un endpoint administrativo (`PATCH /billing/config/physical-orders`).
* **RF-35 (Modo Sandbox de Pruebas):** En entornos de desarrollo sin credenciales reales de Stripe, el sistema debe ofrecer una pasarela interactiva local de simulación para verificar pagos y suscripciones de extremo a extremo.

---

## 3. Requerimientos No Funcionales (RNF)

### RNF-01: Rendimiento y Latencia
* El endpoint de redirección (`GET /:shortCode`) debe resolver solicitudes en menos de **5 milisegundos** cuando la clave está en memoria RAM (Cache Hit).
* La resolución de cuotas y reglas de planes debe ejecutarse en complejidad temporal constante **$O(1)$** en memoria.
* El endpoint de redirección pública debe estar exento de límites de tasa (*rate limiting*) mediante `@SkipThrottle()` para absorber picos masivos de escaneo en eventos o campañas publicitarias.

### RNF-02: Escalabilidad y Concurrencia
* **Separación de Planos:** El sistema debe aislar el plano de datos de alto tráfico (*Data Plane*) del plano de control transaccional (*Control Plane*), evitando que la navegación de usuarios en el dashboard afecte la velocidad de redirección.
* **Desalojo Eficiente de Memoria:** La base de datos en memoria (Redis) debe configurarse con política `allkeys-lru` para descartar enlaces fríos automáticamente bajo presión de RAM.
* **Persistencia Agrupada:** La ingesta de clics debe procesarse por lotes periódicos de hasta 200 eventos, reduciendo la carga de transacciones por segundo en PostgreSQL.

### RNF-03: Seguridad y Protección de Datos
* **Mitigación de Inyección y Malformaciones:** Validación estricta de todas las entradas mediante tuberías globales (`ValidationPipe`) con `whitelist: true`, `forbidNonWhitelisted: true` y transformación automática de tipos.
* **Protección Criptográfica de Contraseñas:** Hashing de contraseñas con factor de costo `bcrypt` no menor a 10 y longitud restringida entre 8 y 72 caracteres.
* **Validación Criptográfica de Webhooks:** Verificación de firma HMAC (`stripe-signature`) contra el buffer crudo (`rawBody: true`) para prevenir falsificación de eventos de pago.
* **Privacidad (GDPR):** Ninguna dirección IP de visitante debe persistirse en texto plano.
* **Protección contra Fuerza Bruta:** Límites de tasa globales de peticiones HTTP en rutas transaccionales y de autenticación mediante `@nestjs/throttler`.

### RNF-04: Disponibilidad y Tolerancia a Fallos
* **Re-encolado Resiliente:** Si el vaciado de eventos hacia PostgreSQL falla por bloqueo o desconexión, los eventos extraídos deben reinsertarse automáticamente en Redis para evitar pérdida de datos.
* **Apagado Limpio (Graceful Shutdown):** Al recibir señales de terminación (`SIGTERM`/`SIGINT`), el servidor debe vaciar los eventos pendientes en cola hacia la base de datos antes de cerrar las conexiones.
* **Degradación Elegante:** Si la pasarela de pagos externa no está disponible en desarrollo, el sistema debe conmutar limpiamente a la interfaz de Sandbox sin arrojar excepciones no controladas.

### RNF-05: Mantenibilidad y Calidad de Código
* **Principios SOLID:** Adherencia estricta a Inversión de Dependencias (DIP) mediante repositorios basados en interfaces y tokens Symbol, eliminando el acoplamiento directo entre servicios y el ORM.
* **Patrón Orquestador:** Métodos de negocio públicos estructurados como coordinadores limpios, delegando pasos atómicos en métodos privados de responsabilidad única.
* **Modularidad de Dominio:** Desacoplamiento modular en contextos funcionales claros (`AuthModule`, `LinksModule`, `CacheModule`, `PlansModule`, `BillingModule`).
* **Cobertura de Pruebas:** Mantenimiento de suites unitarias y pruebas de integración End-to-End sobre el protocolo HTTP con cobertura de casos positivos, negativos y de frontera.

### RNF-06: Interoperabilidad y Documentación Viva
* La API debe exponer una especificación interactiva estandarizada bajo **OpenAPI 3.0 (Swagger)** disponible en formatos UI (`/docs`), JSON (`/docs-json`) y YAML (`/docs-yaml`).
* La aplicación debe admitir ejecución en contenedores Docker estandarizados mediante `docker compose`.
