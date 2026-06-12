#!/usr/bin/env bash
# Test Gemini image generation via Vertex AI (service-account OAuth).
# Mints a short-lived access token from GOOGLE_SERVICE_ACCOUNT_JSON in .env
# and calls the same endpoint the Netlify function uses.
#
# Usage: bash scripts/test-gemini.sh [model]
# Example: bash scripts/test-gemini.sh gemini-2.5-flash-image

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE" >&2
  exit 1
fi

MODEL="${1:-gemini-2.5-flash-image}"

SA_JSON=$(grep -E '^GOOGLE_SERVICE_ACCOUNT_JSON=' "$ENV_FILE" | head -1 | cut -d= -f2-)
if [[ -z "$SA_JSON" || "$SA_JSON" == '{"type":"service_account"'*'...'* ]]; then
  echo "ERROR: GOOGLE_SERVICE_ACCOUNT_JSON not set in .env" >&2
  exit 1
fi

VERTEX_LOCATION=$(grep -E '^VERTEX_LOCATION=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)
VERTEX_LOCATION="${VERTEX_LOCATION:-global}"
VERTEX_PROJECT_ID=$(grep -E '^VERTEX_PROJECT_ID=' "$ENV_FILE" | head -1 | cut -d= -f2- || true)
if [[ -z "$VERTEX_PROJECT_ID" ]]; then
  VERTEX_PROJECT_ID=$(echo "$SA_JSON" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).project_id))")
fi

# Mint an access token with the same library the Netlify functions use.
TOKEN=$(cd "$ROOT_DIR" && GOOGLE_SERVICE_ACCOUNT_JSON="$SA_JSON" node --input-type=module -e "
import { GoogleAuth } from 'google-auth-library';
const auth = new GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();
console.log(token);
")

if [[ "$VERTEX_LOCATION" == "global" ]]; then
  HOST="aiplatform.googleapis.com"
else
  HOST="${VERTEX_LOCATION}-aiplatform.googleapis.com"
fi
URL="https://${HOST}/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${MODEL}:generateContent"
BODY='{"contents":[{"parts":[{"text":"a simple red circle on white background"}]}],"generationConfig":{"responseModalities":["IMAGE"],"imageConfig":{"aspectRatio":"1:1","imageSize":"1K"}}}'

echo "Model    : $MODEL"
echo "Project  : $VERTEX_PROJECT_ID"
echo "Location : $VERTEX_LOCATION"
echo ""

RESPONSE=$(curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$BODY")

ERROR=$(echo "$RESPONSE" | jq -r '.error.message // empty')
if [[ -n "$ERROR" ]]; then
  CODE=$(echo "$RESPONSE" | jq -r '.error.code')
  echo "ERROR $CODE: $ERROR"
  exit 1
fi

HAS_IMAGE=$(echo "$RESPONSE" | jq -r '.candidates[0].content.parts[0].inlineData.mimeType // empty')
if [[ -n "$HAS_IMAGE" ]]; then
  echo "OK — imagen recibida ($HAS_IMAGE)"
else
  echo "WARN — sin imagen en la respuesta"
  echo "$RESPONSE" | jq '.candidates[0].content.parts[0]'
fi
