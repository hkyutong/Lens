# Lens Academic 4.0

`academic-4.0` 在 Lens 中负责学术能力 API 服务。

它只对 `chat / admin / service` 提供接口，不承担独立产品界面职责。

## 当前职责

- 提供论文速读、PDF 理解、Arxiv 摘要、LaTeX 翻译与润色、代码解释等能力
- 提供文件上传、文件代理、流式推理与 WebSocket 通道
- 作为 Lens 学术链路中的能力执行层

## 启动方式

```bash
python main.py
```

等价于：

```bash
python shared_utils/fastapi_stream_server.py
```

默认监听：

- `0.0.0.0:38000`

可用环境变量：

- `ACADEMIC_HOST`
- `ACADEMIC_PORT`
- `WEB_HOST`
- `WEB_PORT`

`ACADEMIC_*` 的优先级高于 `WEB_*`。

## 对外接口

- `POST /academic/core-function-list`
- `POST /academic/plugin-list`
- `POST /academic/chat-process`
- `POST /academic/upload`
- `GET /academic/file`
- `WS /main`

## 在 Lens 中的调用链路

1. `chat` 调用 `service` 的 `/api/academic/*`
2. `service/src/modules/academic/academic.service.ts` 负责模型、额度、文件与代理转发
3. `academic-4.0` 执行学术能力并返回流式结果

默认 `ACADEMIC_API_URL`：

- `http://127.0.0.1:38000`

## 目录说明

- `main.py`
  API-only 启动入口
- `shared_utils/fastapi_stream_server.py`
  学术服务主服务器
- `core_functional.py`
  基础功能定义
- `crazy_functional.py`
  学术插件定义
- `crazy_functions/`
  插件实现
- `request_llms/`
  模型桥接层
- `shared_utils/path_safety.py`
  上传目录与日志目录安全校验
- `shared_utils/report_style.py`
  导出 HTML 报告样式

## 目录现状

当前目录已去掉独立交互壳，只保留 API 服务运行所需代码。

如需了解变更原因、接口职责与工作原理，请看：

- [changelogs.md](./changelogs.md)
