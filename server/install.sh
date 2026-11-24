#!/bin/sh
# =============================================================
# NodePulse 服务端 · 在服务器上直接执行的一键安装
#
#   curl -fsSL https://raw.githubusercontent.com/Garvinnnnnn/nasview/master/server/install.sh | NP_TOKEN=my-secret bash
#
# 会下载 index.js 到 /opt/nodepulse，写好 .env，后台启动并加 @reboot 自启。
# 可用环境变量：NP_TOKEN / NP_PORT / NP_NODE_NAME / NP_NODE_TYPE /
#              NP_LOCATION / NP_PUBLIC_URL / NP_DIR / NP_BASE_URL / NP_MODE
# =============================================================
set -e

BASE_URL="${NP_BASE_URL:-https://raw.githubusercontent.com/Garvinnnnnn/nasview/master/server}"
DIR="${NP_DIR:-/opt/nodepulse}"
TOKEN="${NP_TOKEN:-}"
PORT="${NP_PORT:-8787}"
NAME="${NP_NODE_NAME:-}"
TYPE="${NP_NODE_TYPE:-}"
LOCATION="${NP_LOCATION:-}"
PUBLIC_URL="${NP_PUBLIC_URL:-}"
MODE="${NP_MODE:-auto}"

if [ -z "$TOKEN" ]; then
  TOKEN="$(node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))" 2>/dev/null || openssl rand -hex 16)"
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$IP" ] && IP="$(ip -4 route get 1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')"
[ -z "$IP" ] && IP="<服务器IP>"
[ -z "$PUBLIC_URL" ] && PUBLIC_URL="http://${IP}:${PORT}"

NODE_BIN="$(command -v node || true)"
DOCKER_BIN="$(command -v docker || true)"
if [ "$MODE" = auto ]; then
  if [ -n "$NODE_BIN" ]; then MODE=bare; else MODE=docker; fi
fi
if [ "$MODE" = bare ] && [ -z "$NODE_BIN" ]; then echo "需要 Node.js 18+，或改用 NP_MODE=docker" >&2; exit 1; fi
if [ "$MODE" = docker ] && [ -z "$DOCKER_BIN" ]; then echo "需要 Docker，或先安装 Node.js 18+" >&2; exit 1; fi

if command -v curl >/dev/null 2>&1; then DL="curl -fsSL -o"; else DL="wget -qO"; fi
mkdir -p "$DIR" 2>/dev/null
if [ ! -w "$DIR" ]; then DIR="$HOME/nodepulse"; mkdir -p "$DIR"; fi
mkdir -p "$DIR/data"
cd "$DIR"

echo "==> 下载服务端文件 ($MODE)…"
$DL "$DIR/index.js" "$BASE_URL/index.js"
if [ "$MODE" = docker ]; then
  $DL "$DIR/Dockerfile" "$BASE_URL/Dockerfile"
  $DL "$DIR/docker-compose.yml" "$BASE_URL/docker-compose.yml"
fi

esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\$/\\$/g; s/`/\\`/g'; }
{
  printf 'NP_TOKEN="%s"\n'        "$(esc "$TOKEN")"
  printf 'NP_PORT="%s"\n'         "$(esc "$PORT")"
  printf 'NP_PUBLIC_URL="%s"\n'   "$(esc "$PUBLIC_URL")"
  printf 'NP_NODE_NAME="%s"\n'    "$(esc "$NAME")"
  printf 'NP_NODE_TYPE="%s"\n'    "$(esc "$TYPE")"
  printf 'NP_LOCATION="%s"\n'     "$(esc "$LOCATION")"
  printf 'NP_SHOW_TOKEN="0"\n'
  printf 'NP_DATA_DIR="%s"\n'     "$(esc "$DIR/data")"
} > .env

cat > start.sh <<'SH'
#!/bin/sh
cd "$(dirname "$0")" || exit 1
if [ -f nodepulse.pid ]; then
  OLD="$(cat nodepulse.pid 2>/dev/null)"
  if [ -n "$OLD" ] && kill -0 "$OLD" 2>/dev/null; then
    if [ ! -e "/proc/$OLD" ] || grep -qa 'index.js' "/proc/$OLD/cmdline" 2>/dev/null; then
      kill "$OLD" 2>/dev/null || true
      sleep 1
      kill -9 "$OLD" 2>/dev/null || true
    fi
  fi
fi
set -a
. ./.env
set +a
nohup node index.js >> nodepulse.log 2>&1 < /dev/null &
echo $! > nodepulse.pid
sleep 1
tail -n 12 nodepulse.log
SH
chmod 755 start.sh

echo "==> 启动服务…"
if [ "$MODE" = bare ]; then
  sh ./start.sh
  ( crontab -l 2>/dev/null | grep -v 'nodepulse/start.sh' ; echo "@reboot cd $DIR && sh ./start.sh >/dev/null 2>&1" ) | crontab - 2>/dev/null || true
else
  docker compose up -d --build || docker-compose up -d --build
fi

sleep 2
echo ""
echo "============================================================"
echo "  NodePulse 服务端已部署 ($MODE)"
echo "  地址    : $PUBLIC_URL"
echo "  TOKEN   : $TOKEN"
echo "  连接串  : $PUBLIC_URL/?token=$TOKEN"
echo "  健康检查: curl $PUBLIC_URL/healthz"
echo "  日志    : tail -f $DIR/nodepulse.log"
echo "  TOKEN 文件: $DIR/data/token.txt"
echo "============================================================"
curl -fsS -m 3 "http://127.0.0.1:$PORT/healthz" || true
echo ""
