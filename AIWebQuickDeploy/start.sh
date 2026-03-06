#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
PNPM_CMD=""

log() {
  printf '[AIWebQuickDeploy] %s\n' "$*"
}

warn() {
  printf '[AIWebQuickDeploy][WARN] %s\n' "$*" >&2
}

die() {
  printf '[AIWebQuickDeploy][ERROR] %s\n' "$*" >&2
  exit 1
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

ensure_pnpm() {
  if has_cmd pnpm; then
    PNPM_CMD="pnpm"
    return
  fi
  if has_cmd corepack; then
    log "未检测到 pnpm，尝试通过 corepack 安装"
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@latest --activate >/dev/null 2>&1 || die "corepack 安装 pnpm 失败"
    if corepack pnpm --version >/dev/null 2>&1; then
      PNPM_CMD="corepack pnpm"
      return
    fi
    die "corepack 已执行，但 pnpm 仍不可用"
  fi
  has_cmd npm || die "缺少 npm，无法安装 pnpm"
  npm install -g pnpm >/dev/null 2>&1 || die "pnpm 安装失败"
  has_cmd pnpm || die "pnpm 安装后仍不可用"
  PNPM_CMD="pnpm"
}

run_pnpm() {
  [ -n "$PNPM_CMD" ] || die "PNPM_CMD 未初始化"
  if [ "$PNPM_CMD" = "pnpm" ]; then
    pnpm "$@"
    return
  fi
  corepack pnpm "$@"
}

ensure_pm2() {
  if has_cmd pm2; then
    return
  fi
  has_cmd npm || die "缺少 npm，无法安装 pm2"
  npm install -g pm2 >/dev/null 2>&1 || die "pm2 安装失败"
}

ensure_pnpm
ensure_pm2

if [ "${EUID:-$(id -u)}" -eq 0 ]; then
  warn "当前以 root 运行，将写入 root 的 PM2_HOME。生产环境建议统一使用同一业务用户执行，例如：sudo -u www -H bash -lc 'cd $ROOT_DIR && ./start.sh'"
fi

[ -f "$ROOT_DIR/.env" ] || die "缺少 .env，请先补齐部署配置"
[ -f "$ROOT_DIR/package.json" ] || die "缺少 package.json，请确认当前目录是 AIWebQuickDeploy"
[ -f "$ROOT_DIR/dist/main.js" ] || die "缺少 dist/main.js，请先运行项目根目录 ./build.sh 生成部署包"

log "安装 service 运行时依赖"
run_pnpm install --prod --frozen-lockfile

mkdir -p "$ROOT_DIR/logs" "$ROOT_DIR/public/file"

if pm2 describe YutoLens >/dev/null 2>&1; then
  pm2 delete YutoLens >/dev/null 2>&1 || true
fi

log "启动 YutoLens"
pm2 start "$ROOT_DIR/pm2.conf.json" --update-env
pm2 save >/dev/null 2>&1 || true

log "完成，默认访问端口见 .env 中的 PORT 配置"
