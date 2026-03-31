# Academic 4.0 Changelog

## 2026-03-25

### 变更
- 学术服务改为 API-only 运行模式，`main.py` 不再启动 Gradio 前端界面，而是直接启动 `shared_utils/fastapi_stream_server.py`。
- 将后端仍需复用的能力从前端壳中拆出：
  - 新增 `shared_utils/path_safety.py`，提供上传目录/日志目录的路径安全校验。
  - 新增 `shared_utils/report_style.py`，提供导出 HTML 报告所需的基础样式。
- 学术插件与导出逻辑不再依赖 `themes.theme` 或 `shared_utils.fastapi_server`。
- 已移除旧的 Gradio 页面壳相关文件：`themes/`、`shared_utils/cookie_manager.py`、`shared_utils/fastapi_server.py`。
- 已清理 `README` 与 `docs/` 中残留的旧交互壳说明，统一改为当前 API-only 架构说明。
- 已删除 `docs/` 中多语言 README，占位文档仅保留中文说明页 `README.zh-CN.md`。

### 当前工作原理
1. `chat` 前端调用 `service` 后端的 `/api/academic/*` 接口。
2. `service/src/modules/academic/academic.service.ts` 负责：
   - 解析当前模型配置与用户余额
   - 处理上传文件并落到学术服务可访问目录
   - 将请求转发到 `ACADEMIC_API_URL`，默认即 `http://127.0.0.1:38000`
3. `academic-4.0/shared_utils/fastapi_stream_server.py` 对外提供：
   - `POST /academic/core-function-list`
   - `POST /academic/plugin-list`
   - `POST /academic/chat-process`
   - `POST /academic/upload`
   - `GET /academic/file`
   - `WS /main`
4. 学术服务内部再调用：
   - `core_functional.py` 读取基础能力
   - `crazy_functional.py` 读取学术插件
   - `request_llms/bridge_all.py` 执行模型请求
   - `crazy_functions/*` 执行 PDF / Word / LaTeX / Arxiv / 代码分析等任务

### 启动方式
- 推荐：
  - `python main.py`
- 等价：
  - `python shared_utils/fastapi_stream_server.py`

### 说明
- 这个目录现在的职责是“学术能力 API 服务”，不是独立可访问的前端站点。
- 如果以后还需要独立前端，应在 `chat/admin/service` 侧实现，不要再把 Gradio 页面壳塞回学术服务目录。
