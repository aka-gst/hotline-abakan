#!/bin/bash
set -e
cd "$(dirname "$0")"
GAME_DIR="$PWD/Game"
EXPECTED="HOTLINE_ABAKAN_VERTICAL_SLICE_12_VISUAL_COHESION_2026-10-12"
PORT="${HA_PORT:-}"

if [ -z "$PORT" ]; then
  PORT=$(python3 - <<'PY'
import socket
s=socket.socket(); s.bind(('127.0.0.1',0)); print(s.getsockname()[1]); s.close()
PY
)
fi

if [ ! -f "$GAME_DIR/build-id.txt" ] || [ "$(cat "$GAME_DIR/build-id.txt")" != "$EXPECTED" ]; then
  echo "HOTLINE ABAKAN: build-id mismatch"
  echo "Expected: $EXPECTED"
  echo "Found: $(cat "$GAME_DIR/build-id.txt" 2>/dev/null || echo missing)"
  read -r -p "Press Enter to close..." _
  exit 1
fi

LOG="/tmp/hotline-abakan-slice12.log"
python3 "$GAME_DIR/serve.py" --port "$PORT" --dir "$GAME_DIR" >"$LOG" 2>&1 &
SERVER_PID=$!
cleanup(){ kill "$SERVER_PID" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

URL="http://127.0.0.1:${PORT}/?build=vertical_slice_12"
for i in $(seq 1 50); do
  if curl -fsS "http://127.0.0.1:${PORT}/build-id.txt" 2>/dev/null | grep -q "$EXPECTED"; then break; fi
  sleep 0.08
done

if ! curl -fsS "http://127.0.0.1:${PORT}/build-id.txt" 2>/dev/null | grep -q "$EXPECTED"; then
  echo "HOTLINE ABAKAN: local server did not start"
  cat "$LOG" 2>/dev/null || true
  read -r -p "Press Enter to close..." _
  exit 1
fi

echo "HOTLINE ABAKAN — VERTICAL SLICE 12"
echo "$URL"
open "$URL"
wait "$SERVER_PID"
