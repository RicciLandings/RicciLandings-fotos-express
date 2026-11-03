#!/usr/bin/env bash
# Prueba las migraciones y la lógica de la base en un Postgres local descartable.
# Uso: npm run test:db   (o con DATABASE_URL apuntando a un Postgres vacío)
set -euo pipefail
cd "$(dirname "$0")/../.."

correr() {
  local url="$1"
  psql "$url" -q -v ON_ERROR_STOP=1 -f supabase/tests/preparar_supabase.sql
  for m in supabase/migrations/*.sql; do
    echo "→ $m"
    psql "$url" -q -v ON_ERROR_STOP=1 -f "$m"
  done
  psql "$url" -q -At -v ON_ERROR_STOP=1 -f supabase/tests/pruebas.sql | grep -v "^$"
}

if [[ -n "${DATABASE_URL:-}" ]]; then
  correr "$DATABASE_URL"
  exit 0
fi

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[[ -n "$PGBIN" ]] || { echo "No encontré Postgres. Instalalo o pasá DATABASE_URL."; exit 1; }
DIR="$(mktemp -d)"
PUERTO=55433
trap '"$PGBIN/pg_ctl" -D "$DIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT

if [[ $EUID -eq 0 ]]; then
  chown -R postgres "$DIR"
  if command -v sudo >/dev/null; then
    ejecutar() { sudo -u postgres "$@"; }
  else
    ejecutar() { su postgres -c "$(printf '%q ' "$@")"; }
  fi
else
  ejecutar() { "$@"; }
fi

ejecutar "$PGBIN/initdb" -D "$DIR" -U postgres -A trust >/dev/null
ejecutar "$PGBIN/pg_ctl" -D "$DIR" -o "-p $PUERTO -k $DIR -c listen_addresses=" -l "$DIR/log" -w start >/dev/null
correr "postgresql://postgres@/postgres?host=$DIR&port=$PUERTO"
