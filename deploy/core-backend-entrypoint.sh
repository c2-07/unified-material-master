#!/bin/sh
# Entrypoint for the core-backend container.
#
# The previous setup ran `prisma db push && prisma db seed` on every start.
# That is fine for a throwaway dev database and destructive in production:
# prisma/seed.ts calls reset(), which deleteMany()s every table. A container
# restart would silently wipe all live data.
#
# So: the schema is always synced (idempotent), but seeding only happens when
# the database is actually empty, or when it is explicitly requested.

set -e

# Reachability and row counting both go through the generated Prisma client:
# `prisma db execute` runs statements but never returns result rows.
db_query() {
  node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    $1
  " 2>/dev/null
}

echo "[entrypoint] waiting for the database..."
ATTEMPTS=0
until [ "$(db_query "p.\$queryRaw\`SELECT 1\`.then(()=>console.log('up')).catch(()=>console.log('down'))")" = "up" ]; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 30 ]; then
    echo "[entrypoint] database unreachable after 30 attempts" >&2
    exit 1
  fi
  sleep 2
done
echo "[entrypoint] database is reachable"

if [ "${RUN_MIGRATIONS_ON_START:-1}" = "1" ]; then
  # db push, not migrate deploy: this schema has drifted from its migration
  # history (two *_init migrations exist) and the dev stack has always
  # provisioned with db push.
  echo "[entrypoint] syncing schema (prisma db push)"
  npx prisma db push --skip-generate
fi

SEED_ON_START="${SEED_ON_START:-auto}"
if [ "$SEED_ON_START" != "0" ]; then
  if [ "$SEED_ON_START" = "1" ] || [ "${FORCE_SEED:-0}" = "1" ]; then
    echo "[entrypoint] reseeding (explicitly requested; this deletes existing data)"
    npx prisma db seed
  else
    ROWS=$(db_query "p.globalCatalogMapping.count().then(c=>console.log(c)).catch(()=>console.log('err'))")
    case "$ROWS" in
      0)
        echo "[entrypoint] database is empty, seeding"
        npx prisma db seed
        ;;
      ''|err)
        # Seeding truncates every table, so an inconclusive check must not be
        # treated as "empty". Boot without touching data and let a human look:
        # an unseeded catalog is visible, wiped data is not.
        echo "[entrypoint] WARNING: could not determine whether the database is seeded." >&2
        echo "[entrypoint] Skipping seed to avoid truncating existing data." >&2
        echo "[entrypoint] Seed explicitly with: docker compose -f docker-compose.prod.yml run --rm -e FORCE_SEED=1 core-backend" >&2
        ;;
      *)
        echo "[entrypoint] database already has $ROWS catalog mappings, skipping seed"
        ;;
    esac
  fi
fi

echo "[entrypoint] starting core-backend on port ${PORT:-4000}"
exec node dist/server.js
