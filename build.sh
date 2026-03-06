#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$ROOT_DIR/service"
CHAT_DIR="$ROOT_DIR/chat"
ADMIN_DIR="$ROOT_DIR/admin"
ACADEMIC_DIR="$ROOT_DIR/academic-4.0"
QUICK_DEPLOY_DIR="$ROOT_DIR/AIWebQuickDeploy"

SERVICE_PM2_NAME="${SERVICE_PM2_NAME:-lens-service}"
ACADEMIC_PM2_NAME="${ACADEMIC_PM2_NAME:-lens-academic}"
INSTALL_ACADEMIC="${INSTALL_ACADEMIC:-1}"
START_DOCKER_DEPS="${START_DOCKER_DEPS:-0}"
ENABLE_PM2_STARTUP="${ENABLE_PM2_STARTUP:-1}"
PACKAGE_AIWEBQUICKDEPLOY="${PACKAGE_AIWEBQUICKDEPLOY:-1}"
QUICK_DEPLOY_ONLY="${QUICK_DEPLOY_ONLY:-0}"
ACADEMIC_PYTHON_BIN="${ACADEMIC_PYTHON_BIN:-}"
ACADEMIC_PYTHON_VERSION="${ACADEMIC_PYTHON_VERSION:-3.12.12}"
ACADEMIC_PYTHON=""

log() {
  printf '[Lens Deploy] %s\n' "$*"
}

warn() {
  printf '[Lens Deploy][WARN] %s\n' "$*" >&2
}

die() {
  printf '[Lens Deploy][ERROR] %s\n' "$*" >&2
  exit 1
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

require_cmd() {
  has_cmd "$1" || die "缺少命令：$1"
}

ensure_node_version() {
  require_cmd node
  local node_major
  node_major="$(node -p "process.versions.node.split('.')[0]")"
  if [ "$node_major" -lt 20 ]; then
    die "Node.js 版本过低，当前为 $(node -v)，要求 >= 20"
  fi
}

ensure_pnpm() {
  if has_cmd pnpm; then
    return
  fi
  if has_cmd corepack; then
    log "未检测到 pnpm，尝试通过 corepack 安装"
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@latest --activate >/dev/null 2>&1 || die "corepack 安装 pnpm 失败"
  else
    require_cmd npm
    log "未检测到 pnpm，尝试通过 npm 全局安装"
    npm install -g pnpm >/dev/null 2>&1 || die "pnpm 安装失败"
  fi
}

ensure_pm2() {
  if has_cmd pm2; then
    return
  fi
  require_cmd npm
  log "未检测到 pm2，尝试通过 npm 全局安装"
  npm install -g pm2 >/dev/null 2>&1 || die "pm2 安装失败"
}

detect_academic_python() {
  local candidate version

  if [ -n "$ACADEMIC_PYTHON_BIN" ]; then
    has_cmd "$ACADEMIC_PYTHON_BIN" || die "指定的 ACADEMIC_PYTHON_BIN 不存在：$ACADEMIC_PYTHON_BIN"
    candidate="$ACADEMIC_PYTHON_BIN"
  elif has_cmd python3.12; then
    candidate="python3.12"
  elif has_cmd python3; then
    candidate="python3"
  else
    die "缺少 Python 3.12.12，请安装 python3.12 后重新执行"
  fi

  version="$("$candidate" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
  [ "$version" = "$ACADEMIC_PYTHON_VERSION" ] || die "学术服务要求 Python $ACADEMIC_PYTHON_VERSION，当前检测到 $candidate = $version。请安装/切换到 Python $ACADEMIC_PYTHON_VERSION，或通过 ACADEMIC_PYTHON_BIN 指定正确解释器。"

  ACADEMIC_PYTHON="$candidate"
  log "学术服务 Python 解释器: $ACADEMIC_PYTHON ($version)"
}

ensure_python() {
  detect_academic_python
  "$ACADEMIC_PYTHON" -m venv --help >/dev/null 2>&1 || die "当前解释器不支持 venv：$ACADEMIC_PYTHON"
}

ensure_service_env() {
  local env_file="$SERVICE_DIR/.env"
  local env_example="$SERVICE_DIR/.env.example"
  if [ -f "$env_file" ]; then
    return
  fi
  cp "$env_example" "$env_file"
  die "未找到 service/.env，已自动从模板生成。请先补齐数据库、Redis、JWT 等配置后重新执行 ./build.sh"
}

maybe_start_docker_deps() {
  if [ "$START_DOCKER_DEPS" != "1" ]; then
    return
  fi

  if has_cmd docker && docker compose version >/dev/null 2>&1; then
    log "启动 Docker 依赖：MySQL + Redis"
    (cd "$SERVICE_DIR" && docker compose up -d mysql redis)
    return
  fi

  if has_cmd docker-compose; then
    log "启动 Docker 依赖：MySQL + Redis"
    (cd "$SERVICE_DIR" && docker-compose up -d mysql redis)
    return
  fi

  die "START_DOCKER_DEPS=1，但当前机器未安装 docker compose / docker-compose"
}

pnpm_install() {
  local dir="$1"
  log "安装依赖：$dir"
  if [ -f "$dir/pnpm-lock.yaml" ]; then
    (cd "$dir" && pnpm install --frozen-lockfile)
  else
    (cd "$dir" && pnpm install)
  fi
}

build_admin() {
  log "构建 admin"
  (cd "$ADMIN_DIR" && pnpm exec vue-tsc && pnpm exec vite build)
}

build_chat() {
  log "构建 chat"
  (cd "$CHAT_DIR" && pnpm exec vite build --mode=production)
}

build_service() {
  log "构建 service"
  (cd "$SERVICE_DIR" && pnpm run build:test)
}

sync_frontend_assets() {
  log "同步前端静态资源到 service/public"
  rm -rf "$SERVICE_DIR/public/admin" "$SERVICE_DIR/public/chat"
  mkdir -p "$SERVICE_DIR/public/admin" "$SERVICE_DIR/public/chat" "$SERVICE_DIR/public/file"
  cp -R "$ADMIN_DIR/dist/." "$SERVICE_DIR/public/admin/"
  cp -R "$CHAT_DIR/dist/." "$SERVICE_DIR/public/chat/"
}

package_aiwebquickdeploy() {
  if [ "$PACKAGE_AIWEBQUICKDEPLOY" != "1" ]; then
    warn "已跳过 AIWebQuickDeploy 部署包生成（PACKAGE_AIWEBQUICKDEPLOY=$PACKAGE_AIWEBQUICKDEPLOY）"
    return
  fi

  log "生成 AIWebQuickDeploy 轻量部署包"
  rm -rf "$QUICK_DEPLOY_DIR/dist" "$QUICK_DEPLOY_DIR/public" "$QUICK_DEPLOY_DIR/logs"
  mkdir -p \
    "$QUICK_DEPLOY_DIR/dist" \
    "$QUICK_DEPLOY_DIR/public/admin" \
    "$QUICK_DEPLOY_DIR/public/chat" \
    "$QUICK_DEPLOY_DIR/public/file" \
    "$QUICK_DEPLOY_DIR/logs"

  cp -R "$SERVICE_DIR/dist/." "$QUICK_DEPLOY_DIR/dist/"
  cp -R "$ADMIN_DIR/dist/." "$QUICK_DEPLOY_DIR/public/admin/"
  cp -R "$CHAT_DIR/dist/." "$QUICK_DEPLOY_DIR/public/chat/"
  cp "$SERVICE_DIR/package.json" "$QUICK_DEPLOY_DIR/package.json"
  cp "$SERVICE_DIR/pnpm-lock.yaml" "$QUICK_DEPLOY_DIR/pnpm-lock.yaml"
  cp "$SERVICE_DIR/pm2.conf.json" "$QUICK_DEPLOY_DIR/pm2.conf.json"
  if [ -f "$SERVICE_DIR/.env.example" ]; then
    cp "$SERVICE_DIR/.env.example" "$QUICK_DEPLOY_DIR/.env.example"
  fi
}

install_academic_deps() {
  if [ "$INSTALL_ACADEMIC" != "1" ]; then
    warn "已跳过 academic-4.0 依赖安装（INSTALL_ACADEMIC=$INSTALL_ACADEMIC）"
    return
  fi

  ensure_python

  if [ ! -d "$ACADEMIC_DIR/venv" ]; then
    log "创建 academic-4.0 Python 虚拟环境"
    (cd "$ACADEMIC_DIR" && "$ACADEMIC_PYTHON" -m venv venv)
  fi

  log "安装 academic-4.0 Python 依赖"
  "$ACADEMIC_DIR/venv/bin/python" -m pip install --upgrade pip setuptools wheel >/dev/null
  "$ACADEMIC_DIR/venv/bin/python" -m pip install -r "$ACADEMIC_DIR/requirements.txt"
}

pm2_delete_if_exists() {
  local name="$1"
  if pm2 describe "$name" >/dev/null 2>&1; then
    pm2 delete "$name" >/dev/null 2>&1 || true
  fi
}

start_service() {
  log "启动 service（PM2: $SERVICE_PM2_NAME）"
  pm2_delete_if_exists "$SERVICE_PM2_NAME"
  pm2 start "$SERVICE_DIR/dist/main.js" \
    --name "$SERVICE_PM2_NAME" \
    --cwd "$SERVICE_DIR" \
    --time \
    --update-env
}

start_academic() {
  if [ ! -x "$ACADEMIC_DIR/venv/bin/python" ]; then
    die "academic-4.0 虚拟环境不存在，请先完成依赖安装"
  fi

  log "启动 academic-4.0（PM2: $ACADEMIC_PM2_NAME）"
  pm2_delete_if_exists "$ACADEMIC_PM2_NAME"
  pm2 start "$ACADEMIC_DIR/venv/bin/python" \
    --name "$ACADEMIC_PM2_NAME" \
    --cwd "$ACADEMIC_DIR" \
    --time \
    --update-env \
    -- ./shared_utils/fastapi_stream_server.py
}

configure_pm2_startup() {
  local target_user target_home

  if [ "$ENABLE_PM2_STARTUP" != "1" ]; then
    warn "已跳过 PM2 开机自启配置（ENABLE_PM2_STARTUP=$ENABLE_PM2_STARTUP）"
    return
  fi

  if ! has_cmd systemctl; then
    warn "当前系统没有 systemctl，跳过 PM2 开机自启配置"
    return
  fi

  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    warn "当前用户不是 root，无法自动写入 systemd 开机自启。请部署完成后执行：pm2 startup systemd -u $(whoami) --hp $HOME"
    return
  fi

  target_user="${SUDO_USER:-$(whoami)}"
  target_home="$(eval echo "~$target_user")"
  log "配置 PM2 开机自启"
  pm2 startup systemd -u "$target_user" --hp "$target_home" >/dev/null 2>&1 || warn "PM2 开机自启配置失败，请手动执行 pm2 startup systemd"
}

wait_for_port() {
  local host="$1"
  local port="$2"
  local timeout="$3"
  local start_ts now_ts
  start_ts="$(date +%s)"
  while true; do
    if (echo >"/dev/tcp/$host/$port") >/dev/null 2>&1; then
      return 0
    fi
    now_ts="$(date +%s)"
    if [ $((now_ts - start_ts)) -ge "$timeout" ]; then
      return 1
    fi
    sleep 1
  done
}

health_check() {
  log "等待 service 就绪（9520）"
  wait_for_port 127.0.0.1 9520 90 || die "service 启动超时，请执行 pm2 logs $SERVICE_PM2_NAME 查看原因"

  log "等待 academic-4.0 就绪（38000）"
  wait_for_port 127.0.0.1 38000 90 || die "academic-4.0 启动超时，请执行 pm2 logs $ACADEMIC_PM2_NAME 查看原因"
}

main() {
  [ "$(uname -s)" = "Linux" ] || warn "当前系统不是 Linux，此脚本目标场景是 Linux 服务器"

  ensure_node_version
  require_cmd npm
  ensure_pnpm
  ensure_pm2
  if [ "$QUICK_DEPLOY_ONLY" != "1" ]; then
    ensure_service_env
  fi
  maybe_start_docker_deps

  pnpm_install "$ADMIN_DIR"
  pnpm_install "$CHAT_DIR"
  pnpm_install "$SERVICE_DIR"

  build_admin
  build_chat
  build_service
  sync_frontend_assets
  package_aiwebquickdeploy

  if [ "$QUICK_DEPLOY_ONLY" = "1" ]; then
    log "已完成构建并生成 AIWebQuickDeploy 部署包，跳过服务启动（QUICK_DEPLOY_ONLY=1）"
    log "部署包目录：$QUICK_DEPLOY_DIR"
    return
  fi

  install_academic_deps
  start_service
  start_academic

  configure_pm2_startup
  pm2 save >/dev/null 2>&1 || true
  health_check

  log "部署完成"
  log "前台入口: http://127.0.0.1:9520/"
  log "后台入口: http://127.0.0.1:9520/admin"
  log "学术引擎: http://127.0.0.1:38000"
  log "PM2 进程: $SERVICE_PM2_NAME, $ACADEMIC_PM2_NAME"
}

main "$@"
