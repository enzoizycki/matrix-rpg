#!/usr/bin/env sh
# THE CONSTRUCT - inicia o sistema no macOS/Linux (requer Docker).
set -e
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker não encontrado. Instale em https://docs.docker.com/get-docker/"
  exit 1
fi

[ -f .env ] || cp .env.example .env

docker compose up -d --build

PORT_VALUE=$(grep -E '^PORT=' .env | head -n1 | cut -d= -f2)
echo
echo "Pronto! Abra http://localhost:${PORT_VALUE:-3000}"
