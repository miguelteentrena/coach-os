#!/usr/bin/env bash
# Copia de seguridad cifrada de la base de datos de COACH OS.
# Uso: SUPABASE_DB_URL=postgresql://... BACKUP_PASSPHRASE=... ./scripts/backup.sh
set -euo pipefail
out="coachos-$(date +%Y%m%d-%H%M).sql.gz.gpg"
pg_dump --no-owner --no-privileges --schema=public "$SUPABASE_DB_URL" | gzip | gpg --batch --symmetric --cipher-algo AES256 --passphrase "$BACKUP_PASSPHRASE" -o "$out"
echo "Copia creada: $out"
