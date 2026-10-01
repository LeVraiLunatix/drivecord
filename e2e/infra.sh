#!/usr/bin/env bash
# Local infrastructure for the browser E2E test: throw-away Postgres (port 5433) + Next dev server (port 3100).
# Usage: [E2E_PROD=1] e2e/infra.sh up | down   (E2E_PROD=1: production build, much steadier for browser tests)
set -euo pipefail
PGB=/usr/lib/postgresql/16/bin
PGDATA=/tmp/e2e-pgdata
export DATABASE_URL="postgresql://postgres@localhost:5433/drivecord"
export DIRECT_URL="$DATABASE_URL"

case "${1:-up}" in
  up)
    mkdir -p "$PGDATA" && chown postgres "$PGDATA"
    su postgres -c "$PGB/initdb -D $PGDATA -A trust >/dev/null && $PGB/pg_ctl -D $PGDATA -o '-p 5433 -k /tmp' -l /tmp/e2e-pg.log start" >/dev/null
    sleep 2
    psql -h /tmp -p 5433 -U postgres -qc "create database drivecord"
    npx prisma migrate deploy >/dev/null
    export ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
    echo "$ENCRYPTION_KEY" > /tmp/e2e-enc-key
    export AUTH_SECRET="e2e-secret-e2e-secret-e2e-secret"
    echo "$AUTH_SECRET" > /tmp/e2e-auth-secret
    if [ "${E2E_PROD:-0}" = "1" ]; then
      npx next build > /tmp/e2e-build.log 2>&1
      (INTERNAL_ORIGIN=http://localhost:3100 AUTH_TRUST_HOST=true NODE_OPTIONS="--require $(pwd)/e2e/server-fake-discord.cjs" npx next start -p 3100 > /tmp/e2e-next.log 2>&1 &)
    else
    (AUTH_TRUST_HOST=true NODE_OPTIONS="--require $(pwd)/e2e/server-fake-discord.cjs" npx next dev -p 3100 > /tmp/e2e-next.log 2>&1 &)
    fi
    for i in $(seq 1 60); do sleep 2; curl -s -o /dev/null http://localhost:3100/api/v2/none && break; done
    echo "up"
    ;;
  down)
    fuser -k 3100/tcp >/dev/null 2>&1 || true
    su postgres -c "$PGB/pg_ctl -D $PGDATA stop -m fast" >/dev/null 2>&1 || true
    rm -rf "$PGDATA" /tmp/e2e-auth-secret /tmp/e2e-enc-key
    echo "down"
    ;;
esac
