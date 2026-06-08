#!/usr/bin/env bash
set -euo pipefail

MODEL_REF="${BONSAI_MODEL_REF:-prism-ml/Bonsai-8B-gguf:Q1_0}"
HOST="${BONSAI_HOST:-127.0.0.1}"
PORT="${BONSAI_PORT:-8080}"
GPU_LAYERS="${BONSAI_GPU_LAYERS:-99}"

if ! command -v llama-server >/dev/null 2>&1; then
  echo "llama-server was not found."
  echo "Install llama.cpp first, for example:"
  echo "  brew install llama.cpp"
  echo
  echo "Then rerun:"
  echo "  pages/Local-AI/start-bonsai-server.sh"
  exit 127
fi

echo "Starting Bonsai 8B 1-bit at http://${HOST}:${PORT}/v1"
echo "Model: ${MODEL_REF}"

exec llama-server \
  -hf "${MODEL_REF}" \
  --host "${HOST}" \
  --port "${PORT}" \
  -ngl "${GPU_LAYERS}" \
  "$@"
