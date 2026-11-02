#!/usr/bin/env sh
# YantraFlow — one-command start for Android (Termux), Linux and macOS.
#   sh start.sh            (opens http://localhost:5679)
#   PORT=5680 sh start.sh  (other port)    NO_BROWSER=1 sh start.sh  (don't open browser)
#   KEEP_ALIVE=1 NO_BROWSER=1 sh start.sh  (24x7: auto-restart if it ever stops)
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-5679}"

is_termux() { [ -n "$PREFIX" ] && echo "$PREFIX" | grep -q "com.termux"; }

if ! command -v node >/dev/null 2>&1; then
  if is_termux; then
    echo "📦 Installing Node.js (only the first time)..."
    pkg update -y && (pkg install -y nodejs-lts || pkg install -y nodejs)
  elif command -v brew >/dev/null 2>&1; then
    brew install node
  else
    echo "❌ Node.js 18+ is not installed."
    echo "   Ubuntu/Debian: sudo apt-get install -y nodejs   |   Others: https://nodejs.org"
    exit 1
  fi
fi

MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 18 ]; then
  echo "❌ Node.js $MAJOR is too old. YantraFlow needs Node.js 18 or newer."
  is_termux && echo "   Run: pkg upgrade nodejs-lts"
  exit 1
fi

if is_termux; then
  # keeps Termux awake so schedules keep running with the screen off
  command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
fi

URL="http://localhost:$PORT"
if [ -z "$NO_BROWSER" ]; then
  (
    sleep 2
    if is_termux; then termux-open-url "$URL" >/dev/null 2>&1
    elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1
    elif command -v open >/dev/null 2>&1; then open "$URL" >/dev/null 2>&1
    fi
  ) &
fi

# KEEP_ALIVE=1 sh start.sh  -> if YantraFlow ever stops, start it again (schedules resume from data/schedules.json)
if [ -n "$KEEP_ALIVE" ]; then
  while true; do PORT="$PORT" node src/server.js; echo "YantraFlow stopped — restarting in 5s (Ctrl+C twice to quit)"; sleep 5; done
fi
PORT="$PORT" exec node src/server.js
