# Lens 昱镜部署指南（生产标准）

本文档用于在 Linux/macOS 服务器上部署 Lens 昱镜完整系统。

## 1. 架构与端口

- `service`（NestJS 后端）：默认 `9520`
- `chat`（用户前端）：默认 `9002`
- `admin`（管理后台）：默认 `9000`
- `academic-4.0`（学术引擎）：默认 `38000`
- 依赖：MySQL、Redis

建议通过 Nginx 统一反向代理成同域名路径。

## 2. 环境准备

### 2.1 必备软件

- Node.js 20+
- npm 10+（或 pnpm）
- Python 3.10/3.11
- MySQL 8+
- Redis 6+
- PM2（进程管理）

安装 PM2：

```bash
npm install -g pm2
```

### 2.2 获取代码

```bash
git clone git@github.com:hkyutong/Lens.git
cd Lens
```

## 3. 后端 service 部署

```bash
cd service
npm install
cp .env.example .env
```

编辑 `service/.env`，至少配置：

- `DB_HOST/DB_PORT/DB_USER/DB_PASS/DB_DATABASE`
- `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD`
- `PORT`（默认 9520）
- `JWT_SECRET`（生产请使用高强度随机值）

构建并启动：

```bash
npm run build:test
pm2 start npm --name lens-service -- run start:prod
```

## 4. 学术引擎 academic-4.0 部署

```bash
cd ../academic-4.0
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

启动（FastAPI Stream Server）：

```bash
pm2 start ./venv/bin/python --name lens-academic -- ./shared_utils/fastapi_stream_server.py
```

确保 `service` 能访问学术引擎地址（默认 `http://127.0.0.1:38000`）。

## 5. 前端 chat 与 admin 部署

### 5.1 chat

```bash
cd ../chat
npm install
pm2 start npm --name lens-chat -- run dev
```

默认访问：`http://127.0.0.1:9002`

### 5.2 admin

```bash
cd ../admin
npm install
pm2 start npm --name lens-admin -- run dev
```

默认访问：`http://127.0.0.1:9000`

## 6. 生产建议（强烈建议）

- 使用 Nginx 做 HTTPS 与反向代理
- 使用独立数据库账号，最小权限原则
- 关闭测试/调试日志与开发跨域放行
- `.env` 不入库，定期轮换密钥
- 开启数据库与日志备份

## 7. 健康检查

检查进程：

```bash
pm2 ls
```

检查端口：

```bash
lsof -nP -iTCP:9520 -sTCP:LISTEN
lsof -nP -iTCP:38000 -sTCP:LISTEN
lsof -nP -iTCP:9000 -sTCP:LISTEN
lsof -nP -iTCP:9002 -sTCP:LISTEN
```

## 8. 回归与发布验收

在 `service/` 下执行生产闸门测试：

```bash
node ./scripts/prod_gate_suite.mjs
```

发布标准：`canRelease=true` 且 `failChecks=0` 且 `blockers=0`。

## 9. 默认管理账号（首次部署后请立刻修改）

- 超级管理员：`super`
- 默认密码：`123456`

