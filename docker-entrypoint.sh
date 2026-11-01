#!/bin/sh
set -e

# Si el comando es iniciar el servidor principal (node dist/main),
# ejecuta primero el seeder idempotente de planes de base de datos.
if [ "$1" = "node" ] && [ "$2" = "dist/main" ]; then
  echo "==> [Container Startup] Ejecutando seeder idempotente de planes..."
  node dist/seed
fi

exec "$@"
