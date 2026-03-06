# AIWebQuickDeploy

这是 `build.sh` 自动生成的轻量部署包目录。

## 目录说明

- `dist/`：`service` 编译产物
- `public/admin/`：后台前端产物
- `public/chat/`：聊天前端产物
- `package.json` / `pnpm-lock.yaml`：`service` 运行时依赖声明
- `pm2.conf.json`：PM2 启动配置

## 生成方式

在项目根目录执行：

```bash
./build.sh
```

如果只想生成部署包，不在当前机器启动服务：

```bash
QUICK_DEPLOY_ONLY=1 ./build.sh
```

## 轻量部署方式

把整个 `AIWebQuickDeploy/` 目录上传到服务器后，在该目录执行：

```bash
chmod +x start.sh
./start.sh
```

首次部署前请先检查 `.env` 配置是否正确。
