# Lens 昱镜部署指南（生产标准）

本文档用于在 Linux 服务器上部署 Lens 昱镜完整系统。

## 1. 架构与端口

- `service`（NestJS 后端，同时托管前台与后台静态资源）：默认 `9520`
- `academic-4.0`（学术引擎）：默认 `38000`
- 依赖：MySQL、Redis

建议通过 Nginx 统一反向代理成同域名路径。

## 2. 一键部署

完成 `service/.env` 配置后，可直接在项目根目录执行：

```bash
chmod +x build.sh
./build.sh
```

脚本会自动完成以下动作：

- 检查 `node/npm/pnpm/pm2/python3`
- 安装 `admin/chat/service` 依赖
- 构建 `admin/chat/service`
- 将前台与后台产物同步到 `service/public`
- 生成 `AIWebQuickDeploy/` 轻量部署包（含 `service dist + admin/chat dist`）
- 创建 `academic-4.0/venv` 并安装 Python 依赖
- 使用 PM2 启动 `lens-service` 与 `lens-academic`
- 检查 `9520` 与 `38000` 端口是否成功拉起

可选参数：

- `START_DOCKER_DEPS=1 ./build.sh`
  说明：如果你希望同时用 `service/docker-compose.yml` 拉起本地 `mysql` 和 `redis`，可以加这个环境变量。
- `INSTALL_ACADEMIC=0 ./build.sh`
  说明：跳过 `academic-4.0` 的 Python 依赖安装。
- `ACADEMIC_PYTHON_BIN=python3.12 ./build.sh`
  说明：显式指定学术服务虚拟环境使用的 Python 解释器。脚本默认优先选择 `python3.12`，并强制要求版本为 `3.12.12`。
- `ACADEMIC_PYTHON_VERSION=3.12.12 ./build.sh`
  说明：显式指定学术服务要求的 Python 精确版本，默认即 `3.12.12`。
- `ENABLE_PM2_STARTUP=0 ./build.sh`
  说明：跳过 PM2 开机自启配置。
- `QUICK_DEPLOY_ONLY=1 ./build.sh`
  说明：只构建并生成 `AIWebQuickDeploy/` 部署包，不在当前机器启动服务。

## 3. 环境准备

### 3.1 必备软件

- Node.js 20+
- npm 10+（或 pnpm）
- Python 3.12.12
- MySQL 8+
- Redis 6+
- PM2（进程管理）

安装 PM2：

```bash
npm install -g pm2
```

### 3.2 获取代码

```bash
git clone git@github.com:hkyutong/Lens.git
cd Lens
```

### 3.3 轻量部署包（AIWebQuickDeploy）

如果你希望先在构建机打包，再把产物上传到目标服务器，可执行：

```bash
QUICK_DEPLOY_ONLY=1 ./build.sh
```

生成后的 `AIWebQuickDeploy/` 包含：

- `dist/`：`service` 编译产物
- `public/admin/`：后台产物
- `public/chat/`：前台产物
- `package.json` / `pnpm-lock.yaml`
- `pm2.conf.json`

目标服务器只需把整个 `AIWebQuickDeploy/` 目录上传过去。

如果你使用宝塔面板，推荐直接通过“添加 Node 项目”完成部署：

```bash
项目目录：AIWebQuickDeploy
启动文件：dist/main.js
运行目录：AIWebQuickDeploy
包管理器：pnpm
环境变量文件：AIWebQuickDeploy/.env
端口：使用 .env 中的 PORT（默认 9520）
```

说明：

- 部署时请自行选择一个固定的业务用户执行，并始终保持一致
- 不要混用不同系统用户分别管理 `YutoLens` / `lens-academic`，否则 PM2 会分裂为多套进程列表
- 本文档不预设你必须使用 `root`、`www` 或其他特定用户，按你的服务器规范执行即可
- 如果你不是用宝塔，也可以在 `AIWebQuickDeploy/` 目录手工执行 `pnpm install --prod --frozen-lockfile` 后再用你自己的 PM2/守护方案启动 `dist/main.js`

## 4. 配置 service/.env

```bash
cd service
cp .env.example .env
```

编辑 `service/.env`，至少配置：

- `DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_DATABASE`
- `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD`
- `PORT`（默认 9520）
- `JWT_SECRET`（生产请使用高强度随机值）

确保 `service` 能访问学术引擎地址（默认 `http://127.0.0.1:38000`）。

说明：

- 学术服务虚拟环境固定使用 Python `3.12.12`，默认优先取 `python3.12`
- 如果服务器上存在多个 Python，可用 `ACADEMIC_PYTHON_BIN=python3.12 ./build.sh` 显式指定
- `build.sh` 会通过 PM2 守护 `lens-academic`，服务异常退出后 PM2 会自动拉起
- 是否启用 PM2 开机自启由你的部署策略决定；建议在确认进程归属与运行用户一致后，再统一执行 `pm2 startup` 与 `pm2 save`

## 5. 生产建议（强烈建议）

- 使用 Nginx 做 HTTPS 与反向代理
- 使用独立数据库账号，最小权限原则
- 关闭测试/调试日志与开发跨域放行
- `.env` 不入库，定期轮换密钥
- 开启数据库与日志备份

## 6. 健康检查

检查进程：

```bash
pm2 ls
```

检查端口：

```bash
ss -lntp | grep -E '9520|38000'
```

访问入口：

- 前台：`http://127.0.0.1:9520/`
- 后台：`http://127.0.0.1:9520/<你的 ADMIN_SERVE_ROOT>/`

日志排查：

```bash
pm2 logs lens-service --lines 100
pm2 logs lens-academic --lines 100
```

## 7. 回归与发布验收

在 `service/` 下执行生产闸门测试：

```bash
node ./scripts/prod_gate_suite.mjs
```

发布标准：`canRelease=true` 且 `failChecks=0` 且 `blockers=0`。

## 8. 默认管理账号（首次部署后请立刻修改）

- 超级管理员：`super`
- 默认密码：`123456`
