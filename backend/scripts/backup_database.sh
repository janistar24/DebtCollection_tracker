#!/bin/sh
set -eu

backup_dir="${BACKUP_DIR:-./backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_dir/tax_collection_$timestamp.dump"

mkdir -p "$backup_dir"

if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump --format=custom --no-owner --no-acl --file="$backup_file" "$DATABASE_URL"
else
  : "${POSTGRES_HOST:?POSTGRES_HOST is required}"
  : "${POSTGRES_USER:?POSTGRES_USER is required}"
  : "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
  : "${POSTGRES_DB:?POSTGRES_DB is required}"
  export PGPASSWORD="$POSTGRES_PASSWORD"
  pg_dump \
    --host="$POSTGRES_HOST" \
    --port="${POSTGRES_PORT:-5432}" \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --format=custom \
    --no-owner \
    --no-acl \
    --file="$backup_file"
fi

pg_restore --list "$backup_file" >/dev/null
printf 'Backup verified: %s\n' "$backup_file"
