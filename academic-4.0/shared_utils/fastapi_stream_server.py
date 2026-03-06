"""
FastAPI WebSocket 流式服务器模块

这个模块实现了一个基于FastAPI的WebSocket服务器，用于处理前端和后端之间的实时双向通信。
主要功能包括：
1. 维护WebSocket连接
2. 处理消息队列
3. 支持实时和阻塞式消息传输
4. 提供事件管理机制

主要组件：
- FutureEvent: 用于事件管理的线程事件类
- UserInterfaceMsg: 定义前后端通信的消息格式
- PythonMethod_AsyncConnectionMaintainer_AgentcraftInterface: 连接维护器
- MasterMindWebSocketServer: WebSocket服务器主类
"""

import uuid
import time
import json
import platform
import pickle
import asyncio
import threading
import traceback
import sys
import tempfile
from fastapi.websockets import WebSocketState
from loguru import logger
from queue import Queue
from fastapi import FastAPI, WebSocket, File, UploadFile, Form
from fastapi.responses import JSONResponse, StreamingResponse
from datetime import datetime
from typing import List, Optional, Any, Union
from pydantic import BaseModel, Field
import shutil
import os
from enum import auto, Enum
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
from toolbox import ChatBotWithCookies, sanitize_chatbot_text
import starlette

ACADEMIC_LOG_PATH = os.path.abspath(
    os.environ.get("ACADEMIC_LOG_FILE") or os.path.join(PROJECT_ROOT, "academic.log")
)


def _iter_academic_log_paths():
    env_path = os.environ.get("ACADEMIC_LOG_FILE")
    pm2_home = os.environ.get("PM2_HOME")
    candidates = []
    if env_path:
        candidates.append(os.path.abspath(env_path))
    else:
        candidates.append(os.path.join(PROJECT_ROOT, "academic.log"))
    if pm2_home:
        candidates.append(os.path.join(pm2_home, "logs", "lens-academic.log"))
    candidates.append(os.path.join(tempfile.gettempdir(), "lens-academic", "academic.log"))
    seen = set()
    for path in candidates:
        normalized = os.path.abspath(path)
        if normalized in seen:
            continue
        seen.add(normalized)
        yield normalized


def _setup_academic_logger():
    global ACADEMIC_LOG_PATH
    logger.remove()
    logger.add(
        sys.stderr,
        level="INFO",
        enqueue=True,
        backtrace=False,
        diagnose=False,
    )
    last_error = None
    for candidate in _iter_academic_log_paths():
        try:
            os.makedirs(os.path.dirname(candidate), exist_ok=True)
            logger.add(
                candidate,
                level="INFO",
                encoding="utf-8",
                enqueue=True,
                backtrace=False,
                diagnose=False,
                rotation="20 MB",
                retention=10,
            )
            ACADEMIC_LOG_PATH = candidate
            return
        except Exception as exc:
            last_error = exc
    ACADEMIC_LOG_PATH = "stderr-only"
    logger.warning(
        f"Academic log file init failed, fallback to stderr only: {last_error}"
    )


_setup_academic_logger()
logger.info(f"Academic log file: {ACADEMIC_LOG_PATH}")



class UserInterfaceMsg(BaseModel):
    """
    用户界面消息模型，定义了前后端通信的数据结构

    这个类使用Pydantic BaseModel定义了所有可能的消息字段，
    包括插件功能、输入内容、LLM参数、聊天记录等。
    """
    function: str = Field(default="chat", description="使用哪个插件")
    main_input: str = Field(default="", description="主要输入内容，通常是用户的问题")
    llm_kwargs: dict = Field(default_factory=dict, description="围绕LLM的各种参数")
    #     llm_kwargs = {
    #         "api_key": cookies["api_key"],
    #         "llm_model": cookies["llm_model"],
    #         "top_p": 1.0,
    #         "max_length": None,
    #         "temperature": 1.0,
    #         "user_name": "default_user",  # Default user name
    #     }
    plugin_kwargs: dict = Field(default_factory=dict, description="围绕该function的各种参数")
    chatbot: list[list[Union[str|None]]] = Field(default=[], description="聊天记录（给人类看的）。格式为 [ [user_msg, bot_msg], [user_msg_2, bot_msg_2],...]，双层列表，第一层是每一轮对话，第二层是用户和机器人的消息。")
    chatbot_cookies: dict = Field(default_factory=dict, description="其他新前端涉及的参数")
    history: list[str] = Field(default=[], description="聊天记录（给模型看的）。单层列表")
    system_prompt: str = Field(default="", description="系统提示词")
    user_request: dict = Field(default="", description="用户相关的参数，如用户名")
    special_kwargs: dict = Field(default_factory=dict, description="其他新前端涉及的参数")
    special_state: dict = Field(default={}, description="特殊状态传递，例如对话结束。")

class AcademicStreamRequest(BaseModel):
    function: str = Field(default="chat", description="chat/basic/plugin")
    main_input: str = Field(default="", description="主要输入内容")
    llm_kwargs: dict = Field(default_factory=dict, description="模型参数")
    plugin_kwargs: dict = Field(default_factory=dict, description="插件参数")
    history: list[str] = Field(default_factory=list, description="对话历史（给模型）")
    system_prompt: str = Field(default="", description="系统提示词")
    chatbot: list[list[Union[str|None]]] = Field(default_factory=list, description="对话历史（给人类）")
    core_function: Optional[str] = Field(default=None, description="基础功能名称")
    plugin_name: Optional[str] = Field(default=None, description="插件名称")
    user_name: Optional[str] = Field(default=None, description="用户标识")
    chat_id: Optional[str] = Field(default=None, description="用于回传的chatId")

TERMINATE_MSG = UserInterfaceMsg(function="TERMINATE", special_state={"stop": True})

def setup_initial_com(initial_msg: UserInterfaceMsg):
    """
    设置插件参数

    从初始消息中提取各种参数并构建插件执行所需的参数字典。

    参数:
        initial_msg: 初始的用户消息
        chatbot_with_cookies: 带有cookie的聊天机器人实例

    返回:
        dict: 包含插件执行所需所有参数的字典
    """
    from toolbox import get_plugin_default_kwargs


    com = get_plugin_default_kwargs()
    com["main_input"] = initial_msg.main_input
    # 设置LLM相关参数
    if initial_msg.llm_kwargs.get('api_key', None):     com["llm_kwargs"]['api_key'] = initial_msg.llm_kwargs.get('api_key')
    if initial_msg.llm_kwargs.get('llm_model', None):   com["llm_kwargs"]['llm_model'] = initial_msg.llm_kwargs.get('llm_model')
    if initial_msg.llm_kwargs.get('top_p', None):       com["llm_kwargs"]['top_p'] = initial_msg.llm_kwargs.get('top_p')
    if initial_msg.llm_kwargs.get('max_length', None):  com["llm_kwargs"]['max_length'] = initial_msg.llm_kwargs.get('max_length')
    if initial_msg.llm_kwargs.get('temperature', None): com["llm_kwargs"]['temperature'] = initial_msg.llm_kwargs.get('temperature')
    if initial_msg.llm_kwargs.get('user_name', None):   com["llm_kwargs"]['user_name'] = initial_msg.llm_kwargs.get('user_name')
    if initial_msg.llm_kwargs.get('embed_model', None): com["llm_kwargs"]['embed_model'] = initial_msg.llm_kwargs.get('embed_model')

    initial_msg.chatbot_cookies.update({
        'api_key':      com["llm_kwargs"]['api_key'],
        'top_p':        com["llm_kwargs"]['top_p'],
        'llm_model':    com["llm_kwargs"]['llm_model'],
        'embed_model':  com["llm_kwargs"]['embed_model'],
        'temperature':  com["llm_kwargs"]['temperature'],
        'user_name':    com["llm_kwargs"]['user_name'],
        'customize_fn_overwrite': {},
    })
    chatbot_with_cookies = ChatBotWithCookies(initial_msg.chatbot_cookies)
    chatbot_with_cookies.write_list(initial_msg.chatbot)
    # 设置其他参数
    com["plugin_kwargs"] = initial_msg.plugin_kwargs
    com["chatbot_with_cookie"] = chatbot_with_cookies
    com["history"] = initial_msg.history
    com["system_prompt"] = initial_msg.system_prompt
    com["user_request"] = initial_msg.user_request

    return com


class DummyRequest(object):
    def __call__(self, username):
        self.username = username


def _extract_chatbot_value(chatbot_obj):
    if isinstance(chatbot_obj, dict):
        return chatbot_obj.get("value")
    if hasattr(chatbot_obj, "value"):
        return chatbot_obj.value
    return chatbot_obj


def _build_stream_context(req: AcademicStreamRequest):
    from toolbox import get_conf, get_plugin_default_kwargs, default_user_name
    com = get_plugin_default_kwargs()
    llm_kwargs = com["llm_kwargs"]
    llm_kwargs.update(req.llm_kwargs or {})
    if not llm_kwargs.get("embed_model"):
        llm_kwargs["embed_model"] = get_conf("EMBEDDING_MODEL")
    user_name = req.user_name or llm_kwargs.get("user_name") or default_user_name
    llm_kwargs["user_name"] = user_name
    cookies = {
        "api_key": llm_kwargs.get("api_key"),
        "top_p": llm_kwargs.get("top_p", 1.0),
        "llm_model": llm_kwargs.get("llm_model"),
        "embed_model": llm_kwargs.get("embed_model"),
        "temperature": llm_kwargs.get("temperature", 1.0),
        "user_name": user_name,
        "customize_fn_overwrite": {},
    }
    chatbot = ChatBotWithCookies(cookies)
    if req.chatbot:
        chatbot.write_list(req.chatbot)
    return {
        "main_input": req.main_input or "",
        "llm_kwargs": llm_kwargs,
        "plugin_kwargs": req.plugin_kwargs or {},
        "chatbot": chatbot,
        "history": req.history or [],
        "system_prompt": req.system_prompt or "",
        "user_name": user_name,
    }


import re


def _validate_payload_paths(main_input, plugin_kwargs, strict_main_input=True):
    from toolbox import get_conf
    upload_root = os.path.abspath(get_conf("PATH_PRIVATE_UPLOAD"))
    upload_root_norm = os.path.abspath(upload_root)
    allowed_prefix = get_conf("PATH_PRIVATE_UPLOAD")

    def is_path_candidate(part: str) -> bool:
        lowered = part.lower()
        if not part or re.search(r"\s", part):
            return False
        # 只把“明确像路径”的内容当路径，避免误伤普通文本（如 Python/C++/Java）。
        if part.startswith(("~", "/", "\\", "./", "../")) or re.match(r"^[A-Za-z]:[\\/]", part):
            return True
        return (
            part.startswith(allowed_prefix)
            or part.startswith(upload_root_norm)
            or "private_upload/" in lowered
            or "private_upload\\" in lowered
            or "userfiles/" in lowered
            or "userfiles\\" in lowered
            or "gpt_log/" in lowered
            or "gpt_log\\" in lowered
        )

    def check_value(val: str):
        if not isinstance(val, str) or not val:
            return
        parts = [p.strip() for p in re.split(r"[\n,;]+", val) if p.strip()]
        for part in parts:
            # 仅对“看起来像路径”的字段做校验，避免将普通自然语言误判成路径。
            if not is_path_candidate(part):
                continue
            if part.startswith(("~", "\\")) or re.match(r"^[A-Za-z]:[\\/]", part):
                raise ValueError("仅允许使用上传文件路径")
            if ".." in part.replace("\\", "/").split("/"):
                raise ValueError("非法路径")
            abs_path = os.path.abspath(part)
            if os.path.commonpath([upload_root_norm, abs_path]) != upload_root_norm:
                raise ValueError("仅允许使用上传文件路径")

    if strict_main_input:
        check_value(main_input)

    def walk(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if isinstance(v, (dict, list)):
                    walk(v)
                elif isinstance(v, str):
                    key = str(k).lower()
                    # main_input 允许是自然语言，避免误判；仅对显式路径字段做校验。
                    if key in {"file", "files", "path", "dir", "upload_dir"} or ("path" in key or "file" in key or "dir" in key):
                        check_value(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)

    walk(plugin_kwargs)


def _iter_ndjson_from_updates(generator, chat_id=None):
    last_len = 0
    last_assistant = ""
    promoted_files = set()
    for cookies, chatbot_obj, _json_history, _msg in generator:
        chatbot_val = _extract_chatbot_value(chatbot_obj)
        if isinstance(chatbot_val, ChatBotWithCookies):
            chatbot_val = chatbot_val.get_list()
        if not isinstance(chatbot_val, list) or not chatbot_val:
            continue
        if len(chatbot_val) != last_len:
            last_len = len(chatbot_val)
            last_assistant = ""
        last_pair = chatbot_val[-1]
        assistant_text = ""
        if isinstance(last_pair, (list, tuple)) and len(last_pair) >= 2:
            assistant_text = last_pair[1] or ""
        if assistant_text is None:
            assistant_text = ""
        if not isinstance(assistant_text, str):
            assistant_text = str(assistant_text)
        assistant_text = sanitize_chatbot_text(assistant_text)
        reset_content = False
        if assistant_text.startswith(last_assistant):
            delta = assistant_text[len(last_assistant):]
        else:
            delta = assistant_text
            reset_content = bool(last_assistant)
        last_assistant = assistant_text
        if delta:
            payload = {"content": [{"text": delta}]}
            if reset_content:
                payload["resetContent"] = True
            if chat_id:
                payload["chatId"] = chat_id
            yield json.dumps(payload, ensure_ascii=False) + "\n"
        if isinstance(cookies, dict) and cookies.get("files_to_promote"):
            new_files = [f for f in cookies.get("files_to_promote", []) if f not in promoted_files]
            if new_files:
                promoted_files.update(new_files)
                payload = {"fileVectorResult": json.dumps({"files": new_files}, ensure_ascii=False)}
                if chat_id:
                    payload["chatId"] = chat_id
                yield json.dumps(payload, ensure_ascii=False) + "\n"
    yield json.dumps({"finishReason": "stop"}, ensure_ascii=False) + "\n"


def task_executor(initial_msg:UserInterfaceMsg, queue_blocking_from_client:asyncio.Queue, queue_back_to_client:asyncio.Queue):
    """
        initial_msg: 初始的用户消息 ( <---- begin_contact_websocket_server:initial_message )
        queue_blocking_from_client: 从客户端接收阻塞消息的队列
        queue_back_to_client: 发送消息回客户端的队列
    """
    from toolbox import get_plugin_handle
    from toolbox import get_plugin_default_kwargs
    from toolbox import on_file_uploaded

    def update_ui_websocket(chatbot: List[List[str]], history: List[str], chatbot_cookies: dict, special_state: dict):
        send_obj = UserInterfaceMsg(chatbot=chatbot, history=history, chatbot_cookies=chatbot_cookies, special_state=special_state)
        queue_back_to_client.put_nowait(send_obj)


    com = setup_initial_com(initial_msg)

    main_input = com["main_input"]
    plugin_kwargs = com["plugin_kwargs"]
    chatbot_with_cookies = com["chatbot_with_cookie"]
    history = com["history"]
    system_prompt = com["system_prompt"]
    user_request = com["user_request"]
    llm_kwargs = com["llm_kwargs"]


    # ''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
    # ''''''''''''''''''''''''''''''''   调用插件   '''''''''''''''''''''''''''''''''
    # ''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
    # ''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
    if initial_msg.function == "chat":
        plugin = get_plugin_handle("crazy_functions.Chat->Chat")
        my_working_plugin = (plugin)(**com)
        for cookies, chatbot, hist_json, msg in my_working_plugin:
            history = json.loads(hist_json)
            special_state = {'msg': msg}
            update_ui_websocket(chatbot=chatbot, history=history, chatbot_cookies=cookies, special_state=special_state) # ----> receive_callback_fn

    if initial_msg.function == "basic":
        from request_llms.bridge_all import predict
        additional_fn = initial_msg.special_kwargs.get("core_function")
        for cookies, chatbot, hist_json, msg in \
            predict(main_input, llm_kwargs, plugin_kwargs, chatbot_with_cookies, history=history, system_prompt=system_prompt, stream = True, additional_fn=additional_fn):
            history = json.loads(hist_json)
            special_state = {'msg': msg}
            update_ui_websocket(chatbot=chatbot, history=history, chatbot_cookies=cookies, special_state=special_state) # ----> receive_callback_fn

    # ''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
    # ''''''''''''''''''''''''''''''''   上传文件   '''''''''''''''''''''''''''''''''
    # ''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
    # ''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''''
    if initial_msg.function == "upload":
        def wait_upload_done():
            print('Waiting for file upload to complete...')
            file_upload_done_msg = queue_blocking_from_client.get()
            print('file upload complete...')
            if file_upload_done_msg.function != "upload_done":
                raise ValueError("Expected 'upload_done' function, got: {}".format(file_upload_done_msg.function))
            if 'files' not in file_upload_done_msg.special_kwargs:
                raise ValueError("Expected 'files' in special_kwargs, got: {}".format(file_upload_done_msg.special_kwargs))
            return file_upload_done_msg.special_kwargs['files']

        request = DummyRequest()
        request.username = "default_user"
        chatbot = initial_msg.chatbot
        history = initial_msg.history
        chatbot_cookies = initial_msg.chatbot_cookies
        special_state = {'msg': '等待上传'}
        chatbot += [[initial_msg.main_input, None]]
        update_ui_websocket(chatbot=chatbot, history=history, chatbot_cookies=chatbot_cookies, special_state=special_state) # ----> receive_callback_fn

        # 等待上传完成
        files = wait_upload_done()

        # 读取文件并预览
        chatbot += [['正在处理', None]]
        update_ui_websocket(chatbot=chatbot, history=history, chatbot_cookies=chatbot_cookies, special_state=special_state) # ----> receive_callback_fn
        chatbot, _, _, chatbot_cookies = on_file_uploaded(
            request=request, files=files, chatbot=chatbot,
            txt="", txt2="", checkboxes="", cookies=chatbot_cookies
        )
        special_state = {'msg': '完成上传'}
        # 更新前端
        update_ui_websocket(chatbot=chatbot, history=history, chatbot_cookies=chatbot_cookies, special_state=special_state) # ----> receive_callback_fn



class FutureEvent(threading.Event):
    """
    扩展的线程事件类，用于异步操作的结果获取

    这个类扩展了threading.Event，添加了返回值存储功能，
    使得可以在事件完成时同时传递结果数据。
    """
    def __init__(self) -> None:
        super().__init__()
        self.return_value = None

    def terminate(self, return_value):
        """
        终止事件并设置返回值

        参数:
            return_value: 事件完成时要返回的值
        """
        self.return_value = return_value
        self.set()

    def wait_and_get_result(self):
        """
        等待事件完成并获取结果

        返回:
            任意类型: 事件完成时设置的返回值
        """
        self.wait()
        return self.return_value


class AtomicQueue:

    def __init__(self):
        self.queue = Queue()

    def put(self, item):
        self.queue.put(item)

    def put_nowait(self, item):
        self.queue.put(item)

    def get(self, timeout=600):
        while self.queue.empty() and timeout > 0:
            time.sleep(1)
            timeout -= 1
        if timeout <= 0:
            raise TimeoutError("Queue get operation timed out")
        return self.queue.get()


class PythonMethod_AsyncConnectionMaintainer_AgentcraftInterface():
    """
    异步连接维护器接口类

    负责维护WebSocket连接的核心类，处理消息队列的创建和管理，
    以及维护与客户端的长连接通信。
    """

    def make_queue(self):
        """
        创建消息队列

        创建三个异步队列用于不同类型的消息传输：
        1. queue_back_to_client: 发送给客户端的消息队列
        2. queue_realtime_from_client: 实时接收的客户端消息队列
        3. queue_blocking_from_client: 阻塞式接收的客户端消息队列

        返回:
            tuple: 包含三个异步队列的元组
        """
        queue_back_to_client = asyncio.Queue()
        queue_realtime_from_client = asyncio.Queue()
        queue_blocking_from_client = AtomicQueue()
        terminate_event = asyncio.Event()
        return queue_back_to_client, queue_realtime_from_client, queue_blocking_from_client, terminate_event

    async def maintain_connection_forever(self, initial_msg: UserInterfaceMsg, websocket: WebSocket, client_id: str):
        """
        永久维护WebSocket连接

        处理与客户端的持续连接，包括消息的发送和接收。
        创建独立的任务处理消息发送和接收，并启动聊天处理线程。

        参数:
            initial_msg: 初始消息
            websocket: WebSocket连接对象
            client_id: 客户端标识符
        """

        async def wait_message_to_send(queue_back_to_client: asyncio.Queue, terminate_event: asyncio.Event):
            """
            等待并发送消息到客户端

            持续监听消息队列，将消息序列化后发送给客户端。

            参数:
                queue_back_to_client: 发送给客户端的消息队列
            """
            # 🕜 wait message to send away -> front end
            msg_cnt = 0
            try:
                while True:

                    ################
                    # get message and check terminate
                    while True:
                        try:
                            if terminate_event.is_set():
                                msg = TERMINATE_MSG
                                break
                            else:
                                msg: UserInterfaceMsg = await asyncio.wait_for(queue_back_to_client.get(), timeout=0.25)
                                break
                        except asyncio.TimeoutError:
                            continue  # 继续检查条件
                    if msg.function == TERMINATE_MSG.function:
                        logger.info("Received terminate message, skip this message and stopping wait_message_to_send.")
                        break
                    ################


                    msg_cnt += 1
                    if websocket.application_state != WebSocketState.CONNECTED:
                        break
                    msg.special_kwargs['uuid'] = uuid.uuid4().hex
                    print(msg)
                    await websocket.send_bytes(msg.model_dump_json())
            except Exception as e:
                logger.exception(f"Error in wait_message_to_send: {e}")
                raise e

        async def receive_forever(queue_realtime_from_client: asyncio.Queue, queue_blocking_from_client: asyncio.Queue, queue_back_to_client: asyncio.Queue, terminate_event: asyncio.Event):
            """
            永久接收客户端消息

            持续监听WebSocket连接，接收客户端消息并根据消息类型分发到不同队列。

            参数:
                queue_realtime_from_client: 实时消息队列
                queue_blocking_from_client: 阻塞消息队列
                queue_back_to_client: 发送回客户端的消息队列
            """
            # 🕜 keep listening traffic <- front end
            msg_cnt:int = 0
            try:
                while True:
                    ################
                    # get message and check terminate
                    while True:
                        try:
                            if terminate_event.is_set():
                                msg = TERMINATE_MSG
                                break
                            else:
                                message = await asyncio.wait_for(websocket.receive_text(), timeout=0.25)
                                msg: UserInterfaceMsg = UserInterfaceMsg.model_validate_json(message)
                                break
                        except asyncio.TimeoutError:
                            continue  # 继续检查条件
                    if msg.function == TERMINATE_MSG.function:
                        logger.info("Received terminate message, stopping receive_forever")
                        break
                    ################
                    msg_cnt += 1
                    logger.info(f"Received message {msg_cnt}: {msg}")
                    queue_blocking_from_client.put_nowait(msg)


            except Exception as e:
                logger.exception(f"Error in receive_forever: {e}")
                raise e

        queue_back_to_client, queue_realtime_from_client, queue_blocking_from_client, terminate_event = self.make_queue()

        def terminate_callback():
            terminate_event.set()

        def ensure_last_message_sent(queue_back_to_client):
            """
            确保最后一条消息被发送到客户端
            """
            queue_back_to_client.put_nowait(TERMINATE_MSG)
            tic = time.time()
            termination_timeout = 5  # seconds
            while not queue_back_to_client.empty():
                time.sleep(0.25)
                if queue_back_to_client.empty():
                    break
                if time.time() - tic > termination_timeout:
                    break

        def task_wrapper(func):
            def wrapper(*args, **kwargs):
                res = func(*args, **kwargs)
                ensure_last_message_sent(queue_back_to_client)
                terminate_callback()
                return res
            return wrapper

        t_x = asyncio.create_task(wait_message_to_send(queue_back_to_client, terminate_event))
        t_r = asyncio.create_task(receive_forever(queue_realtime_from_client, queue_blocking_from_client, queue_back_to_client, terminate_event))
        task_thread = threading.Thread(target=task_wrapper(task_executor), args=(initial_msg, queue_blocking_from_client, queue_back_to_client), daemon=True)
        task_thread.start()

        await t_x
        await t_r
        await websocket.close()



class MasterMindWebSocketServer(PythonMethod_AsyncConnectionMaintainer_AgentcraftInterface):
    """
    WebSocket服务器主类

    继承自异步连接维护器接口，实现了完整的WebSocket服务器功能。
    负责处理客户端连接、事件管理和消息路由。
    """

    def __init__(self, host, port) -> None:
        """
        初始化WebSocket服务器

        参数:
            host: 服务器主机地址
            port: 服务器端口号
        """
        self.websocket_connections = {}
        self.agentcraft_interface_websocket_connections = {}
        self._event_hub = {}
        self.host= host
        self.port = port
        pass

    def create_event(self, event_name: str):
        """
        创建一个新的事件

        参数:
            event_name: 事件名称

        返回:
            FutureEvent: 新创建的事件对象
        """
        self._event_hub[event_name] = FutureEvent()
        return self._event_hub[event_name]

    def terminate_event(self, event_name: str, msg:UserInterfaceMsg):
        """
        终止指定的事件并设置返回消息

        参数:
            event_name: 要终止的事件名称
            msg: 要返回的用户界面消息
        """
        self._event_hub[event_name].terminate(return_value = msg)
        return

    async def long_task_01_wait_incoming_connection(self):
        """
        等待传入连接的长期任务

        启动FastAPI服务器并等待WebSocket连接。
        处理新的连接请求，建立WebSocket通信。
        """
        # task 1 wait incoming agent connection
        logger.info("task 1 wait incoming agent connection")

        async def launch_websocket_server():
            """
            启动WebSocket服务器

            创建FastAPI应用并配置WebSocket路由，
            设置服务器参数并启动uvicorn服务器。
            """
            app = FastAPI()

            class UserInput(BaseModel):
                main_input: str
            @app.post("/predict_user_input")
            async def predict_user_input(main_input: UserInput):
                def predict_future_input(main_input):
                    from request_llms.bridge_all import predict_no_ui_long_connection
                    from toolbox import get_plugin_default_kwargs
                    from textwrap import dedent
                    com = get_plugin_default_kwargs()
                    llm_kwargs = com['llm_kwargs']
                    llm_kwargs['llm_model'] = 'one-api-glm-4-flash'
                    completion_system_prompt = dedent("""Predict the next input that the user might type.
                    1. Do not repeat the <current_input>. The <future_input> should be a continuation of <current_input>.
                    2. Use same language as the input.
                    3. Do not predict too far ahead.
                    4. Use punctuation when needed. Sometimes <future_input> has to begin with some punctuation.

                    Example:
                    <current_input>北京发布暴</current_input>
                    <future_input>雨红色预警</future_input>

                    <current_input>世界是你们的，也是我们</current_input>
                    <future_input>的，但是归根结底是你们的</future_input>

                    <current_input>多年以后，面对行刑队</current_input>
                    <future_input>，奥雷里亚诺·布恩迪亚上校将会回想起父亲带他去见识冰块的那个遥远的下午。</future_input>

                    Format:
                    <future_input>... the predicted input ...</future_input>
                    """)
                    main_input = "<current_input>" + main_input + "</current_input>"
                    result = predict_no_ui_long_connection(
                        inputs=main_input, llm_kwargs=llm_kwargs, sys_prompt=completion_system_prompt, history=[], console_silence=True
                    )
                    print(result)
                    if "<future_input>" not in result or "</future_input>" not in result:
                        raise ValueError("The response does not contain the expected future input format.")
                    result = result.split("<future_input>")[-1].split("</future_input>")[0].strip()
                    return result

                return JSONResponse(content={'future':predict_future_input(main_input.main_input)})

            @app.post("/core_functional")
            async def core_functional():
                import core_functional, importlib
                importlib.reload(core_functional)    # 热更新prompt
                core_functionals = core_functional.get_core_functions()
                for k in list(core_functionals.keys()):
                    v = core_functionals[k]
                    # remove PreProcess if any
                    if "PreProcess" in v:
                        v.pop("PreProcess")
                    if "Visible" in v and not v["Visible"]:
                        core_functionals.pop(k)
                return JSONResponse(content=core_functionals)


            @app.post("/academic/core-function-list")
            async def academic_core_function_list():
                import core_functional, importlib
                importlib.reload(core_functional)
                core_functionals = core_functional.get_core_functions()
                short_name_map = {
                    "学术中英互译": "中英互译",
                    "解释代码": "学术型代码解释",
                }
                rows = []
                for name, data in core_functionals.items():
                    if data.get("Visible") is False:
                        continue
                    rows.append({
                        "name": name,
                        "displayName": short_name_map.get(name, name),
                        "prefix": data.get("Prefix", ""),
                        "suffix": data.get("Suffix", ""),
                        "color": data.get("Color", "secondary"),
                        "autoClearHistory": data.get("AutoClearHistory", False),
                        "modelOverride": data.get("ModelOverride"),
                    })
                return JSONResponse(content={"rows": rows, "count": len(rows)})

            @app.post("/academic/plugin-list")
            async def academic_plugin_list():
                import crazy_functional, importlib
                importlib.reload(crazy_functional)
                plugins = crazy_functional.get_crazy_functions()
                rows = []

                academic_plugin_order = [
                    "论文速读",
                    "PDF 批量总结",
                    "PDF 深度理解",
                    "Word 批量总结",
                    "Arxiv摘要",
                    "Arxiv 英文摘要",
                    "LaTeX 摘要",
                    "LaTeX 精准翻译",
                    "LaTeX 英文润色",
                    "LaTeX 中文润色",
                    "LaTeX 高亮纠错",
                ]

                def normalize_name(value: str):
                    return str(value or "").replace(" ", "").replace("latex", "latex").lower()

                def sort_key(item: dict):
                    name = item.get("displayName") or item.get("name") or ""
                    key = normalize_name(name)
                    if "arxiv" in key and ("摘要" in key or "下载" in key):
                        key = normalize_name("Arxiv摘要")
                    index = 9999
                    try:
                        index = academic_plugin_order.index(name)
                    except ValueError:
                        for idx, target in enumerate(academic_plugin_order):
                            if normalize_name(target) == key:
                                index = idx
                                break
                    return (index, )

                def sanitize_text(value: str):
                    if not value:
                        return value
                    text = value
                    text = re.sub(r"\s*[（(][^()（）]*插件Demo[^()（）]*[）)]", "", text)
                    text = re.sub(r"\s*[（(][^()（）]*面向开发者[^()（）]*[）)]", "", text)
                    text = re.sub(
                        r"(?:函数)?插件(?:作者|贡献者)\s*[:：]?\s*(?:[A-Za-z0-9_.-]+(?:\s*[,，、/&]\s*[A-Za-z0-9_.-]+)*)[，,;；。\s]*",
                        "",
                        text,
                        flags=re.IGNORECASE,
                    )
                    text = re.sub(r"(?:函数)?插件(?:作者|贡献者)\s*\[[^\]]*][，,;；。\s]*", "", text, flags=re.IGNORECASE)
                    text = re.sub(r"\s*(?:\|\s*)?(不需要输入参数[^|]*|需要输入参数[^|]*|输入参数为[^|]*|输入参数是[^|]*|输入参数[^|]*|参数为[^|]*)", "", text)
                    text = re.sub(r"\s*\|\s*", " ", text)
                    text = re.sub(r"\s{2,}", " ", text)
                    return text.strip()

                blocked = [
                    "虚空终端",
                    "批量文件问答",
                    "查互联网后回答",
                    "历史上的今天",
                    "动态代码解释器（CodeInterpreter）",
                    "[多线程Demo]解析此项目本身（源码自译解）",
                    "删除所有本地对话历史记录",
                    "清除所有缓存文件",
                    "数学动画生成（Manim）",
                    "批量总结音视频",
                    "实时语音对话",
                    "交互功能模板Demo函数",
                    "多媒体智能体",
                ]

                short_name_map = {
                    "批量总结Word文档": "Word 批量总结",
                    "读Tex论文写摘要": "LaTeX 摘要",
                    "批量总结PDF文档": "PDF 批量总结",
                    "理解PDF文档内容 （模仿ChatPDF）": "PDF 深度理解",
                    "英文Latex项目全文润色（输入路径或上传压缩包）": "LaTeX 英文润色",
                    "中文Latex项目全文润色（输入路径或上传压缩包）": "LaTeX 中文润色",
                    "Latex英文纠错+高亮修正位置 [需Latex]": "LaTeX 高亮纠错",
                    "📚Arxiv论文精细翻译（输入arxivID）[需Latex]": "Arxiv 英文摘要",
                    "📚本地Latex论文精细翻译（上传Latex项目）[需Latex]": "LaTeX 精准翻译",
                    "PDF翻译中文并重新编译PDF（上传PDF）[需Latex]": "PDF 精准翻译",
                    "批量文件询问 (支持自定义总结各种文件)": "批量文件问答",
                    "一键下载arxiv论文并翻译摘要（先在input输入编号，如1812.10695）": "Arxiv摘要",
                    "精准翻译PDF文档（NOUGAT）": "PDF 精准翻译",
                    "速读论文": "论文速读",
                    "翻译Markdown或README（支持Github链接）": "翻译Markdown或README",
                    "翻译README或MD": "翻译Markdown或README",
                    "注释Python项目": "注释整个Python项目",
                    "解析项目源代码（手动指定和筛选源代码文件类型）": "解析项目源代码（自定义文件类型）",
                    "解析整个C++项目（.cpp/.hpp/.c/.h）": "解析整个C++项目（.cpp/.hpp等）",
                    "上传一系列python源文件(或者压缩包), 为这些代码添加docstring": "上传python源文件(或压缩包), 为这些代码添加docstring",
                    "解析一个C++项目的所有源文件（.cpp/.hpp/.c/.h）": "解析一个C++项目的所有源文件",
                    "解析Jupyter Notebook文件若输入0，则不解析notebook中的Markdown块": "若输入0，则不解析notebook中的Markdown",
                }
                for name, plugin in plugins.items():
                    if any(block in name for block in blocked):
                        continue
                    display_name = short_name_map.get(name, name)
                    rows.append({
                        "name": name,
                        "displayName": display_name,
                        "group": plugin.get("Group", ""),
                        "info": sanitize_text(plugin.get("Info", name)),
                        "asButton": plugin.get("AsButton", True),
                        "advancedArgs": plugin.get("AdvancedArgs", False),
                        "argsReminder": plugin.get("ArgsReminder", ""),
                        "color": plugin.get("Color", "secondary"),
                    })
                rows = sorted(rows, key=sort_key)
                return JSONResponse(content={"rows": rows, "count": len(rows)})

            @app.post("/academic/chat-process")
            async def academic_chat_process(payload: AcademicStreamRequest):
                def stream():
                    try:
                        from request_llms.bridge_all import predict
                        from crazy_functional import get_crazy_functions
                        ctx = _build_stream_context(payload)
                        main_input = ctx["main_input"]
                        llm_kwargs = ctx["llm_kwargs"]
                        plugin_kwargs = ctx["plugin_kwargs"]
                        chatbot = ctx["chatbot"]
                        history = ctx["history"]
                        system_prompt = ctx["system_prompt"]
                        user_name = ctx["user_name"]
                        # main_input 允许是普通自然语言；仅对明确的路径字段做校验，避免误伤文本类插件。
                        _validate_payload_paths(main_input, plugin_kwargs, strict_main_input=False)

                        if payload.function == "basic":
                            additional_fn = payload.core_function or plugin_kwargs.get("core_function")
                            generator = predict(
                                main_input,
                                llm_kwargs,
                                plugin_kwargs,
                                chatbot,
                                history=history,
                                system_prompt=system_prompt,
                                stream=True,
                                additional_fn=additional_fn,
                            )
                        elif payload.function == "plugin":
                            plugin_name = payload.plugin_name or plugin_kwargs.get("plugin_name")
                            if not plugin_name:
                                raise ValueError("plugin_name is required for function=plugin")
                            plugins = get_crazy_functions()
                            if plugin_name not in plugins:
                                raise ValueError(f"plugin not found: {plugin_name}")
                            plugin = plugins[plugin_name]
                            if plugin.get("Class") is not None:
                                plugin_exe = plugin["Class"].execute
                            else:
                                plugin_exe = plugin["Function"]
                            if plugin_kwargs.get("main_input"):
                                main_input = plugin_kwargs.get("main_input")
                            dummy = DummyRequest()
                            dummy.username = user_name
                            generator = plugin_exe(
                                main_input,
                                llm_kwargs,
                                plugin_kwargs,
                                chatbot,
                                history,
                                system_prompt,
                                dummy,
                            )
                        else:
                            generator = predict(
                                main_input,
                                llm_kwargs,
                                plugin_kwargs,
                                chatbot,
                                history=history,
                                system_prompt=system_prompt,
                                stream=True,
                                additional_fn=None,
                            )

                        for line in _iter_ndjson_from_updates(generator, chat_id=payload.chat_id):
                            yield line.encode("utf-8")
                    except Exception as exc:
                        err_payload = {"finishReason": "error", "error": str(exc)}
                        yield (json.dumps(err_payload, ensure_ascii=False) + "\n").encode("utf-8")

                return StreamingResponse(stream(), media_type="application/x-ndjson")

            @app.post("/academic/upload")
            async def academic_upload(files: List[UploadFile] = File(...), user_name: str = Form(None)):
                from toolbox import gen_time_str, get_upload_folder, del_outdated_uploads, default_user_name
                from shared_utils.handle_upload import extract_archive
                import glob

                upload_user = user_name or default_user_name
                time_tag = gen_time_str()
                target_path_base = get_upload_folder(upload_user, tag=time_tag)
                os.makedirs(target_path_base, exist_ok=True)
                del_outdated_uploads(3600, get_upload_folder(upload_user))

                upload_msg = ""
                for file in files:
                    file_origin_name = os.path.basename(file.filename)
                    this_file_path = os.path.join(target_path_base, file_origin_name)
                    processed_size = 0
                    with open(this_file_path, "wb") as buffer:
                        while True:
                            chunk = await file.read(8192)
                            if not chunk:
                                break
                            buffer.write(chunk)
                            processed_size += len(chunk)
                    upload_msg += extract_archive(
                        file_path=this_file_path,
                        dest_dir=this_file_path + ".extract",
                    )

                moved_files = glob.glob(f"{target_path_base}/**/*", recursive=True)
                return JSONResponse(
                    content={
                        "upload_dir": target_path_base,
                        "files": moved_files,
                        "message": upload_msg,
                    }
                )

            @app.get("/academic/file")
            async def academic_file(path: str):
                from fastapi import HTTPException
                from fastapi.responses import FileResponse
                from toolbox import get_conf

                abs_path = os.path.abspath(path)
                private_root, log_root = get_conf("PATH_PRIVATE_UPLOAD", "PATH_LOGGING")
                allowed_roots = [os.path.abspath(private_root), os.path.abspath(log_root)]
                if not any(abs_path == root or abs_path.startswith(root + os.sep) for root in allowed_roots):
                    raise HTTPException(status_code=403, detail="path not allowed")
                if not os.path.exists(abs_path):
                    raise HTTPException(status_code=404, detail="file not found")
                return FileResponse(abs_path)

            @app.post("/upload")
            async def upload_files(files: List[UploadFile] = File(...)):
                """上传文件接口，支持多文件上传并显示进度"""
                from toolbox import on_file_uploaded
                results = []
                upload_dir = "uploads"

                # 确保上传目录存在
                if not os.path.exists(upload_dir):
                    os.makedirs(upload_dir)

                for file in files:
                    try:
                        # 构建文件保存路径
                        file_path = os.path.join(upload_dir, file.filename)
                        total_size = 0
                        processed_size = 0

                        # 分块读取并保存文件，同时计算进度
                        with open(file_path, "wb") as buffer:
                            while chunk := await file.read(8192):  # 8KB chunks
                                buffer.write(chunk)
                                processed_size += len(chunk)
                                if file.size:  # 如果文件大小可用
                                    progress = (processed_size / file.size) * 100
                                    logger.info(f"Uploading {file.filename}: {progress:.2f}%")

                        results.append({
                            "filename": file.filename,
                            "size": processed_size,
                            "status": "success",
                            "path": file_path
                        })
                    except Exception as e:
                        results.append({
                            "filename": file.filename,
                            "status": "error",
                            "error": str(e)
                        })
                        logger.error(f"Error uploading {file.filename}: {str(e)}")

                return JSONResponse(content={
                    "message": "Files uploaded successfully",
                    "files": results
                })

            @app.websocket("/main")
            async def main(websocket: WebSocket):
                """
                WebSocket连接的主处理函数

                处理新的WebSocket连接请求，接收初始消息并建立持久连接。

                参数:
                    websocket: WebSocket连接对象
                """
                try:
                    await websocket.accept()
                    logger.info(f"WebSocket connection established: {websocket.client.host}:{websocket.client.port}")
                    msg: UserInterfaceMsg = UserInterfaceMsg.model_validate_json(await websocket.receive_text())
                    logger.info(msg)
                    await self.maintain_connection_forever(msg, websocket, "client_id")
                except:
                    logger.exception("Error in WebSocket connection handler")
                    await websocket.close()
            import uvicorn
            config = uvicorn.Config(app, host=self.host, port=self.port, log_level="error", ws_ping_interval=300, ws_ping_timeout=600)
            server = uvicorn.Server(config)
            logger.info(f"uvicorn begin, serving at ws://{self.host}:{self.port}/main")
            await server.serve()

        await launch_websocket_server()
        logger.info("uvicorn terminated")

if __name__ == "__main__":
    mmwss = MasterMindWebSocketServer(host="0.0.0.0", port=38000)
    asyncio.run(mmwss.long_task_01_wait_incoming_connection())
