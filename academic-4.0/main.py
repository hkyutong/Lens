"""
Lens academic service API-only entrypoint.

该入口不再启动 Gradio 前端界面，只负责拉起 38000 学术接口服务，
供 chat / admin / service 通过 HTTP API 与 WebSocket 调用。
"""

from shared_utils.fastapi_stream_server import main


if __name__ == "__main__":
    main()
