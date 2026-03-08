# AIWebQuickDeploy

这是 `build.sh` 自动生成的轻量部署包目录，面向“前台 + 后台 + service”一体部署。

## 目录说明

- `dist/`：`service` 编译产物
- `public/admin/`：后台前端产物
- `public/chat/`：聊天前端产物
- `package.json` / `pnpm-lock.yaml`：`service` 运行时依赖声明
- `pm2.conf.json`：PM2 启动配置
- `.env.example`：环境变量模板

## 生成方式

在项目根目录执行：

```bash
./build.sh
```

如果只想生成部署包，不在当前机器启动服务：

```bash
QUICK_DEPLOY_ONLY=1 ./build.sh
```

## 推荐部署方式：宝塔 Node 项目

如果你使用宝塔面板，推荐直接用“添加 Node 项目”部署。

### 宝塔面板填写建议

- 项目目录：`AIWebQuickDeploy`
- 启动文件：`dist/main.js`
- 运行目录：`AIWebQuickDeploy`
- 包管理器：`pnpm`
- 端口：读取 `.env` 中的 `PORT`，默认 `9520`
- 环境变量：将 `.env` 放在 `AIWebQuickDeploy/` 根目录

### 首次部署前

```bash
cd AIWebQuickDeploy
cp .env.example .env
# 自行填写数据库、Redis、JWT、ADMIN_SERVE_ROOT、ACADEMIC_API_URL 等配置
pnpm install --prod --frozen-lockfile
```

然后在宝塔面板里启动 Node 项目即可。
