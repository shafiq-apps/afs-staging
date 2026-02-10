#!/usr/bin/env bash
set -euo pipefail

BYTES=32

gen_base64url() {
  openssl rand -base64 "$BYTES" | tr '+/' '-_' | tr -d '='
}

gen_hex() {
  openssl rand -hex "$BYTES"
}

echo "API_KEY=$(gen_hex)"
echo "API_SECRET=$(gen_hex)"
echo "CSRF_SECRET=$(gen_hex)"
echo "JWT_SECRET=$(gen_hex)"
echo "WS_AUTH_TOKEN=$(gen_hex)"