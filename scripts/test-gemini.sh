#!/usr/bin/env bash
# Test Gemini image generation endpoint.
# Usage: bash scripts/test-gemini.sh [model] [--public] [--referer URL]
#
# Flags:
#   --public          Use GEMINI_PUBLIC_API_KEY instead of GEMINI_LOCAL_API_KEY
#   --referer URL     Add Referer header (e.g. https://next.pictos.net/)
#   --no-referer      Explicitly skip Referer header (default for local key)
#
# Examples:
#   bash scripts/test-gemini.sh
#   bash scripts/test-gemini.sh gemini-2.5-flash-image --public --referer https://next.pictos.net/
#   bash scripts/test-gemini.sh gemini-2.5-flash-image --public --no-referer

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE" >&2
  exit 1
fi

MODEL="gemini-2.5-flash-image"
USE_PUBLIC=false
REFERER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public)      USE_PUBLIC=true; shift ;;
    --referer)     REFERER="$2"; shift 2 ;;
    --no-referer)  REFERER=""; shift ;;
    *)             MODEL="$1"; shift ;;
  esac
done

if $USE_PUBLIC; then
  API_KEY=$(grep -E '^GEMINI_PUBLIC_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2-)
  KEY_NAME="GEMINI_PUBLIC_API_KEY"
else
  API_KEY=$(grep -E '^GEMINI_LOCAL_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2-)
  KEY_NAME="GEMINI_LOCAL_API_KEY"
fi

if [[ -z "$API_KEY" || "$API_KEY" == AIza... ]]; then
  echo "ERROR: $KEY_NAME not set in .env" >&2
  exit 1
fi

URL="https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}"
BODY='{"contents":[{"parts":[{"text":"a simple red circle on white background"}]}],"generationConfig":{"responseModalities":["IMAGE"],"imageConfig":{"aspectRatio":"1:1","imageSize":"1K"}}}'

echo "Model   : $MODEL"
echo "Key     : $KEY_NAME (${API_KEY:0:8}...)"
echo "Referer : ${REFERER:-"(none)"}"
echo ""

CURL_ARGS=(-s -X POST "$URL" -H "Content-Type: application/json" -d "$BODY")
if [[ -n "$REFERER" ]]; then
  CURL_ARGS+=(-H "Referer: $REFERER")
fi

RESPONSE=$(curl "${CURL_ARGS[@]}")

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
