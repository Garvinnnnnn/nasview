#!/usr/bin/env bash
# =============================================================
# NodePulse 服务端 · 本地一键部署到服务器
#
#   bash server/deploy.sh root@192.168.1.10
#   NP_TOKEN=my-secret bash server/deploy.sh root@nas.local --name "客厅 NAS" --type NAS
#
# 自动选择部署方式：服务器有 Node.js 18+ 就裸机跑（指标最准），
# 否则用 Docker Compose；也可用 --mode bare|docker 强制。
# =============================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"

usage() {
  cat <<'USAGE'
用法：bash server/deploy.sh <user@host> [选项]

  --token  XXX      连接 TOKEN（不填自动生成）
  --port   N        端口，默认 8787
  --url    URL      对外地址，默认 http://<host>:<port>
  --name   NAME     节点名称，默认取主机名
  --type   TYPE     节点类型：NAS / 服务器 / 迷你主机 / Linux 设备
  --location TEXT   位置描述
  --mode   MODE     auto（默认）| bare（裸机 Node）| docker（容器）
  --dir    PATH     服务器安装目录，默认 /opt/nodepulse
  --ssh-port N      SSH 端口，默认 22
  --systemd         额外安装 systemd 开机自启服务（需要 sudo）
  -h, --help        显示帮助

也可以用同名环境变量：NP_TOKEN / NP_PORT / NP_MODE / NP_NODE_NAME 等。
USAGE
}

TARGET=""
TOKEN="${NP_TOKEN:-}"
PORT="${NP_PORT:-8787}"
PUBLIC_URL="${NP_PUBLIC_URL:-}"
NAME="${NP_NODE_NAME:-}"
TYPE="${NP_NODE_TYPE:-}"
LOCATION="${NP_LOCATION:-}"
MODE="${NP_MODE:-auto}"
REMOTE_DIR="${NP_REMOTE_DIR:-}"
SSH_PORT="${NP_SSH_PORT:-22}"
WITH_SYSTEMD=0

while [ $# -gt 0 ]; do
  case "$1" in
    --token)    TOKEN="$2"; shift 2 ;;
    --port)     PORT="$2"; shift 2 ;;
    --url)      PUBLIC_URL="$2"; shift 2 ;;
    --name)     NAME="$2"; shift 2 ;;
    --type)     TYPE="$2"; shift 2 ;;
    --location) LOCATION="$2"; shift 2 ;;
    --mode)     MODE="$2"; shift 2 ;;
    --dir)      REMOTE_DIR="$2"; shift 2 ;;
    --ssh-port) SSH_PORT="$2"; shift 2 ;;
    --systemd)  WITH_SYSTEMD=1; shift ;;
    -h|--help)  usage; exit 0 ;;
    -*)         echo "未知参数: $1" >&2; usage; exit 1 ;;
    *)          TARGET="$1"; shift ;;
  esac
done

if [ -z "$TARGET" ]; then echo "缺少服务器地址，例如 root@192.168.1.10" >&2; usage; exit 1; fi
if [ ! -f "$HERE/index.js" ]; then echo "找不到 $HERE/index.js" >&2; exit 1; fi

if [ -z "$TOKEN" ]; then
  TOKEN="$(openssl rand -hex 16 2>/dev/null || node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))")"
fi
HOST_ONLY="${TARGET##*@}"; HOST_ONLY="${HOST_ONLY%%:*}"
[ -z "$PUBLIC_URL" ] && PUBLIC_URL="http://${HOST_ONLY}:${PORT}"

SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -p "$SSH_PORT")
SCP=(scp -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -P "$SSH_PORT")

echo "==> 连接 $TARGET ，探测环境…"
INFO="$("${SSH[@]}" "$TARGET" 'printf "node=%s\nnodev=%s\ndocker=%s\ncompose=%s\nsystemd=%s\ncron=%s\nuid=%s\n" "$(command -v node || true)" "$(node -v 2>/dev/null || true)" "$(command -v docker || true)" "$(docker compose version >/dev/null 2>&1 && echo yes || echo no)" "$(command -v systemctl || true)" "$(command -v crontab || true)" "$(id -u)"')"
get() { printf '%s\n' "$INFO" | sed -n "s/^$1=//p"; }
NODE_BIN="$(get node)"; NODE_VER="$(get nodev)"; DOCKER_BIN="$(get docker)"
NODE_MAJOR="$(printf '%s' "$NODE_VER" | sed -nE 's/^v([0-9]+).*/\1/p')"

if [ "$MODE" = auto ]; then
  if [ -n "$NODE_BIN" ] && [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -ge 18 ] 2>/dev/null; then
    MODE=bare
  elif [ -n "$DOCKER_BIN" ]; then
    MODE=docker
  else
    echo "服务器上既没有 Node.js 18+ 也没有 Docker，请先安装其一。" >&2
    echo "  Ubuntu/Debian : curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs" >&2
    exit 1
  fi
fi
[ "$MODE" = bare ] && { [ -n "$NODE_BIN" ] || { echo "裸机模式需要服务器上有 Node.js 18+" >&2; exit 1; }; }
[ "$MODE" = docker ] && { [ -n "$DOCKER_BIN" ] || { echo "容器模式需要服务器上有 Docker" >&2; exit 1; }; }
echo "    部署方式: $MODE"

echo "==> 创建远程目录…"
if [ -n "$REMOTE_DIR" ]; then
  DIR="$("${SSH[@]}" "$TARGET" "mkdir -p '$REMOTE_DIR' && printf '%s\n' '$REMOTE_DIR'")"
else
  DIR="$("${SSH[@]}" "$TARGET" 'for d in /opt/nodepulse "$HOME/nodepulse"; do if mkdir -p "$d" 2>/dev/null && [ -w "$d" ]; then printf "%s\n" "$d"; break; fi; done')"
fi
[ -n "$DIR" ] || { echo "无法创建远程目录" >&2; exit 1; }
echo "    目录: $DIR"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 用 Node 生成可被 /bin/sh source 的 .env（安全转义空格、中文、引号）
NP_TOKEN="$TOKEN" NP_PORT="$PORT" NP_PUBLIC_URL="$PUBLIC_URL" \
NP_NODE_NAME="$NAME" NP_NODE_TYPE="$TYPE" NP_LOCATION="$LOCATION" \
NP_SHOW_TOKEN=0 NP_DATA_DIR="$DIR/data" node <<'NODE' > "$TMP/.env"
const keys = ['NP_TOKEN','NP_PORT','NP_PUBLIC_URL','NP_NODE_NAME','NP_NODE_TYPE','NP_LOCATION','NP_SHOW_TOKEN','NP_DATA_DIR'];
const q = v => '"' + String(v || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`') + '"';
console.log(keys.map(k => k + '=' + q(process.env[k])).join('\n'));
NODE

cat > "$TMP/start.sh" <<'SH'
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
chmod 755 "$TMP/start.sh"

if [ "$WITH_SYSTEMD" = 1 ]; then
  cat > "$TMP/nodepulse.service" <<UNIT
[Unit]
Description=NodePulse 节点状态服务端
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$DIR
EnvironmentFile=$DIR/.env
ExecStart=$NODE_BIN $DIR/index.js
Restart=always
RestartSec=3
StandardOutput=append:$DIR/nodepulse.log
StandardError=append:$DIR/nodepulse.log

[Install]
WantedBy=multi-user.target
UNIT
fi

echo "==> 上传文件…"
FILES=("$TMP/.env" "$HERE/index.js" "$TMP/start.sh")
[ "$MODE" = docker ] && FILES+=("$HERE/Dockerfile" "$HERE/docker-compose.yml")
[ "$WITH_SYSTEMD" = 1 ] && FILES+=("$TMP/nodepulse.service")
"${SCP[@]}" "${FILES[@]}" "$TARGET:$DIR/" >/dev/null

echo "==> 启动服务…"
if [ "$MODE" = bare ]; then
  "${SSH[@]}" "$TARGET" "sh '$DIR/start.sh'"
  # 开机自启（best-effort，NAS/无 cron 环境忽略）
  "${SSH[@]}" "$TARGET" "( crontab -l 2>/dev/null | grep -v 'nodepulse/start.sh' ; echo '@reboot cd $DIR && sh ./start.sh >/dev/null 2>&1' ) | crontab - 2>/dev/null || true" >/dev/null 2>&1 || true
  if [ "$WITH_SYSTEMD" = 1 ]; then
    "${SSH[@]}" "$TARGET" "sudo cp '$DIR/nodepulse.service' /etc/systemd/system/nodepulse.service && sudo systemctl daemon-reload && sudo systemctl enable --now nodepulse" \
      || echo "    [warn] systemd 安装失败（多为 sudo 权限），已保留 nohup 启动方式"
  fi
else
  "${SSH[@]}" "$TARGET" "cd '$DIR' && ( docker compose up -d --build || docker-compose up -d --build )"
fi

echo "==> 健康检查…"
OK=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -m 2 "$PUBLIC_URL/healthz" >/dev/null 2>&1; then OK=1; break; fi
  sleep 1
done
if [ "$OK" != 1 ]; then
  echo "    本地访问不到 $PUBLIC_URL/healthz，改在服务器内检查："
  "${SSH[@]}" "$TARGET" "curl -fsS -m 2 http://127.0.0.1:$PORT/healthz || tail -n 25 '$DIR/nodepulse.log'" || true
fi

RECORD="$ROOT/build/export/nodepulse-deploy.txt"
mkdir -p "$(dirname "$RECORD")"
{
  echo "部署时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "服务器  : $TARGET ($MODE, $DIR)"
  echo "地址    : $PUBLIC_URL"
  echo "TOKEN   : $TOKEN"
  echo "连接串  : $PUBLIC_URL/?token=$TOKEN"
} > "$RECORD"

cat <<EOF

============================================================
  部署完成 ✅  ($MODE)
  服务端地址 : $PUBLIC_URL
  TOKEN      : $TOKEN
  连接串     : $PUBLIC_URL/?token=$TOKEN

  App 里: 设置 → 服务端地址填上面的地址、TOKEN 填上面的值
          → 数据来源切到「真实 NAS」（或引导页粘贴连接串）

  健康检查 : curl $PUBLIC_URL/healthz
  查看日志 : ssh $TARGET 'tail -f $DIR/nodepulse.log'
  重启服务 : ssh $TARGET 'sh $DIR/start.sh'
  记录文件 : $RECORD
============================================================
EOF
