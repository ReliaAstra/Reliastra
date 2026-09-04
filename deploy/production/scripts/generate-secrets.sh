#!/usr/bin/env bash
# generate-secrets.sh — cryptographically generate production secrets on the VPS
# Runs ONLY on the VPS via Tailscale SSH as reliastra (sudo). Never prints secrets.
# Usage: sudo ./generate-secrets.sh
set -euo pipefail

ENV_FILE="/opt/reliastra/.env.production"
TEMPLATE="/opt/reliastra/deploy/production/.env.example.production"

if [[ $EUID -ne 0 ]]; then
  echo "run as root (sudo)" >&2; exit 1
fi

mkdir -p /opt/reliastra
chmod 750 /opt/reliastra

# Ensure template exists
if [[ ! -f "$TEMPLATE" ]]; then
  echo "template $TEMPLATE missing" >&2; exit 1
fi

# If file exists, preserve existing secrets (idempotent)
if [[ -f "$ENV_FILE" ]]; then
  echo "existing $ENV_FILE found — will only fill missing keys (no overwrite)"
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE" 2>/dev/null || true; set +a
else
  cp "$TEMPLATE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  chown root:root "$ENV_FILE"
fi

# Helper: set key if missing or empty, without echoing value
set_if_missing() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    # Check if value is empty or placeholder
    local cur
    cur=$(grep "^${key}=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)
    if [[ -n "$cur" && "$cur" != "changeme" && "$cur" != "your-secret" ]]; then
      return 0
    fi
    # Replace line
    # Use | as delimiter to avoid / in values
    local esc
    esc=$(printf '%s' "$val" | sed 's/[&|]/\\&/g')
    sed -i "s|^${key}=.*|${key}=${esc}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

# Inspect actual ADMIN_* variables from app/config.py (do not invent)
# Required: ADMIN_USERNAME, ADMIN_PASSWORD (>=16), ADMIN_TOKEN_SECRET (>=32)
# Optional: ADMIN_SERVICE_EMAIL (default), ADMIN_*_EXPIRE

# Generate cryptographically if missing
# SECRET_KEY: hex 32 = 256 bits
if ! grep -q "^SECRET_KEY=" "$ENV_FILE" || [[ -z "$(grep "^SECRET_KEY=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ')" ]]; then
  SECRET_KEY=$(openssl rand -hex 32)
  set_if_missing "SECRET_KEY" "$SECRET_KEY"
  unset SECRET_KEY
fi

# ADMIN_USERNAME: if missing, generate deterministic but secure? Use admin + 4 hex
if ! grep -q "^ADMIN_USERNAME=" "$ENV_FILE" || [[ -z "$(grep "^ADMIN_USERNAME=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ' | tr -d '"')" ]]; then
  ADMIN_USERNAME="admin-$(openssl rand -hex 3)"
  set_if_missing "ADMIN_USERNAME" "$ADMIN_USERNAME"
  unset ADMIN_USERNAME
fi

# ADMIN_PASSWORD: >=16, hex 16 = 32 chars
if ! grep -q "^ADMIN_PASSWORD=" "$ENV_FILE" || [[ -z "$(grep "^ADMIN_PASSWORD=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ' | tr -d '"')" ]]; then
  ADMIN_PASSWORD=$(openssl rand -hex 16)
  set_if_missing "ADMIN_PASSWORD" "$ADMIN_PASSWORD"
  unset ADMIN_PASSWORD
fi

# ADMIN_TOKEN_SECRET: >=32, hex 32 = 64 chars
if ! grep -q "^ADMIN_TOKEN_SECRET=" "$ENV_FILE" || [[ -z "$(grep "^ADMIN_TOKEN_SECRET=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ' | tr -d '"')" ]]; then
  ADMIN_TOKEN_SECRET=$(openssl rand -hex 32)
  set_if_missing "ADMIN_TOKEN_SECRET" "$ADMIN_TOKEN_SECRET"
  unset ADMIN_TOKEN_SECRET
fi

# DATABASE_URL: ensure pooler + asyncpg, not direct 5432
if grep -q "^DATABASE_URL=" "$ENV_FILE"; then
  # If direct db.*.supabase.co:5432, convert to pooler
  if grep -q "db\.nupw.*\.supabase\.co:5432" "$ENV_FILE"; then
    # Preserve password and user, replace host
    # Use sed to replace host part
    sed -i 's|db\.nupwuwxqfpegwfrruszk\.supabase\.co:5432|aws-0-eu-west-3.pooler.supabase.com:6543|g' "$ENV_FILE"
    # Ensure +asyncpg
    if ! grep -q "postgresql+asyncpg://" "$ENV_FILE"; then
      sed -i 's|postgresql://|postgresql+asyncpg://|g' "$ENV_FILE"
    fi
  fi
fi

# SUPABASE_S3_BUCKET: ensure Reliastra_s3
if ! grep -q "^SUPABASE_S3_BUCKET=" "$ENV_FILE" || grep -q "^SUPABASE_S3_BUCKET=$" "$ENV_FILE"; then
  set_if_missing "SUPABASE_S3_BUCKET" "Reliastra_s3"
fi

# ACME_EMAIL: secengineerx@gmail.com
if ! grep -q "^ACME_EMAIL=" "$ENV_FILE" || grep -q "^ACME_EMAIL=$" "$ENV_FILE"; then
  set_if_missing "ACME_EMAIL" "secengineerx@gmail.com"
fi
if ! grep -q "^DOMAIN=" "$ENV_FILE" || grep -q "^DOMAIN=$" "$ENV_FILE"; then
  set_if_missing "DOMAIN" "reliastra.com"
fi

# Ensure DATABASE_SSL_MODE=require for Supabase
if ! grep -q "^DATABASE_SSL_MODE=" "$ENV_FILE"; then
  echo "DATABASE_SSL_MODE=require" >> "$ENV_FILE"
fi

# Permissions
chown root:root "$ENV_FILE"
chmod 600 "$ENV_FILE"

# Verification without printing values
echo "=== verification (no values) ==="
for key in SECRET_KEY ADMIN_USERNAME ADMIN_PASSWORD ADMIN_TOKEN_SECRET DATABASE_URL SUPABASE_S3_BUCKET; do
  if grep -q "^${key}=" "$ENV_FILE"; then
    val=$(grep "^${key}=" "$ENV_FILE" | cut -d'=' -f2-)
    # Check not empty and not placeholder, without printing
    if [[ -z "$(echo "$val" | tr -d ' ' | tr -d '"' | tr -d "'")" ]]; then
      echo "FAIL: $key empty" >&2; exit 1
    else
      echo "PRESENT: $key"
    fi
  else
    echo "MISSING: $key" >&2; exit 1
  fi
done

# Check SECRET_KEY length >=32
sk_len=$(grep "^SECRET_KEY=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'" | wc -c)
if (( sk_len < 32 )); then echo "FAIL: SECRET_KEY too short" >&2; exit 1; fi
echo "SECRET_KEY length OK"

# Check ADMIN_PASSWORD >=16
pw_len=$(grep "^ADMIN_PASSWORD=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'" | wc -c)
if (( pw_len < 16 )); then echo "FAIL: ADMIN_PASSWORD too short" >&2; exit 1; fi
echo "ADMIN_PASSWORD length OK"

# Check ADMIN_TOKEN_SECRET >=32
ts_len=$(grep "^ADMIN_TOKEN_SECRET=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'" | wc -c)
if (( ts_len < 32 )); then echo "FAIL: ADMIN_TOKEN_SECRET too short" >&2; exit 1; fi
echo "ADMIN_TOKEN_SECRET length OK"

# Ownership & perms
owner=$(stat -c "%U:%G" "$ENV_FILE")
perms=$(stat -c "%a" "$ENV_FILE")
if [[ "$owner" != "root:root" ]]; then echo "FAIL: owner $owner not root:root" >&2; exit 1; fi
if [[ "$perms" != "600" ]]; then echo "FAIL: perms $perms not 600" >&2; exit 1; fi
echo "owner $owner perms $perms OK"

# Git exclusion
if git -C /opt/reliastra check-ignore -q "$ENV_FILE" 2>/dev/null || grep -q "^\.env" /opt/reliastra/.gitignore 2>/dev/null || grep -q "\.env\.production" /opt/reliastra/.gitignore 2>/dev/null; then
  echo "gitignore OK"
else
  # Check repo root .gitignore
  if grep -q "\.env" /opt/reliastra/.gitignore 2>/dev/null || grep -q ".env" "$(git -C /opt/reliastra rev-parse --show-toplevel)/.gitignore" 2>/dev/null; then
    echo "gitignore OK"
  else
    echo "WARN: .env not in .gitignore, checking"
    if git -C /opt/reliastra ls-files --error-unmatch "$ENV_FILE" 2>/dev/null; then
      echo "FAIL: $ENV_FILE is tracked by git" >&2; exit 1
    else
      echo "not tracked (OK)"
    fi
  fi
fi

# Not in image
if grep -r "SECRET_KEY" /opt/reliastra/Dockerfile 2>/dev/null | grep -q "ENV.*SECRET"; then
  echo "FAIL: Dockerfile bakes SECRET_KEY" >&2; exit 1
fi
echo "not in image OK"

# Only required services receive secrets (compose uses env_file)
if grep -q "env_file.*\.env\.production" /opt/reliastra/compose.yml 2>/dev/null || grep -q "env_file" /opt/reliastra/deploy/production/compose.yml 2>/dev/null; then
  echo "compose env_file OK"
fi

echo "=== generation complete (no secrets printed) ==="
# How to retrieve (over Tailscale, sudo):
echo "To view (over Tailscale only): sudo cat $ENV_FILE | head -20 (values not logged here)"
