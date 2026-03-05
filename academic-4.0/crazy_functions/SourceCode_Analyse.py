from toolbox import update_ui, promote_file_to_downloadzone
from toolbox import CatchException, report_exception, write_history_to_file
from shared_utils.fastapi_server import validate_path_safety
from crazy_functions.crazy_utils import input_clipping


def _compress_plain_text(text):
    import re

    value = str(text or "")
    if not value:
        return ""
    value = value.replace("\r", "\n")
    value = re.sub(r"```[\s\S]*?```", " ", value)
    value = re.sub(r"`([^`]*)`", r"\1", value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"\1", value)
    value = re.sub(r"\*([^*\n]+)\*", r"\1", value)
    # 清理 Markdown 表格残片，避免“程序整体功能概括”混入表格内容。
    value = re.sub(r"^\s*\|.*$", " ", value, flags=re.MULTILINE)
    value = re.sub(r"\|\s*文件路径\s*\|\s*功能描述\s*\|?", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"\|\s*:?-{2,}:?\s*\|\s*:?-{2,}:?\s*\|?", " ", value)
    value = value.replace("|", " ")
    value = re.sub(r"<[^>]+>", " ", value)
    lines = []
    for line in value.splitlines():
        current = re.sub(r"^\s*[-*#>\d\.\)\(]+\s*", "", str(line or "").strip())
        if current:
            lines.append(current)
    value = " ".join(lines)
    value = re.sub(r"(?:^|\s)正在开始汇总[。:：]?\s*", " ", value)
    value = re.sub(r"(?:^|\s)程序整体功能概括[。:：]?\s*", " ", value)
    value = re.sub(r"（\s*）", " ", value)
    value = re.sub(r"(?<=\s)\(\s*\)(?=\s)", " ", value)
    value = re.sub(r"\s+([，。！？；：,.;:!?])", r"\1", value)
    value = re.sub(r"([（(\[{【])\s+", r"\1", value)
    value = re.sub(r"\s+([）)\]}】])", r"\1", value)
    value = re.sub(r"\b该文件\s+是\b", "该文件是", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def _pick_short_summary_line(text):
    import re

    value = _compress_plain_text(text)
    value = re.sub(r"\s*(?:文件路径|功能描述)\s*", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    if not value:
        return "功能说明待补充。"

    split_pattern = r"(?<=[。！？])\s*|(?<=[.!?；;])\s+(?=(?:[\"'“‘(\[]\s*)?[A-Z\u4E00-\u9FFF])"
    parts = [p.strip() for p in re.split(split_pattern, value) if p.strip()]
    if not parts:
        parts = [value]

    chosen = []
    total = 0
    max_chars = 360
    for part in parts:
        sentence = part
        if not re.search(r"[。！？.!?]$", sentence):
            sentence += "。"
        sentence = sentence.strip()
        next_total = total + len(sentence)
        if chosen and next_total > max_chars:
            break
        chosen.append(sentence)
        total = next_total
        if len(chosen) >= 3:
            break

    if not chosen:
        candidate = value[:max_chars].rstrip("，,;；。.!?？!") + "。"
        return candidate

    candidate = " ".join(chosen).strip()
    candidate = re.sub(r"([。！？])\s+", r"\1", candidate)
    if len(candidate) > max_chars:
        candidate = candidate[:max_chars].rstrip("，,;；。.!?？!") + "。"
    return candidate


def _escape_table_cell(value):
    cell = str(value or "").replace("\n", " ").strip()
    cell = cell.replace("|", "｜")
    return cell


def _format_summary_path(path_item):
    import re

    path_text = str(path_item or "").replace("\\", "/").lstrip("./")
    path_text = re.sub(r"^[^/]+\.zip\.extract/", "", path_text)
    path_text = path_text.replace(".zip.extract/", "/")
    path_text = re.sub(r"/{2,}", "/", path_text)
    return path_text or str(path_item or "")


def _build_summary_table(file_paths, per_file_analysis):
    rows = ["| 文件路径 | 功能描述 |", "| --- | --- |"]
    for path_item, analysis in zip(file_paths, per_file_analysis):
        desc = _pick_short_summary_line(analysis)
        display_path = _format_summary_path(path_item)
        rows.append(f"| `{_escape_table_cell(display_path)}` | {_escape_table_cell(desc)} |")
    return "\n".join(rows)


def _resolve_project_folder(txt, chatbot, history, title="解析项目"):
    import os
    raw = txt
    if not os.path.exists(raw):
        if raw == "":
            raw = '空空如也的输入栏'
        report_exception(chatbot, history, a=title, b="找不到本地项目或无权访问。")
        return None

    project_folder = raw
    if os.path.isfile(project_folder):
        extracted_dir = f"{project_folder}.extract"
        if os.path.isdir(extracted_dir):
            project_folder = extracted_dir
        else:
            project_folder = os.path.dirname(project_folder)

    validate_path_safety(project_folder, chatbot.get_user())
    return project_folder


def _find_preferred_extract_dir(project_folder):
    import glob
    import os

    candidates = sorted(
        [f for f in glob.glob(f'{project_folder}/*') if os.path.isdir(f) and f.endswith('.extract')]
    )
    return candidates[0] if candidates else project_folder


def 解析源代码新(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt):
    import os, copy
    from crazy_functions.crazy_utils import request_gpt_model_multi_threads_with_very_awesome_ui_and_high_efficiency
    from crazy_functions.crazy_utils import request_gpt_model_in_new_thread_with_ui_alive

    summary_batch_isolation = True
    inputs_array = []
    inputs_show_user_array = []
    history_array = []
    sys_prompt_array = []
    report_part_1 = []

    assert len(file_manifest) <= 512, "源文件太多（超过512个）, 请缩减输入文件的数量。或者，您也可以选择删除此行警告，并修改代码拆分file_manifest列表，从而实现分批次处理。"
    ############################## <第一步，逐个文件分析，多线程> ##################################
    for index, fp in enumerate(file_manifest):
        # 读取文件
        with open(fp, 'r', encoding='utf-8', errors='replace') as f:
            file_content = f.read()
        prefix = "接下来请你逐文件分析下面的工程" if index==0 else ""
        i_say = prefix + f'请对下面的程序文件做一个概述文件名是{os.path.relpath(fp, project_folder)}，文件代码是 ```{file_content}```'
        i_say_show_user = prefix + f'[{index+1}/{len(file_manifest)}] 请对下面的程序文件做一个概述: {os.path.relpath(fp, project_folder)}'
        # 装载请求内容
        inputs_array.append(i_say)
        inputs_show_user_array.append(i_say_show_user)
        history_array.append([])
        sys_prompt_array.append(
            "你是一个程序架构分析师。请用中文输出，保留文件职责、关键函数与核心输入输出，使用2-4句简洁说明。"
        )

    # 文件读取完成，对每一个源代码文件，生成一个请求线程，发送到chatgpt进行分析
    gpt_response_collection = yield from request_gpt_model_multi_threads_with_very_awesome_ui_and_high_efficiency(
        inputs_array = inputs_array,
        inputs_show_user_array = inputs_show_user_array,
        history_array = history_array,
        sys_prompt_array = sys_prompt_array,
        llm_kwargs = llm_kwargs,
        chatbot = chatbot,
        show_user_at_complete = True
    )

    # 全部文件解析完成，结果写入文件，准备对工程源代码进行汇总分析
    report_part_1 = copy.deepcopy(gpt_response_collection)
    history_to_return = report_part_1
    res = write_history_to_file(report_part_1)
    promote_file_to_downloadzone(res, chatbot=chatbot)
    chatbot.append(("完成？", "逐个文件分析已完成。" + res))
    yield from update_ui(chatbot=chatbot, history=history_to_return) # 刷新界面

    ############################## <第二步，综合，单线程，分组+迭代处理> ##################################
    batchsize = 16  # 10个文件为一组
    report_part_2 = []
    previous_iteration_files = []
    last_iteration_result = ""
    while True:
        if len(file_manifest) == 0: break
        this_iteration_file_manifest = file_manifest[:batchsize]
        this_iteration_gpt_response_collection = gpt_response_collection[:batchsize*2]
        file_rel_path = [os.path.relpath(fp, project_folder) for index, fp in enumerate(this_iteration_file_manifest)]
        # 把“请对下面的程序文件做一个概述” 替换成 精简的 "文件名：{all_file[index]}"
        for index, content in enumerate(this_iteration_gpt_response_collection):
            if index%2==0: this_iteration_gpt_response_collection[index] = f"{file_rel_path[index//2]}" # 只保留文件名节省token
        this_iteration_files = [os.path.relpath(fp, project_folder) for index, fp in enumerate(this_iteration_file_manifest)]
        previous_iteration_files.extend(this_iteration_files)
        previous_iteration_files_string = ', '.join(previous_iteration_files)
        current_iteration_focus = ', '.join(this_iteration_files)
        if summary_batch_isolation: focus = current_iteration_focus
        else:                       focus = previous_iteration_files_string
        # 汇总表格由后端固定拼装，避免模型输出破坏 Markdown 表格结构。
        i_say = f'请基于以下文件分析，用一句话概括程序整体功能：{focus}。'
        if last_iteration_result != "":
            sys_prompt_additional = "已知某些代码的局部作用是:" + last_iteration_result + "\n请继续分析其他源代码，从而更全面地理解项目的整体功能。"
        else:
            sys_prompt_additional = ""
        inputs_show_user = f'根据以上分析，对程序的整体功能和构架重新做出概括，由于输入长度限制，可能需要分组处理，本组文件为 {current_iteration_focus} + 已经汇总的文件组。'
        this_iteration_history = copy.deepcopy(this_iteration_gpt_response_collection)
        this_iteration_history.append(last_iteration_result)
        # 裁剪input
        inputs, this_iteration_history_feed = input_clipping(inputs=i_say, history=this_iteration_history, max_token_limit=2560)
        summary_raw = yield from request_gpt_model_in_new_thread_with_ui_alive(
            inputs=inputs,
            inputs_show_user="正在生成程序整体功能概括，请稍候。",
            llm_kwargs=llm_kwargs,
            chatbot=chatbot,
            history=this_iteration_history_feed,
            sys_prompt="你是一个程序架构分析师，正在分析一个项目的源代码。" + sys_prompt_additional)

        this_iteration_analysis = [
            this_iteration_gpt_response_collection[idx]
            for idx in range(1, len(this_iteration_gpt_response_collection), 2)
        ]
        table_markdown = _build_summary_table(this_iteration_files, this_iteration_analysis)
        summary_line = _pick_short_summary_line(summary_raw)
        result = f"{table_markdown}\n\n程序整体功能概括：{summary_line}"
        chatbot[-1] = [inputs_show_user, result]
        yield from update_ui(chatbot=chatbot, history=history_to_return)

        report_part_2.extend([i_say, result])
        last_iteration_result = summary_line
        file_manifest = file_manifest[batchsize:]
        gpt_response_collection = gpt_response_collection[batchsize*2:]

    ############################## <END> ##################################
    history_to_return.extend(report_part_2)
    res = write_history_to_file(history_to_return)
    promote_file_to_downloadzone(res, chatbot=chatbot)
    chatbot.append(("完成了吗？", res))
    yield from update_ui(chatbot=chatbot, history=history_to_return) # 刷新界面

def make_diagram(this_iteration_files, result, this_iteration_history_feed):
    from crazy_functions.diagram_fns.file_tree import build_file_tree_mermaid_diagram
    return build_file_tree_mermaid_diagram(this_iteration_history_feed[0::2], this_iteration_history_feed[1::2], "项目示意图")

@CatchException
def 解析项目本身(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    history = []    # 清空历史，以免输入溢出
    import glob
    file_manifest = [f for f in glob.glob('./*.py')] + \
                    [f for f in glob.glob('./*/*.py')]
    project_folder = './'
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a = "解析项目", b = "未检测到任何 Python 源码文件（.py）。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 解析源代码新(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt)

@CatchException
def 解析一个Python项目(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    history = []    # 清空历史，以免输入溢出
    import glob
    project_folder = _resolve_project_folder(txt, chatbot, history, title="解析项目")
    if project_folder is None:
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.py', recursive=True)]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a = "解析项目", b = "未检测到任何 Python 源码文件（.py）。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 解析源代码新(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt)

@CatchException
def 解析一个Matlab项目(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    history = []    # 清空历史，以免输入溢出
    import glob
    project_folder = _resolve_project_folder(txt, chatbot, history, title="解析Matlab项目")
    if project_folder is None:
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.m', recursive=True)]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a = "解析Matlab项目", b = "未检测到任何 Matlab 源码文件（.m）。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 解析源代码新(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt)

@CatchException
def 解析一个C项目的头文件(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    history = []    # 清空历史，以免输入溢出
    import glob
    project_folder = _resolve_project_folder(txt, chatbot, history, title="解析项目")
    if project_folder is None:
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.h', recursive=True)]  + \
                    [f for f in glob.glob(f'{project_folder}/**/*.hpp', recursive=True)] #+ \
                    # [f for f in glob.glob(f'{project_folder}/**/*.c', recursive=True)]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a = "解析项目", b = "未检测到任何 C/C++ 头文件（.h/.hpp）。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 解析源代码新(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt)

@CatchException
def 解析一个C项目(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    history = []    # 清空历史，以免输入溢出
    import glob
    project_folder = _resolve_project_folder(txt, chatbot, history, title="解析项目")
    if project_folder is None:
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.h', recursive=True)]  + \
                    [f for f in glob.glob(f'{project_folder}/**/*.cpp', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.hpp', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.c', recursive=True)]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a = "解析项目", b = "未检测到任何 C/C++ 源码文件（.c/.cpp/.h/.hpp）。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 解析源代码新(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt)


@CatchException
def 解析一个Java项目(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    history = []  # 清空历史，以免输入溢出
    import glob
    project_folder = _resolve_project_folder(txt, chatbot, history, title="解析项目")
    if project_folder is None:
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.java', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.jar', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.xml', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.sh', recursive=True)]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a="解析项目", b="未检测到任何 Java 相关文件（.java/.jar/.xml/.sh）。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 解析源代码新(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt)


@CatchException
def 解析一个前端项目(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    history = []  # 清空历史，以免输入溢出
    import glob
    project_folder = _resolve_project_folder(txt, chatbot, history, title="解析项目")
    if project_folder is None:
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.ts', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.tsx', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.json', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.js', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.vue', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.less', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.sass', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.wxml', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.wxss', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.css', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.jsx', recursive=True)]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a="解析项目", b="未检测到任何前端相关文件。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 解析源代码新(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt)


@CatchException
def 解析一个Golang项目(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    history = []  # 清空历史，以免输入溢出
    import glob
    project_folder = _resolve_project_folder(txt, chatbot, history, title="解析项目")
    if project_folder is None:
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.go', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/go.mod', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/go.sum', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/go.work', recursive=True)]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a="解析项目", b="未检测到任何 Golang 源码文件（.go/go.mod/go.sum/go.work）。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 解析源代码新(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt)

@CatchException
def 解析一个Rust项目(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    history = []  # 清空历史，以免输入溢出
    import glob
    project_folder = _resolve_project_folder(txt, chatbot, history, title="解析项目")
    if project_folder is None:
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.rs', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.toml', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.lock', recursive=True)]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a="解析项目", b="未检测到任何 Rust 源码文件（.rs/.toml/.lock）。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 解析源代码新(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt)

@CatchException
def 解析一个Lua项目(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    history = []    # 清空历史，以免输入溢出
    import glob
    project_folder = _resolve_project_folder(txt, chatbot, history, title="解析项目")
    if project_folder is None:
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.lua', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.xml', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.json', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.toml', recursive=True)]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a = "解析项目", b = "未检测到任何 Lua 相关文件（.lua/.xml/.json/.toml）。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 解析源代码新(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt)


@CatchException
def 解析一个CSharp项目(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    history = []    # 清空历史，以免输入溢出
    import glob
    project_folder = _resolve_project_folder(txt, chatbot, history, title="解析项目")
    if project_folder is None:
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.cs', recursive=True)] + \
                    [f for f in glob.glob(f'{project_folder}/**/*.csproj', recursive=True)]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a = "解析项目", b = "未检测到任何 C# 相关文件（.cs/.csproj）。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 解析源代码新(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt)


@CatchException
def 解析任意code项目(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    txt_pattern = str(plugin_kwargs.get("advanced_arg") or "")
    txt_pattern = txt_pattern.replace("，", ",")

    tokens = [_.strip() for _ in txt_pattern.split(",") if _.strip() != ""]
    include_tokens = []
    exclude_tokens = []
    for token in tokens:
        if token.startswith("^"):
            exclude_tokens.append(token[1:].strip())
        else:
            include_tokens.append(token)

    def normalize_glob_pattern(pattern):
        p = str(pattern or "").strip()
        if not p:
            return p
        # 兼容输入“.py/.go/.rs”这类简写，自动转为“*.py/*.go/*.rs”。
        if p.startswith(".") and "*" not in p and "/" not in p and "\\" not in p:
            return f"*{p}"
        return p

    # 将要匹配的模式(例如: *.c, *.cpp, *.py, config.toml)
    pattern_include = [normalize_glob_pattern(p) for p in include_tokens]
    if not pattern_include:
        pattern_include = ["*"] # 不输入即全部匹配

    # 将要忽略匹配的文件后缀(例如: ^*.c, ^*.cpp, ^*.py)
    pattern_except_suffix = []
    for token in exclude_tokens:
        normalized = normalize_glob_pattern(token)
        if normalized.startswith("*.") or normalized.startswith("."):
            pattern_except_suffix.append(normalized.lstrip("*."))
    pattern_except_suffix += ['zip', 'rar', '7z', 'tar', 'gz'] # 避免解析压缩文件

    # 将要忽略匹配的文件名(例如: ^README.md)
    pattern_except_name = [_.strip().lstrip("*,").replace(".", r"\.")
                           for _ in exclude_tokens
                           if not _.strip().startswith("*.") and not _.strip().startswith(".")
                           ]
    # 生成正则表达式
    pattern_except = r'/[^/]+\.(' + "|".join(pattern_except_suffix) + ')$'
    pattern_except += '|/(' + "|".join(pattern_except_name) + ')$' if pattern_except_name != [] else ''

    history.clear()
    import glob, os, re
    project_folder = _resolve_project_folder(txt, chatbot, history, title="解析项目")
    if project_folder is None:
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    # 若上传压缩文件, 先寻找到解压的文件夹路径, 从而避免解析压缩文件
    extract_folder_path = _find_preferred_extract_dir(project_folder)
    # 按输入的匹配模式寻找上传的非压缩文件和已解压的文件
    file_manifest = [f for pattern in pattern_include for f in glob.glob(f'{extract_folder_path}/**/{pattern}', recursive=True) if "" != extract_folder_path and \
                      os.path.isfile(f) and (not re.search(pattern_except, f) or pattern.endswith('.' + re.search(pattern_except, f).group().split('.')[-1]))]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a = "解析项目", b = "未检测到符合规则的文件。请确认压缩包内包含目标文件类型。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 解析源代码新(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt)
