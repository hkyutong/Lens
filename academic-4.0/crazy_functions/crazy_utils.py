import os
import threading
import random
import re
from loguru import logger
from shared_utils.char_visual_effect import scrolling_visual_effect
from toolbox import update_ui, get_conf, trimmed_format_exc, get_max_token, Singleton


def _read_positive_int_env(name, default_value):
    try:
        value = int(os.getenv(name, default_value))
    except Exception:
        value = default_value
    if value <= 0:
        return default_value
    return value


def _read_positive_float_env(name, default_value):
    try:
        value = float(os.getenv(name, default_value))
    except Exception:
        value = float(default_value)
    if value <= 0:
        return float(default_value)
    return float(value)


def _get_retry_backoff_seconds(retry_attempt, base_seconds=2.0, max_seconds=45.0, jitter_ratio=0.25):
    safe_attempt = max(1, int(retry_attempt))
    wait = min(float(max_seconds), float(base_seconds) * (2 ** (safe_attempt - 1)))
    jitter = max(0.0, min(1.0, float(jitter_ratio)))
    if jitter > 0:
        wait = wait + random.uniform(0.0, wait * jitter)
    return max(1.0, float(wait))


def _has_meaningful_response(text):
    content = str(text or "")
    # 去掉中间态提示，避免“只有警告无正文”被误判为成功。
    cleanup_patterns = [
        r"警告，文本过长将进行截断，Token溢出数：\d+，现继续运行。",
        r"学术服务连接波动，正在重试 \d+/\d+。",
        r"学术服务连接异常，请稍后重试。",
        r"任务处理中，请稍候（[^）]*）",
    ]
    for pattern in cleanup_patterns:
        content = re.sub(pattern, "", content)
    content = re.sub(r"\s+", "", content)
    return len(content) > 0


def _is_rate_limit_error(error_text):
    lower = str(error_text or "").lower()
    return ("rate limit" in lower) or ("too many requests" in lower) or ("429" in lower)


def _resolve_max_workers(default_value, n_frag):
    hard_cap = _read_positive_int_env("LENS_ACADEMIC_HARD_MAX_WORKERS", 16)
    env_cap = _read_positive_int_env("LENS_ACADEMIC_MAX_WORKERS", 8)
    safe_cap = max(1, min(hard_cap, env_cap))
    workers = max(1, int(default_value))
    workers = min(workers, safe_cap)
    return max(1, min(workers, int(max(1, n_frag))))


def _resolve_watchdog_patience(default_seconds=300):
    return _read_positive_int_env("LENS_ACADEMIC_WATCHDOG_SECONDS", default_seconds)

def input_clipping(inputs, history, max_token_limit, return_clip_flags=False):
    """
    当输入文本 + 历史文本超出最大限制时，采取措施丢弃一部分文本。
    输入：
        - inputs 本次请求
        - history 历史上下文
        - max_token_limit 最大token限制
    输出:
        - inputs 本次请求（经过clip）
        - history 历史上下文（经过clip）
    """
    import numpy as np
    from request_llms.bridge_all import model_info
    enc = model_info["gpt-3.5-turbo"]['tokenizer']
    def get_token_num(txt): return len(enc.encode(txt, disallowed_special=()))


    mode = 'input-and-history'
    # 当 输入部分的token占比 小于 全文的一半时，只裁剪历史
    input_token_num = get_token_num(inputs)
    original_input_len = len(inputs)
    if input_token_num < max_token_limit//2:
        mode = 'only-history'
        max_token_limit = max_token_limit - input_token_num

    everything = [inputs] if mode == 'input-and-history' else ['']
    everything.extend(history)
    full_token_num = n_token = get_token_num('\n'.join(everything))
    everything_token = [get_token_num(e) for e in everything]
    everything_token_num = sum(everything_token)
    delta = max(everything_token) // 16 # 截断时的颗粒度

    while n_token > max_token_limit:
        where = np.argmax(everything_token)
        encoded = enc.encode(everything[where], disallowed_special=())
        clipped_encoded = encoded[:len(encoded)-delta]
        everything[where] = enc.decode(clipped_encoded)[:-1]    # -1 to remove the may-be illegal char
        everything_token[where] = get_token_num(everything[where])
        n_token = get_token_num('\n'.join(everything))

    if mode == 'input-and-history':
        inputs = everything[0]
        full_token_num = everything_token_num
    else:
        full_token_num = everything_token_num + input_token_num

    history = everything[1:]

    flags = {
        "mode": mode,
        "original_input_token_num": input_token_num,
        "original_full_token_num": full_token_num,
        "original_input_len": original_input_len,
        "clipped_input_len": len(inputs),
    }

    if not return_clip_flags:
        return inputs, history
    else:
        return inputs, history, flags

def request_gpt_model_in_new_thread_with_ui_alive(
        inputs, inputs_show_user, llm_kwargs,
        chatbot, history, sys_prompt, refresh_interval=0.2,
        handle_token_exceed=True,
        retry_times_at_unknown_error=2,
        ):
    """
    Request GPT model，请求GPT模型同时维持用户界面活跃。

    输入参数 Args （以_array结尾的输入变量都是列表，列表长度为子任务的数量，执行时，会把列表拆解，放到每个子线程中分别执行）:
        inputs (string): List of inputs （输入）
        inputs_show_user (string): List of inputs to show user（展现在报告中的输入，借助此参数，在汇总报告中隐藏啰嗦的真实输入，增强报告的可读性）
        top_p (float): Top p value for sampling from model distribution （GPT参数，浮点数）
        temperature (float): Temperature value for sampling from model distribution（GPT参数，浮点数）
        chatbot: chatbot inputs and outputs （用户界面对话窗口句柄，用于数据流可视化）
        history (list): List of chat history （历史，对话历史列表）
        sys_prompt (string): List of system prompts （系统输入，列表，用于输入给GPT的前提提示，比如你是翻译官怎样怎样）
        refresh_interval (float, optional): Refresh interval for UI (default: 0.2) （刷新时间间隔频率，建议低于1，不可高于3，仅仅服务于视觉效果）
        handle_token_exceed：是否自动处理token溢出的情况，如果选择自动处理，则会在溢出时暴力截断，默认开启
        retry_times_at_unknown_error：失败时的重试次数

    输出 Returns:
        future: 输出，GPT返回的结果
    """
    import time
    from concurrent.futures import ThreadPoolExecutor
    from request_llms.bridge_all import predict_no_ui_long_connection
    # 用户反馈
    chatbot.append([inputs_show_user, ""])
    yield from update_ui(chatbot=chatbot, history=[]) # 刷新界面
    executor = ThreadPoolExecutor(max_workers=16)
    mutable = ["", time.time(), ""]
    # 看门狗耐心
    watch_dog_patience = _resolve_watchdog_patience(300)
    retry_base_seconds = _read_positive_float_env("LENS_ACADEMIC_RETRY_BASE_SECONDS", 2.5)
    retry_max_seconds = _read_positive_float_env("LENS_ACADEMIC_RETRY_MAX_SECONDS", 60.0)
    # 请求任务
    def _req_gpt(inputs, history, sys_prompt):
        total_retry_budget = max(0, int(retry_times_at_unknown_error))
        retry_op = total_retry_budget
        exceeded_cnt = 0
        safe_error_notice = "学术服务连接异常，请稍后重试。"
        while True:
            # watchdog error
            if len(mutable) >= 2 and (time.time()-mutable[1]) > watch_dog_patience:
                raise RuntimeError("检测到程序终止。")
            try:
                # 【第一种情况】：顺利完成
                result = predict_no_ui_long_connection(
                    inputs=inputs, llm_kwargs=llm_kwargs,
                    history=history, sys_prompt=sys_prompt, observe_window=mutable, console_silence=True)
                if not _has_meaningful_response(result):
                    raise RuntimeError("empty response from model")
                return result
            except ConnectionAbortedError as token_exceeded_error:
                # 【第二种情况】：Token溢出
                if handle_token_exceed:
                    exceeded_cnt += 1
                    # 【选择处理】 尝试计算比例，尽可能多地保留文本
                    from toolbox import get_reduce_token_percent
                    p_ratio, n_exceed = get_reduce_token_percent(str(token_exceeded_error))
                    MAX_TOKEN = get_max_token(llm_kwargs)
                    EXCEED_ALLO = 512 + 512 * exceeded_cnt
                    inputs, history = input_clipping(inputs, history, max_token_limit=MAX_TOKEN-EXCEED_ALLO)
                    warning_line = f"警告，文本过长将进行截断，Token溢出数：{n_exceed}，现继续运行。"
                    if warning_line not in mutable[0]:
                        mutable[0] += f"{warning_line}\n\n"
                    continue # 返回重试
                else:
                    # 【选择放弃】
                    tb_str = '```\n' + trimmed_format_exc() + '```'
                    logger.error(tb_str)
                    if safe_error_notice not in mutable[0]:
                        mutable[0] += f"{safe_error_notice}\n\n"
                    return mutable[0] # 放弃
            except:
                # 【第三种情况】：其他错误：重试几次
                tb_str = '```\n' + trimmed_format_exc() + '```'
                logger.error(tb_str)
                if safe_error_notice not in mutable[0]:
                    mutable[0] += f"{safe_error_notice}\n\n"
                if retry_op > 0:
                    retry_op -= 1
                    current_retry_idx = total_retry_budget - retry_op
                    retry_line = f"学术服务连接波动，正在重试 {current_retry_idx}/{max(1, total_retry_budget)}。"
                    if retry_line not in mutable[0]:
                        mutable[0] += f"{retry_line}\n\n"
                    wait_seconds = _get_retry_backoff_seconds(
                        retry_attempt=max(1, current_retry_idx),
                        base_seconds=retry_base_seconds,
                        max_seconds=retry_max_seconds,
                    )
                    if _is_rate_limit_error(tb_str):
                        wait_seconds = min(wait_seconds * 2, retry_max_seconds * 2)
                    time.sleep(wait_seconds)
                    continue # 返回重试
                else:
                    if not _has_meaningful_response(mutable[0]):
                        mutable[0] = f"{safe_error_notice}\n\n请稍后重试。"
                    return mutable[0] # 放弃

    # 提交任务
    future = executor.submit(_req_gpt, inputs, history, sys_prompt)
    while True:
        # yield一次以刷新前端页面
        time.sleep(refresh_interval)
        # “喂狗”（看门狗）
        mutable[1] = time.time()
        if future.done():
            break
        chatbot[-1] = [chatbot[-1][0], mutable[0]]
        yield from update_ui(chatbot=chatbot, history=[]) # 刷新界面

    final_result = future.result()
    chatbot[-1] = [chatbot[-1][0], final_result]
    yield from update_ui(chatbot=chatbot, history=[]) # 如果最后成功了，则删除报错信息
    return final_result

def can_multi_process(llm) -> bool:
    from request_llms.bridge_all import model_info

    def default_condition(llm) -> bool:
        # legacy condition
        if llm.startswith('gpt-'): return True
        if llm.startswith('chatgpt-'): return True
        if llm.startswith('api2d-'): return True
        if llm.startswith('azure-'): return True
        if llm.startswith('spark'): return True
        if llm.startswith('zhipuai') or llm.startswith('glm-'): return True
        return False

    if llm in model_info:
        if 'can_multi_thread' in model_info[llm]:
            return model_info[llm]['can_multi_thread']
        else:
            return default_condition(llm)
    else:
        return default_condition(llm)

def request_gpt_model_multi_threads_with_very_awesome_ui_and_high_efficiency(
        inputs_array, inputs_show_user_array, llm_kwargs,
        chatbot, history_array, sys_prompt_array,
        refresh_interval=0.2, max_workers=-1, scroller_max_len=75,
        handle_token_exceed=True, show_user_at_complete=False,
        retry_times_at_unknown_error=2,
        compact_progress=True, progress_update_interval=0.8,
        ):
    """
    Request GPT model using multiple threads with UI and high efficiency
    请求GPT模型的[多线程]版。
    具备以下功能：
        实时在UI上反馈远程数据流
        使用线程池，可调节线程池的大小避免openai的流量限制错误
        处理中途中止的情况
        网络等出问题时，会把traceback和已经接收的数据转入输出

    输入参数 Args （以_array结尾的输入变量都是列表，列表长度为子任务的数量，执行时，会把列表拆解，放到每个子线程中分别执行）:
        inputs_array (list): List of inputs （每个子任务的输入）
        inputs_show_user_array (list): List of inputs to show user（每个子任务展现在报告中的输入，借助此参数，在汇总报告中隐藏啰嗦的真实输入，增强报告的可读性）
        llm_kwargs: llm_kwargs参数
        chatbot: chatbot （用户界面对话窗口句柄，用于数据流可视化）
        history_array (list): List of chat history （历史对话输入，双层列表，第一层列表是子任务分解，第二层列表是对话历史）
        sys_prompt_array (list): List of system prompts （系统输入，列表，用于输入给GPT的前提提示，比如你是翻译官怎样怎样）
        refresh_interval (float, optional): Refresh interval for UI (default: 0.2) （刷新时间间隔频率，建议低于1，不可高于3，仅仅服务于视觉效果）
        max_workers (int, optional): Maximum number of threads (default: see config.py) （最大线程数，如果子任务非常多，需要用此选项防止高频地请求openai导致错误）
        scroller_max_len (int, optional): Maximum length for scroller (default: 30)（数据流的显示最后收到的多少个字符，仅仅服务于视觉效果）
        handle_token_exceed (bool, optional): （是否在输入过长时，自动缩减文本）
        handle_token_exceed：是否自动处理token溢出的情况，如果选择自动处理，则会在溢出时暴力截断，默认开启
        show_user_at_complete (bool, optional): (在结束时，把完整输入-输出结果显示在聊天框)
        retry_times_at_unknown_error：子任务失败时的重试次数
        compact_progress (bool, optional): 使用简洁进度展示，避免逐线程状态刷屏
        progress_update_interval (float, optional): 简洁进度最小刷新间隔（秒）

    输出 Returns:
        list: List of GPT model responses （每个子任务的输出汇总，如果某个子任务出错，response中会携带traceback报错信息，方便调试和定位问题。）
    """
    import time
    from concurrent.futures import ThreadPoolExecutor
    from request_llms.bridge_all import predict_no_ui_long_connection
    assert len(inputs_array) == len(history_array)
    assert len(inputs_array) == len(sys_prompt_array)
    n_frag = len(inputs_array)
    if n_frag == 0:
        return []

    configured_workers = max_workers
    if configured_workers == -1:
        # 读取配置文件
        try:
            configured_workers = int(get_conf('DEFAULT_WORKER_NUM'))
        except Exception:
            configured_workers = 8
    try:
        configured_workers = int(configured_workers)
    except Exception:
        configured_workers = 1
    if configured_workers <= 0:
        configured_workers = 1
    max_workers = _resolve_max_workers(configured_workers, n_frag)

    # 屏蔽掉 chatglm的多线程，可能会导致严重卡顿
    if not can_multi_process(llm_kwargs['llm_model']):
        max_workers = 1

    # 用户反馈
    if compact_progress:
        chatbot.append(["请开始多线程操作。", f"任务处理中，请稍候（已完成 0/{n_frag}）"])
    else:
        chatbot.append(["请开始多线程操作。", ""])
    yield from update_ui(chatbot=chatbot, history=[]) # 刷新界面
    # 跨线程传递
    mutable = [["", time.time(), "等待中"] for _ in range(n_frag)]
    task_result_by_index = ["" for _ in range(n_frag)]
    task_success_by_index = [False for _ in range(n_frag)]
    last_compact_progress = ""
    last_progress_emit_at = 0.0

    # 看门狗耐心
    watch_dog_patience = _resolve_watchdog_patience(300)
    retry_base_seconds = _read_positive_float_env("LENS_ACADEMIC_RETRY_BASE_SECONDS", 2.0)
    retry_max_seconds = _read_positive_float_env("LENS_ACADEMIC_RETRY_MAX_SECONDS", 60.0)
    failed_fragment_reruns = _read_positive_int_env("LENS_ACADEMIC_FAILED_FRAGMENT_RERUNS", 2)
    rerun_retry_budget = _read_positive_int_env(
        "LENS_ACADEMIC_FAILED_FRAGMENT_RETRY_TIMES",
        max(1, int(retry_times_at_unknown_error)),
    )

    # 子线程任务
    def _req_gpt(index, inputs, history, sys_prompt, retry_budget):
        gpt_say = ""
        total_retry_budget = max(0, int(retry_budget))
        retry_op = total_retry_budget
        exceeded_cnt = 0
        safe_error_notice = "学术服务连接异常，请稍后重试。"
        mutable[index][2] = "执行中"
        detect_timeout = lambda: len(mutable[index]) >= 2 and (time.time()-mutable[index][1]) > watch_dog_patience
        while True:
            # watchdog error
            if detect_timeout(): raise RuntimeError("检测到程序终止。")
            try:
                # 【第一种情况】：顺利完成
                gpt_say = predict_no_ui_long_connection(
                    inputs=inputs, llm_kwargs=llm_kwargs, history=history,
                    sys_prompt=sys_prompt, observe_window=mutable[index], console_silence=True
                )
                if not _has_meaningful_response(gpt_say):
                    raise RuntimeError("empty response from model")
                mutable[index][2] = "已成功"
                task_success_by_index[index] = True
                return gpt_say
            except ConnectionAbortedError as token_exceeded_error:
                # 【第二种情况】：Token溢出
                if handle_token_exceed:
                    exceeded_cnt += 1
                    # 【选择处理】 尝试计算比例，尽可能多地保留文本
                    from toolbox import get_reduce_token_percent
                    p_ratio, n_exceed = get_reduce_token_percent(str(token_exceeded_error))
                    MAX_TOKEN = get_max_token(llm_kwargs)
                    EXCEED_ALLO = 512 + 512 * exceeded_cnt
                    inputs, history = input_clipping(inputs, history, max_token_limit=MAX_TOKEN-EXCEED_ALLO)
                    warning_line = f"警告，文本过长将进行截断，Token溢出数：{n_exceed}，现继续运行。"
                    if warning_line not in gpt_say:
                        gpt_say += f"{warning_line}\n\n"
                    mutable[index][2] = f"截断重试"
                    continue # 返回重试
                else:
                    # 【选择放弃】
                    tb_str = '```\n' + trimmed_format_exc() + '```'
                    logger.error(tb_str)
                    if safe_error_notice not in gpt_say:
                        gpt_say += f"{safe_error_notice}\n\n"
                    if len(mutable[index][0]) > 0:
                        gpt_say += "此线程失败前收到的回答（节选）：\n\n" + str(mutable[index][0])[-1200:]
                    mutable[index][2] = "输入过长已放弃"
                    task_success_by_index[index] = False
                    return gpt_say # 放弃
            except:
                # 【第三种情况】：其他错误
                if detect_timeout(): raise RuntimeError("检测到程序终止。")
                tb_str = '```\n' + trimmed_format_exc() + '```'
                logger.error(tb_str)
                if safe_error_notice not in gpt_say:
                    gpt_say += f"{safe_error_notice}\n\n"
                if len(mutable[index][0]) > 0:
                    gpt_say += "此线程失败前收到的回答（节选）：\n\n" + str(mutable[index][0])[-1200:]
                if retry_op > 0:
                    retry_op -= 1
                    current_retry_idx = total_retry_budget - retry_op
                    wait = _get_retry_backoff_seconds(
                        retry_attempt=max(1, current_retry_idx),
                        base_seconds=retry_base_seconds,
                        max_seconds=retry_max_seconds,
                    )
                    if _is_rate_limit_error(tb_str):
                        wait = min(wait * 2, retry_max_seconds * 2)
                    # 开始重试
                    if detect_timeout(): raise RuntimeError("检测到程序终止。")
                    mutable[index][2] = f"重试中 {current_retry_idx}/{max(1, total_retry_budget)}（约{int(wait)}秒）"
                    time.sleep(wait)
                    continue # 返回重试
                else:
                    mutable[index][2] = "已失败"
                    task_success_by_index[index] = False
                    if not _has_meaningful_response(gpt_say):
                        gpt_say = safe_error_notice
                    return gpt_say # 放弃

    cnt = 0

    def build_compact_progress_message(stage_hint="任务处理中，请稍候"):
        status_list = [str(item[2] or "") for item in mutable]
        done_cnt = sum(1 for status in status_list if status == "已成功")
        failed_cnt = sum(1 for status in status_list if ("失败" in status) or ("放弃" in status))
        retry_cnt = sum(1 for status in status_list if ("重试" in status) or ("截断" in status))
        waiting_cnt = sum(1 for status in status_list if status == "等待中")
        running_cnt = max(0, n_frag - done_cnt - failed_cnt - waiting_cnt)
        parts = [f"已完成 {done_cnt}/{n_frag}"]
        if running_cnt > 0:
            parts.append(f"处理中 {running_cnt}")
        if waiting_cnt > 0:
            parts.append(f"排队 {waiting_cnt}")
        if retry_cnt > 0:
            parts.append(f"重试 {retry_cnt}")
        if failed_cnt > 0:
            parts.append(f"失败 {failed_cnt}")
        return f"{stage_hint}（" + "，".join(parts) + "）"

    def emit_progress(stage_hint, worker_done_flags, force=False):
        nonlocal cnt, last_compact_progress, last_progress_emit_at
        cnt += 1
        if compact_progress:
            now = time.time()
            progress_msg = build_compact_progress_message(stage_hint)
            should_emit = force or (
                progress_msg != last_compact_progress or
                (now - last_progress_emit_at) >= progress_update_interval or
                all(worker_done_flags)
            )
            if should_emit:
                chatbot[-1] = [chatbot[-1][0], progress_msg]
                yield from update_ui(chatbot=chatbot, history=[]) # 刷新界面
                last_compact_progress = progress_msg
                last_progress_emit_at = now
            return

        observe_win = []
        for thread_index, _ in enumerate(worker_done_flags):
            print_something_really_funny = f"[ ...`{scrolling_visual_effect(mutable[thread_index][0], scroller_max_len)}`... ]"
            observe_win.append(print_something_really_funny)
        stat_str = ''.join([f'`{mutable[thread_index][2]}`: {obs}\n\n'
                            if not done else f'`{mutable[thread_index][2]}`\n\n'
                            for thread_index, done, obs in zip(range(len(worker_done_flags)), worker_done_flags, observe_win)])
        chatbot[-1] = [chatbot[-1][0], f'{stage_hint}\n\n{stat_str}' + ''.join(['.']*(cnt % 10+1))]
        yield from update_ui(chatbot=chatbot, history=[]) # 刷新界面

    def run_stage(task_indexes, retry_budget, stage_hint):
        if not task_indexes:
            return
        stage_workers = min(max_workers, max(1, len(task_indexes)))
        stage_executor = ThreadPoolExecutor(max_workers=stage_workers)
        stage_future_map = {
            index: stage_executor.submit(
                _req_gpt,
                index,
                inputs_array[index],
                history_array[index],
                sys_prompt_array[index],
                retry_budget,
            )
            for index in task_indexes
        }
        stage_indexes = list(stage_future_map.keys())
        while True:
            time.sleep(refresh_interval)
            worker_done_flags = [stage_future_map[index].done() for index in stage_indexes]
            for index in stage_indexes:
                mutable[index][1] = time.time()
            yield from emit_progress(stage_hint, worker_done_flags)
            if all(worker_done_flags):
                break
        for index in stage_indexes:
            future = stage_future_map[index]
            try:
                task_result_by_index[index] = future.result()
            except Exception:
                logger.error(trimmed_format_exc())
                task_result_by_index[index] = "学术服务连接异常，请稍后重试。"
                task_success_by_index[index] = False
            if not task_success_by_index[index]:
                task_success_by_index[index] = _has_meaningful_response(task_result_by_index[index])
        stage_executor.shutdown(wait=True)
        yield from emit_progress(stage_hint, [True for _ in stage_indexes], force=True)

    # 首轮执行
    yield from run_stage(
        task_indexes=list(range(n_frag)),
        retry_budget=retry_times_at_unknown_error,
        stage_hint="任务处理中，请稍候",
    )

    # 失败分片自动补跑
    if failed_fragment_reruns > 0:
        for rerun_round in range(1, failed_fragment_reruns + 1):
            failed_indexes = [
                index for index in range(n_frag)
                if (not task_success_by_index[index]) or (not _has_meaningful_response(task_result_by_index[index]))
            ]
            if not failed_indexes:
                break
            for index in failed_indexes:
                mutable[index][2] = f"补跑排队 {rerun_round}/{failed_fragment_reruns}"
            yield from run_stage(
                task_indexes=failed_indexes,
                retry_budget=rerun_retry_budget,
                stage_hint=f"检测到失败分片，自动补跑 {rerun_round}/{failed_fragment_reruns}",
            )

    # 异步任务结束
    gpt_response_collection = []
    for index, inputs_show_user in enumerate(inputs_show_user_array):
        gpt_response_collection.extend([inputs_show_user, task_result_by_index[index]])

    # 是否在结束时，在界面上显示结果
    if show_user_at_complete:
        for index, inputs_show_user in enumerate(inputs_show_user_array):
            gpt_res = task_result_by_index[index]
            chatbot.append([inputs_show_user, gpt_res if gpt_res else "学术服务连接异常，请稍后重试。"])
            yield from update_ui(chatbot=chatbot, history=[]) # 刷新界面
            time.sleep(0.5)
    return gpt_response_collection



def read_and_clean_pdf_text(fp):
    """
    这个函数用于分割pdf，用了很多trick，逻辑较乱，效果奇好

    **输入参数说明**
    - `fp`：需要读取和清理文本的pdf文件路径

    **输出参数说明**
    - `meta_txt`：清理后的文本内容字符串
    - `page_one_meta`：第一页清理后的文本内容列表

    **函数功能**
    读取pdf文件并清理其中的文本内容，清理规则包括：
    - 提取所有块元的文本信息，并合并为一个字符串
    - 去除短块（字符数小于100）并替换为回车符
    - 清理多余的空行
    - 合并小写字母开头的段落块并替换为空格
    - 清除重复的换行
    - 将每个换行符替换为两个换行符，使每个段落之间有两个换行符分隔
    """
    import fitz, copy
    import re
    import numpy as np
    # from shared_utils.colorful import print亮黄, print亮绿
    fc = 0  # Index 0 文本
    fs = 1  # Index 1 字体
    fb = 2  # Index 2 框框
    REMOVE_FOOT_NOTE = True # 是否丢弃掉 不是正文的内容 （比正文字体小，如参考文献、脚注、图注等）
    REMOVE_FOOT_FFSIZE_PERCENT = 0.95 # 小于正文的？时，判定为不是正文（有些文章的正文部分字体大小不是100%统一的，有肉眼不可见的小变化）
    def primary_ffsize(l):
        """
        提取文本块主字体
        """
        fsize_statistics = {}
        for wtf in l['spans']:
            if wtf['size'] not in fsize_statistics: fsize_statistics[wtf['size']] = 0
            fsize_statistics[wtf['size']] += len(wtf['text'])
        return max(fsize_statistics, key=fsize_statistics.get)

    def ffsize_same(a,b):
        """
        提取字体大小是否近似相等
        """
        return abs((a-b)/max(a,b)) < 0.02

    with fitz.open(fp) as doc:
        meta_txt = []
        meta_font = []

        meta_line = []
        meta_span = []
        ############################## <第 1 步，搜集初始信息> ##################################
        for index, page in enumerate(doc):
            # file_content += page.get_text()
            text_areas = page.get_text("dict")  # 获取页面上的文本信息
            for t in text_areas['blocks']:
                if 'lines' in t:
                    pf = 998
                    for l in t['lines']:
                        txt_line = "".join([wtf['text'] for wtf in l['spans']])
                        if len(txt_line) == 0: continue
                        pf = primary_ffsize(l)
                        meta_line.append([txt_line, pf, l['bbox'], l])
                        for wtf in l['spans']: # for l in t['lines']:
                            meta_span.append([wtf['text'], wtf['size'], len(wtf['text'])])
                    # meta_line.append(["NEW_BLOCK", pf])
            # 块元提取                           for each word segment with in line                       for each line         cross-line words                          for each block
            meta_txt.extend([" ".join(["".join([wtf['text'] for wtf in l['spans']]) for l in t['lines']]).replace(
                '- ', '') for t in text_areas['blocks'] if 'lines' in t])
            meta_font.extend([np.mean([np.mean([wtf['size'] for wtf in l['spans']])
                             for l in t['lines']]) for t in text_areas['blocks'] if 'lines' in t])
            if index == 0:
                page_one_meta = [" ".join(["".join([wtf['text'] for wtf in l['spans']]) for l in t['lines']]).replace(
                    '- ', '') for t in text_areas['blocks'] if 'lines' in t]

        ############################## <第 2 步，获取正文主字体> ##################################
        try:
            fsize_statistics = {}
            for span in meta_span:
                if span[1] not in fsize_statistics: fsize_statistics[span[1]] = 0
                fsize_statistics[span[1]] += span[2]
            main_fsize = max(fsize_statistics, key=fsize_statistics.get)
            if REMOVE_FOOT_NOTE:
                give_up_fize_threshold = main_fsize * REMOVE_FOOT_FFSIZE_PERCENT
        except:
            raise RuntimeError(f'抱歉, 我们暂时无法解析此PDF文档: {fp}。')
        ############################## <第 3 步，切分和重新整合> ##################################
        mega_sec = []
        sec = []
        for index, line in enumerate(meta_line):
            if index == 0:
                sec.append(line[fc])
                continue
            if REMOVE_FOOT_NOTE:
                if meta_line[index][fs] <= give_up_fize_threshold:
                    continue
            if ffsize_same(meta_line[index][fs], meta_line[index-1][fs]):
                # 尝试识别段落
                if meta_line[index][fc].endswith('.') and\
                    (meta_line[index-1][fc] != 'NEW_BLOCK') and \
                    (meta_line[index][fb][2] - meta_line[index][fb][0]) < (meta_line[index-1][fb][2] - meta_line[index-1][fb][0]) * 0.7:
                    sec[-1] += line[fc]
                    sec[-1] += "\n\n"
                else:
                    sec[-1] += " "
                    sec[-1] += line[fc]
            else:
                if (index+1 < len(meta_line)) and \
                    meta_line[index][fs] > main_fsize:
                    # 单行 + 字体大
                    mega_sec.append(copy.deepcopy(sec))
                    sec = []
                    sec.append("# " + line[fc])
                else:
                    # 尝试识别section
                    if meta_line[index-1][fs] > meta_line[index][fs]:
                        sec.append("\n" + line[fc])
                    else:
                        sec.append(line[fc])
        mega_sec.append(copy.deepcopy(sec))

        finals = []
        for ms in mega_sec:
            final = " ".join(ms)
            final = final.replace('- ', ' ')
            finals.append(final)
        meta_txt = finals

        ############################## <第 4 步，乱七八糟的后处理> ##################################
        def 把字符太少的块清除为回车(meta_txt):
            for index, block_txt in enumerate(meta_txt):
                if len(block_txt) < 100:
                    meta_txt[index] = '\n'
            return meta_txt
        meta_txt = 把字符太少的块清除为回车(meta_txt)

        def 清理多余的空行(meta_txt):
            for index in reversed(range(1, len(meta_txt))):
                if meta_txt[index] == '\n' and meta_txt[index-1] == '\n':
                    meta_txt.pop(index)
            return meta_txt
        meta_txt = 清理多余的空行(meta_txt)

        def 合并小写开头的段落块(meta_txt):
            def starts_with_lowercase_word(s):
                pattern = r"^[a-z]+"
                match = re.match(pattern, s)
                if match:
                    return True
                else:
                    return False
            # 对于某些PDF会有第一个段落就以小写字母开头,为了避免索引错误将其更改为大写
            if starts_with_lowercase_word(meta_txt[0]):
                meta_txt[0] = meta_txt[0].capitalize()
            for _ in range(100):
                for index, block_txt in enumerate(meta_txt):
                    if starts_with_lowercase_word(block_txt):
                        if meta_txt[index-1] != '\n':
                            meta_txt[index-1] += ' '
                        else:
                            meta_txt[index-1] = ''
                        meta_txt[index-1] += meta_txt[index]
                        meta_txt[index] = '\n'
            return meta_txt
        meta_txt = 合并小写开头的段落块(meta_txt)
        meta_txt = 清理多余的空行(meta_txt)

        meta_txt = '\n'.join(meta_txt)
        # 清除重复的换行
        for _ in range(5):
            meta_txt = meta_txt.replace('\n\n', '\n')

        # 换行 -> 双换行
        meta_txt = meta_txt.replace('\n', '\n\n')

        ############################## <第 5 步，展示分割效果> ##################################
        # for f in finals:
        #    print亮黄(f)
        #    print亮绿('***************************')

    return meta_txt, page_one_meta


def get_files_from_everything(txt, type): # type='.md'
    """
    这个函数是用来获取指定目录下所有指定类型（如.md）的文件，并且对于网络上的文件，也可以获取它。
    下面是对每个参数和返回值的说明：
    参数
    - txt: 路径或网址，表示要搜索的文件或者文件夹路径或网络上的文件。
    - type: 字符串，表示要搜索的文件类型。默认是.md。
    返回值
    - success: 布尔值，表示函数是否成功执行。
    - file_manifest: 文件路径列表，里面包含以指定类型为后缀名的所有文件的绝对路径。
    - project_folder: 字符串，表示文件所在的文件夹路径。如果是网络上的文件，就是临时文件夹的路径。
    该函数详细注释已添加，请确认是否满足您的需要。
    """
    import glob, os

    success = True
    if txt.startswith('http'):
        # 网络的远程文件
        import requests
        from toolbox import get_conf
        from toolbox import get_log_folder, gen_time_str
        proxies = get_conf('proxies')
        try:
            r = requests.get(txt, proxies=proxies)
        except:
            raise ConnectionRefusedError(f"无法下载资源{txt}，请检查。")
        path = os.path.join(get_log_folder(plugin_name='web_download'), gen_time_str()+type)
        with open(path, 'wb+') as f: f.write(r.content)
        project_folder = get_log_folder(plugin_name='web_download')
        file_manifest = [path]
    elif txt.endswith(type):
        # 直接给定文件
        file_manifest = [txt]
        project_folder = os.path.dirname(txt)
    elif os.path.exists(txt):
        # 本地路径，递归搜索
        project_folder = txt
        file_manifest = [f for f in glob.glob(f'{project_folder}/**/*'+type, recursive=True)]
        if len(file_manifest) == 0:
            success = False
    else:
        project_folder = None
        file_manifest = []
        success = False

    return success, file_manifest, project_folder



@Singleton
class nougat_interface():
    def __init__(self):
        self.threadLock = threading.Lock()

    def nougat_with_timeout(self, command, cwd, timeout=3600):
        import subprocess
        from toolbox import ProxyNetworkActivate
        logger.info(f'正在执行命令 {command}')
        with ProxyNetworkActivate("Nougat_Download"):
            process = subprocess.Popen(command, shell=False, cwd=cwd, env=os.environ)
        try:
            stdout, stderr = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate()
            logger.error("Process timed out!")
            return False
        return True


    def NOUGAT_parse_pdf(self, fp, chatbot, history):
        from toolbox import update_ui_latest_msg

        yield from update_ui_latest_msg("正在解析论文, 请稍候。进度：正在排队, 等待线程锁...",
                                         chatbot=chatbot, history=history, delay=0)
        self.threadLock.acquire()
        import glob, threading, os
        from toolbox import get_log_folder, gen_time_str
        dst = os.path.join(get_log_folder(plugin_name='nougat'), gen_time_str())
        os.makedirs(dst)

        yield from update_ui_latest_msg("正在解析论文, 请稍候。进度：正在加载NOUGAT... （提示：首次运行需要花费较长时间下载NOUGAT参数）",
                                         chatbot=chatbot, history=history, delay=0)
        command = ['nougat', '--out', os.path.abspath(dst), os.path.abspath(fp)]
        self.nougat_with_timeout(command, cwd=os.getcwd(), timeout=3600)
        res = glob.glob(os.path.join(dst,'*.mmd'))
        if len(res) == 0:
            self.threadLock.release()
            raise RuntimeError("Nougat解析论文失败。")
        self.threadLock.release()
        return res[0]




def try_install_deps(deps, reload_m=[]):
    import subprocess, sys, importlib
    for dep in deps:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--user', dep])
    import site
    importlib.reload(site)
    for m in reload_m:
        importlib.reload(__import__(m))


def get_plugin_arg(plugin_kwargs, key, default):
    # 如果参数是空的
    if (key in plugin_kwargs) and (plugin_kwargs[key] == ""): plugin_kwargs.pop(key)
    # 正常情况
    return plugin_kwargs.get(key, default)
