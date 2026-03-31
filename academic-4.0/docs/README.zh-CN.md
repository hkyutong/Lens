# Academic 4.0 文档说明

`academic-4.0` 在 Lens 中只承担学术能力 API 服务职责。

`docs/` 目录不再维护多语言界面说明文档，当前只保留中文索引与少量历史兼容说明。

建议优先阅读：

- [`../README.md`](../README.md)
- [`../changelogs.md`](../changelogs.md)

当前服务默认监听：

- `http://127.0.0.1:38000`

当前主要接口：

- `POST /academic/core-function-list`
- `POST /academic/plugin-list`
- `POST /academic/chat-process`
- `POST /academic/upload`
- `GET /academic/file`
- `WS /main`
