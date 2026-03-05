from toolbox import update_ui, trimmed_format_exc, promote_file_to_downloadzone, get_log_folder
from toolbox import CatchException, report_exception, write_history_to_file, zip_folder
from loguru import logger

class PaperFileGroup():
    def __init__(self):
        self.file_paths = []
        self.file_contents = []
        self.sp_file_contents = []
        self.sp_file_index = []
        self.sp_file_tag = []

        # count_token
        from request_llms.bridge_all import model_info
        enc = model_info["gpt-3.5-turbo"]['tokenizer']
        def get_token_num(txt): return len(enc.encode(txt, disallowed_special=()))
        self.get_token_num = get_token_num

    def run_file_split(self, max_token_limit=1900):
        """
        将长文本分离开来
        """
        for index, file_content in enumerate(self.file_contents):
            if self.get_token_num(file_content) < max_token_limit:
                self.sp_file_contents.append(file_content)
                self.sp_file_index.append(index)
                self.sp_file_tag.append(self.file_paths[index])
            else:
                from crazy_functions.pdf_fns.breakdown_txt import breakdown_text_to_satisfy_token_limit
                segments = breakdown_text_to_satisfy_token_limit(file_content, max_token_limit)
                for j, segment in enumerate(segments):
                    self.sp_file_contents.append(segment)
                    self.sp_file_index.append(index)
                    self.sp_file_tag.append(self.file_paths[index] + f".part-{j}.tex")

        logger.info('Segmentation: done')
    def merge_result(self):
        self.file_result = ["" for _ in range(len(self.file_paths))]
        for r, k in zip(self.sp_file_result, self.sp_file_index):
            self.file_result[k] += r

    def write_result(self):
        manifest = []
        for path, res in zip(self.file_paths, self.file_result):
            with open(path + '.polish.tex', 'w', encoding='utf8') as f:
                manifest.append(path + '.polish.tex')
                f.write(res)
        return manifest

    def zip_result(self):
        import os, time
        folder = os.path.dirname(self.file_paths[0])
        t = time.strftime("%Y-%m-%d-%H-%M-%S", time.localtime())
        zip_folder(folder, get_log_folder(), f'{t}-polished.zip')


def 多文件润色(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, language='en', mode='polish'):
    import time, os, re
    from crazy_functions.crazy_utils import request_gpt_model_multi_threads_with_very_awesome_ui_and_high_efficiency

    def should_passthrough_fragment(fragment: str) -> bool:
        value = str(fragment or "")
        if not value.strip():
            return True
        put_hits = len(re.findall(r"\\put\s*\(", value))
        draw_hits = len(re.findall(r"\\(?:fontsize|usefont|selectfont|color|definecolor)\b", value))
        latex_cmd_hits = len(re.findall(r"\\[a-zA-Z@]+", value))
        digit_hits = len(re.findall(r"\d", value))
        punct_hits = len(re.findall(r"[{}[\]()\\,.;:_-]", value))
        total_len = max(1, len(value))
        symbol_ratio = (digit_hits + punct_hits) / total_len
        plain = re.sub(r"\\[a-zA-Z@]+(?:\*?)?(?:\s*\[[^\]]*\])?(?:\s*\{[^{}]*\})?", " ", value)
        plain = re.sub(r"\\.", " ", plain)
        plain = re.sub(r"[\d{}[\]()\\,.;:_\-*/|<>=%$^~`]+", " ", plain)
        plain_words = re.findall(r"[A-Za-z\u4e00-\u9fff]{3,}", plain)
        plain_word_count = len(plain_words)
        plain_char_count = sum(len(item) for item in plain_words)
        if put_hits >= 2 and draw_hits >= 2 and plain_word_count <= 18:
            return True
        if latex_cmd_hits >= 16 and plain_word_count <= 22:
            return True
        if symbol_ratio > 0.48 and plain_word_count <= 24:
            return True
        if put_hits >= 1 and latex_cmd_hits >= 8 and plain_char_count < 36:
            return True
        return False


    #  <-------- 读取Latex文件，删除其中的所有注释 ---------->
    pfg = PaperFileGroup()

    for index, fp in enumerate(file_manifest):
        with open(fp, 'r', encoding='utf-8', errors='replace') as f:
            file_content = f.read()
            # 定义注释的正则表达式
            comment_pattern = r'(?<!\\)%.*'
            # 使用正则表达式查找注释，并替换为空字符串
            clean_tex_content = re.sub(comment_pattern, '', file_content)
            # 记录删除注释后的文本
            pfg.file_paths.append(fp)
            pfg.file_contents.append(clean_tex_content)

    #  <-------- 拆分过长的latex文件 ---------->
    pfg.run_file_split(max_token_limit=1024)
    n_split = len(pfg.sp_file_contents)


    #  <-------- 多线程润色开始 ---------->
    if language == 'en':
        if mode == 'polish':
            inputs_array = [r"Below is a section from an academic paper, polish this section to meet the academic standard, " +
                            r"improve the grammar, clarity and overall readability, do not modify any latex command such as \section, \cite and equations:" +
                            f"\n\n{frag}" for frag in pfg.sp_file_contents]
        else:
            inputs_array = [r"Below is a section from an academic paper, proofread this section." +
                            r"Do not modify any latex command such as \section, \cite, \begin, \item and equations. " +
                            r"Answer me only with the revised text:" +
                        f"\n\n{frag}" for frag in pfg.sp_file_contents]
        inputs_show_user_array = [f"Polish {os.path.basename(f)}" for f in pfg.sp_file_tag]
        sys_prompt_array = ["You are a professional academic paper writer." for _ in range(n_split)]
    elif language == 'zh':
        if mode == 'polish':
            inputs_array = [r"以下是一篇学术论文中的一段内容，请将此部分润色以满足学术标准，提高语法、清晰度和整体可读性，不要修改任何LaTeX命令，例如\section，\cite和方程式：" +
                            f"\n\n{frag}" for frag in pfg.sp_file_contents]
        else:
            inputs_array = [r"以下是一篇学术论文中的一段内容，请对这部分内容进行语法矫正。不要修改任何LaTeX命令，例如\section，\cite和方程式：" +
                            f"\n\n{frag}" for frag in pfg.sp_file_contents]
        inputs_show_user_array = [f"润色 {os.path.basename(f)}" for f in pfg.sp_file_tag]
        sys_prompt_array=["你是一位专业的中文学术论文作家。" for _ in range(n_split)]


    executable_indexes = [idx for idx, frag in enumerate(pfg.sp_file_contents) if not should_passthrough_fragment(frag)]
    executable_set = set(executable_indexes)
    passthrough_indexes = [idx for idx in range(n_split) if idx not in executable_set]
    gpt_response_collection = []
    pfg.sp_file_result = ["" for _ in range(n_split)]
    for idx in passthrough_indexes:
        pfg.sp_file_result[idx] = pfg.sp_file_contents[idx]

    if executable_indexes:
        gpt_response_collection = yield from request_gpt_model_multi_threads_with_very_awesome_ui_and_high_efficiency(
            inputs_array=[inputs_array[idx] for idx in executable_indexes],
            inputs_show_user_array=[inputs_show_user_array[idx] for idx in executable_indexes],
            llm_kwargs=llm_kwargs,
            chatbot=chatbot,
            history_array=[[""] for _ in range(len(executable_indexes))],
            sys_prompt_array=[sys_prompt_array[idx] for idx in executable_indexes],
            # max_workers=5,  # 并行任务数量限制，最多同时执行5个，其他的排队等待
            scroller_max_len = 80,
            compact_progress=True,
        )
        for slot_idx, gpt_say in zip(executable_indexes, gpt_response_collection[1::2]):
            pfg.sp_file_result[slot_idx] = gpt_say
    else:
        chatbot.append(("任务状态", "检测到当前文档以排版指令为主，已跳过不必要的模型处理。"))
        yield from update_ui(chatbot=chatbot, history=history)

    #  <-------- 文本碎片重组为完整的tex文件，整理结果为压缩包 ---------->
    try:
        for idx, value in enumerate(pfg.sp_file_result):
            if not value:
                pfg.sp_file_result[idx] = pfg.sp_file_contents[idx]
        pfg.merge_result()
        pfg.write_result()
        pfg.zip_result()
    except:
        logger.error(trimmed_format_exc())

    #  <-------- 整理结果，退出 ---------->
    create_report_file_name = time.strftime("%Y-%m-%d-%H-%M-%S", time.localtime()) + f"-chatgpt.polish.md"
    res = write_history_to_file(gpt_response_collection, file_basename=create_report_file_name)
    promote_file_to_downloadzone(res, chatbot=chatbot)

    history = gpt_response_collection if gpt_response_collection else ["任务状态", "已完成文档处理并生成下载文件。"]
    chatbot.append(("任务状态", "文档处理完成，可在下方下载结果。"))
    yield from update_ui(chatbot=chatbot, history=history) # 刷新界面


@CatchException
def Latex英文润色(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    chatbot.append([
        "任务状态",
        "LaTeX 英文润色任务已开始，请稍候。"])
    yield from update_ui(chatbot=chatbot, history=history) # 刷新界面

    # 尝试导入依赖，如果缺少依赖，则给出安装建议
    try:
        import tiktoken
    except:
        report_exception(chatbot, history,
                         a="解析项目",
                         b=f"导入软件依赖失败。使用该模块需要额外依赖，安装方法```pip install --upgrade tiktoken```。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    history = []    # 清空历史，以免输入溢出
    import glob, os
    if os.path.exists(txt):
        project_folder = txt
    else:
        if txt == "": txt = '空空如也的输入栏'
        report_exception(chatbot, history, a = "解析项目", b = "找不到本地项目或无权访问。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.tex', recursive=True)]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a = "解析项目", b = "找不到任何 .tex 文件。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 多文件润色(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, language='en')






@CatchException
def Latex中文润色(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    chatbot.append([
        "任务状态",
        "LaTeX 中文润色任务已开始，请稍候。"])
    yield from update_ui(chatbot=chatbot, history=history) # 刷新界面

    # 尝试导入依赖，如果缺少依赖，则给出安装建议
    try:
        import tiktoken
    except:
        report_exception(chatbot, history,
                         a="解析项目",
                         b=f"导入软件依赖失败。使用该模块需要额外依赖，安装方法```pip install --upgrade tiktoken```。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    history = []    # 清空历史，以免输入溢出
    import glob, os
    if os.path.exists(txt):
        project_folder = txt
    else:
        if txt == "": txt = '空空如也的输入栏'
        report_exception(chatbot, history, a = "解析项目", b = "找不到本地项目或无权访问。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.tex', recursive=True)]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a = "解析项目", b = "找不到任何 .tex 文件。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 多文件润色(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, language='zh')




@CatchException
def Latex英文纠错(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    chatbot.append([
        "任务状态",
        "LaTeX 英文纠错任务已开始，请稍候。"])
    yield from update_ui(chatbot=chatbot, history=history) # 刷新界面

    # 尝试导入依赖，如果缺少依赖，则给出安装建议
    try:
        import tiktoken
    except:
        report_exception(chatbot, history,
                         a="解析项目",
                         b=f"导入软件依赖失败。使用该模块需要额外依赖，安装方法```pip install --upgrade tiktoken```。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    history = []    # 清空历史，以免输入溢出
    import glob, os
    if os.path.exists(txt):
        project_folder = txt
    else:
        if txt == "": txt = '空空如也的输入栏'
        report_exception(chatbot, history, a = "解析项目", b = "找不到本地项目或无权访问。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.tex', recursive=True)]
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a = "解析项目", b = "找不到任何 .tex 文件。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return
    yield from 多文件润色(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, language='en', mode='proofread')
