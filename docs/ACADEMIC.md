# Academic-4.0 集成说明

## 架构概览
- NestJS 网关：统一登录/计费/日志与 NDJSON 流转发。
- Python 微服务：基于 `academic-4.0`，提供 `/academic/*` 能力与文件解析。

## 关键约定
- 流式返回：NDJSON（每行一个 JSON 对象，换行分隔）。
- 文件处理：由 NestJS 下载/中转到 Python，再在 Python 临时目录内处理。
- 计费策略：按模型计费，沿用现有 NestJS 扣费逻辑。

## 启动 Python 学术服务
进入 `academic-4.0` 目录后启动：

```bash
cd academic-4.0
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 shared_utils/fastapi_stream_server.py
```

默认监听 `0.0.0.0:38000`。

## NestJS 配置
在 NestJS 服务环境变量中设置：

- `ACADEMIC_API_URL`：学术服务地址（默认 `http://127.0.0.1:38000`）

## 文件流转说明
1. 前端上传文件后，NestJS 获取文件 URL。
2. NestJS 下载文件到临时目录，并转发到 `POST /academic/upload`。
3. Python 返回 `upload_dir` 后，NestJS 将该路径传给 `/academic/chat-process` 作为 `plugin_kwargs.main_input`。

## 常见问题
- 依赖缺失：学术插件缺依赖时会在返回内容中提示，请按提示补齐环境依赖。
- 文件解析失败：确认 OSS/S3 可访问，且 NestJS 机器可以下载文件。
- 流式丢包：检查 Python 服务日志是否异常，确保返回为 NDJSON（每行以 `\n` 结尾）。
