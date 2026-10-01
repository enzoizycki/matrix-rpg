#!/usr/bin/env bash
# Roda os testes que alteram a configuração de IA contra um servidor ISOLADO:
# banco descartável + porta própria. A sua instalação e as suas chaves nunca são tocadas.
set -u
cd "$(dirname "$0")/.."

ADMIN="${ADMIN_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"
DB_NAME="construct_itest_$$"
# Porta livre escolhida na hora: nunca conflita com outro servidor.
PORT_TEST="${ISOLATED_PORT:-$(node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})')}"
BASE="$(printf '%s' "$ADMIN" | sed -E 's#/[^/]*$##')"
export DATABASE_URL="$BASE/$DB_NAME"

cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then kill "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null; fi
  psql "$ADMIN" -q -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE)" >/dev/null 2>&1
}
trap cleanup EXIT

psql "$ADMIN" -q -c "CREATE DATABASE \"$DB_NAME\"" || { echo "Não foi possível criar o banco de teste."; exit 1; }

# Sem nenhuma chave no ambiente: o servidor isolado só conhece o que os testes configurarem.
env -u GEMINI_API_KEY -u GEMINI_MODEL -u OLLAMA_API_KEY -u OLLAMA_BASE_URL -u OLLAMA_HOST -u OLLAMA_MODEL -u AI_PROVIDER \
  node node_modules/next/dist/bin/next start -p "$PORT_TEST" >/tmp/isolated-server.log 2>&1 &
# O PID é o do próprio servidor (sem npx no meio), então o encerramento é garantido.
SERVER_PID=$!

for _ in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$PORT_TEST/api/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -sf "http://127.0.0.1:$PORT_TEST/api/health" >/dev/null || { echo "Servidor isolado não iniciou:"; tail -20 /tmp/isolated-server.log; exit 1; }

ISOLATED_TEST_SERVER=1 TEST_BASE_URL="http://127.0.0.1:$PORT_TEST" \
  npx playwright test --config=playwright.config.cjs "${@:-tests/ollama-integration.spec.ts}"
STATUS=$?
echo "--- log do servidor isolado (erros) ---"; grep -i -E "error|fail" /tmp/isolated-server.log | grep -v -i "deprecat" | head -10
exit $STATUS
