from toolbox import update_ui
from toolbox import CatchException, report_exception
from toolbox import write_history_to_file, promote_file_to_downloadzone
from crazy_functions.crazy_utils import request_gpt_model_in_new_thread_with_ui_alive


def _is_summary_response_too_weak(text: str) -> bool:
    value = str(text or "").strip()
    if not value:
        return True
    if value.startswith("警告，文本过长将进行截断，Token溢出数"):
        return True
    if value in {"学术服务连接异常，请稍后重试。", "学术服务处理失败，请重试"}:
        return True
    if len(value) < 32:
        return True
    return False


def _build_local_fallback_summary(file_name: str, file_content: str) -> str:
    import re

    value = str(file_content or "")
    # 兜底摘要不泄露内部实现，仅给用户可读内容。
    value = re.sub(
        r"^\s*警告，文本过长将进行截断，Token溢出数[:：]\s*\d+[^\n]*$",
        "",
        value,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    value = re.sub(
        r"^\s*(?:任务处理中[^\n]*|学术服务连接[^\n]*|重试中[^\n]*)$",
        "",
        value,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    value = re.sub(r"\[\d+/\d+\]\s*请对下面的文章片段做一个概述[:：]?\s*", "", value)
    value = re.sub(r"(?<!\\)%.*", "", value)
    value = re.sub(r"\\begin\{thebibliography\}[\s\S]*?\\end\{thebibliography\}", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\\bibliography\{[^\}]*\}", "", value, flags=re.IGNORECASE)
    lines = [line.strip() for line in value.splitlines() if line.strip()]
    merged = " ".join(lines)
    merged = re.sub(r"\s{2,}", " ", merged).strip()
    if not merged:
        return f"已读取文件《{file_name}》，当前文本内容较少，建议提供更完整的正文后重试。"
    excerpt = merged[:520]
    return f"已读取文件《{file_name}》。受文本长度限制，先给出简要概述：{excerpt}"


def _extract_summary_ready_text(file_content: str, max_chars: int = 24000) -> str:
    import re

    value = str(file_content or "")
    if not value.strip():
        return ""

    # 清理注释和明显的图形绘制区域，避免把大段坐标代码送入模型。
    value = re.sub(r"(?<!\\)%.*", "", value)
    value = re.sub(
        r"\\begin\{(?:picture|tikzpicture)\}[\s\S]*?\\end\{(?:picture|tikzpicture)\}",
        " ",
        value,
        flags=re.IGNORECASE,
    )
    value = re.sub(r"\\put\s*\([^)]*\)\s*\{[^{}]*\}", " ", value)

    # 先抽取标题信息，保证摘要输入保留结构线索。
    headings = re.findall(
        r"\\(?:section|subsection|subsubsection|chapter)\*?\{([^{}]{1,200})\}",
        value,
        flags=re.IGNORECASE,
    )
    abstract_blocks = re.findall(
        r"\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}",
        value,
        flags=re.IGNORECASE,
    )

    # 转为近似纯文本，保留可读正文。
    plain = value
    plain = re.sub(r"\\[a-zA-Z@]+(?:\[[^\]]*\])?(?:\{[^{}]*\})?", " ", plain)
    plain = re.sub(r"[{}\\$^~_`]+", " ", plain)
    plain = re.sub(r"\s+", " ", plain).strip()

    segments = []
    if headings:
        segments.append("；".join(h.strip() for h in headings if h.strip()))
    if abstract_blocks:
        segments.append(" ".join(block.strip() for block in abstract_blocks if block.strip()))
    if plain:
        segments.append(plain)
    merged = "\n".join(item for item in segments if item).strip()
    if not merged:
        return ""
    return merged[:max_chars]


def 解析Paper(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt):
    import time, glob, os
    summary_snippets = []
    for index, fp in enumerate(file_manifest):
        with open(fp, 'r', encoding='utf-8', errors='replace') as f:
            file_content = f.read()
        summary_ready_text = _extract_summary_ready_text(file_content)
        summary_snippets.append(summary_ready_text if summary_ready_text else file_content[:6000])

        prefix = "接下来请你逐文件分析下面的论文文件，概括其内容" if index==0 else ""
        i_say = prefix + f'请对下面的文章片段用中文做一个概述，文件名是{os.path.basename(fp)}，文章内容是 ```{summary_ready_text}```'
        i_say_show_user = prefix + f'[{index+1}/{len(file_manifest)}] 请对下面的文章片段做一个概述：{os.path.basename(fp)}'
        chatbot.append((i_say_show_user, "正在生成摘要，请稍候。"))
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面

        msg = '正常'
        if not summary_ready_text:
            gpt_say = _build_local_fallback_summary(os.path.basename(fp), file_content)
        else:
            gpt_say = yield from request_gpt_model_in_new_thread_with_ui_alive(
                i_say,
                i_say_show_user,
                llm_kwargs,
                chatbot,
                history=[],
                sys_prompt=system_prompt,
            )   # 带超时倒计时
            if _is_summary_response_too_weak(gpt_say):
                gpt_say = _build_local_fallback_summary(os.path.basename(fp), file_content)
        chatbot[-1] = (i_say_show_user, gpt_say)
        history.append(i_say_show_user); history.append(gpt_say)
        yield from update_ui(chatbot=chatbot, history=history, msg=msg) # 刷新界面
        time.sleep(2)

    all_file = ', '.join([os.path.basename(fp) for index, fp in enumerate(file_manifest)])
    i_say = f'根据以上你自己的分析，对全文进行概括，用学术性语言写一段中文摘要，然后再写一段英文摘要（包括{all_file}）。'
    chatbot.append((i_say, "正在生成全文摘要，请稍候。"))
    yield from update_ui(chatbot=chatbot, history=history) # 刷新界面

    msg = '正常'
    # ** gpt request **
    gpt_say = yield from request_gpt_model_in_new_thread_with_ui_alive(
        i_say,
        i_say,
        llm_kwargs,
        chatbot,
        history=history,
        sys_prompt=system_prompt,
    )   # 带超时倒计时
    if _is_summary_response_too_weak(gpt_say):
        stitched = "\n".join(str(item) for item in summary_snippets if str(item).strip())
        gpt_say = _build_local_fallback_summary("全文", stitched)

    chatbot[-1] = (i_say, gpt_say)
    history.append(i_say); history.append(gpt_say)
    yield from update_ui(chatbot=chatbot, history=history, msg=msg) # 刷新界面
    res = write_history_to_file(history)
    promote_file_to_downloadzone(res, chatbot=chatbot)
    chatbot.append(("任务状态", "摘要已生成，可在下方下载报告。"))
    yield from update_ui(chatbot=chatbot, history=history, msg=msg) # 刷新界面



@CatchException
def Paper_Abstract_Writer(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    history = []    # 清空历史，以免输入溢出
    import glob, os
    if os.path.exists(txt):
        project_folder = txt
    else:
        if txt == "": txt = '空空如也的输入栏'
        report_exception(chatbot, history, a = f"解析项目: {txt}", b = f"找不到本地项目或无权访问: {txt}")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.tex', recursive=True)] # + \
                    # [f for f in glob.glob(f'{project_folder}/**/*.cpp', recursive=True)] + \
                    # [f for f in glob.glob(f'{project_folder}/**/*.c', recursive=True)]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a = f"解析项目: {txt}", b = f"找不到任何.tex文件: {txt}")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 解析Paper(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt)
