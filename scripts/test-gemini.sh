#!/usr/bin/env bash
# Test Gemini image generation endpoint with the local API key.
# Usage: bash scripts/test-gemini.sh [model]
# Default model: gemini-2.5-flash-image

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE" >&2
  exit 1
fi

# Read GEMINI_LOCAL_API_KEY from .env (ignores comments and blank lines)
API_KEY=$(grep -E '^GEMINI_LOCAL_API_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2-)

if [[ -z "$API_KEY" || "$API_KEY" == AIza... ]]; then
  echo "ERROR: GEMINI_LOCAL_API_KEY not set in .env" >&2
  exit 1
fi

MODEL="${1:-gemini-2.5-flash-image}"
URL="https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}"

BODY='{"contents":[{"parts":[{"text":"a simple red circle on white background"}]}],"generationConfig":{"responseModalities":["IMAGE"],"imageConfig":{"aspectRatio":"1:1","imageSize":"1K"}}}'

echo "Model : $MODEL"
echo "Key   : ${API_KEY:0:8}..."
echo ""

RESPONSE=$(curl -s -X POST "$URL" -H "Content-Type: application/json" -d "$BODY")

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
