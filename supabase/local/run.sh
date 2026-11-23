#!/usr/bin/env bash
# Recrea la base de pruebas y aplica shim + migraciones + pruebas.
# Uso: PGHOST=/tmp PGPORT=54329 PGUSER=postgres ./local/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-loyalty_test}
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
for f in local/00_supabase_shim.sql migrations/*.sql; do
  echo ">> $f"; psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
for f in tests/*.sql; do
  echo ">> $f"; psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
echo "TODO OK"
