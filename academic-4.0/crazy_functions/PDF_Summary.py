from loguru import logger
import re

from toolbox import update_ui, promote_file_to_downloadzone, gen_time_str
from toolbox import CatchException, report_exception
from toolbox import write_history_to_file, promote_file_to_downloadzone
from crazy_functions.crazy_utils import request_gpt_model_in_new_thread_with_ui_alive
from crazy_functions.crazy_utils import read_and_clean_pdf_text
from crazy_functions.crazy_utils import input_clipping


def normalize_summary_markdown(text: str) -> str:
    value = str(text or "").replace("\r\n", "\n").strip()
    if not value:
        return ""
    has_structure = re.search(r"(?m)^\s{0,3}(?:#{1,6}\s+|[-*]\s+|\d+\.\s+|>\s+|\|.+\|)", value)
    if not has_structure and len(value) > 180:
        parts = [item.strip() for item in re.split(r"(?<=[。！？.!?])\s*", value) if item.strip()]
        if len(parts) >= 2:
            value = "## 核心摘要\n\n" + "\n".join([f"- {item}" for item in parts])
    value = re.sub(r"\n{4,}", "\n\n\n", value)
    return value



def 解析PDF(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt):
    file_write_buffer = []
    for file_name in file_manifest:
        logger.info('begin analysis on:', file_name)
        ############################## <第 0 步，切割PDF> ##################################
        # 递归地切割PDF文件，每一块（尽量是完整的一个section，比如introduction，experiment等，必要时再进行切割）
        # 的长度必须小于 2500 个 Token
        file_content, page_one = read_and_clean_pdf_text(file_name) # （尝试）按照章节切割PDF
        file_content = file_content.encode('utf-8', 'ignore').decode()   # avoid reading non-utf8 chars
        page_one = str(page_one).encode('utf-8', 'ignore').decode()  # avoid reading non-utf8 chars

        TOKEN_LIMIT_PER_FRAGMENT = 2500

        from crazy_functions.pdf_fns.breakdown_txt import breakdown_text_to_satisfy_token_limit
        paper_fragments = breakdown_text_to_satisfy_token_limit(txt=file_content,  limit=TOKEN_LIMIT_PER_FRAGMENT, llm_model=llm_kwargs['llm_model'])
        page_one_fragments = breakdown_text_to_satisfy_token_limit(txt=str(page_one), limit=TOKEN_LIMIT_PER_FRAGMENT//4, llm_model=llm_kwargs['llm_model'])
        # 为了更好的效果，我们剥离Introduction之后的部分（如果有）
        paper_meta = page_one_fragments[0].split('introduction')[0].split('Introduction')[0].split('INTRODUCTION')[0]

        ############################## <第 1 步，从摘要中提取高价值信息，放到history中> ##################################
        final_results = []
        final_results.append(paper_meta)

        ############################## <第 2 步，迭代地历遍整个文章，提取精炼信息> ##################################
        i_say_show_user = f'首先你在中文语境下通读整篇论文。'; gpt_say = "收到，开始分析。"           # 用户提示
        chatbot.append([i_say_show_user, gpt_say]); yield from update_ui(chatbot=chatbot, history=[])    # 更新UI

        iteration_results = []
        last_iteration_result = paper_meta  # 初始值是摘要
        MAX_WORD_TOTAL = 4096 * 0.7
        n_fragment = len(paper_fragments)
        if n_fragment >= 20: logger.warning('文章极长，不能达到预期效果')
        for i in range(n_fragment):
            NUM_OF_WORD = MAX_WORD_TOTAL // n_fragment
            i_say = (
                f"请阅读以下论文片段，并输出结构化摘要（中文，最多{NUM_OF_WORD}字）。\n"
                "要求：\n"
                "1. 仅使用Markdown列表，不要使用表格。\n"
                "2. 每个要点独占一行，不要输出单段超长文本。\n"
                "3. 重点覆盖：本段主题、方法/实验、结论。\n\n"
                f"论文片段：```{paper_fragments[i]}```"
            )
            i_say_show_user = f"[{i+1}/{n_fragment}] 正在总结第{i+1}个片段"
            gpt_say = yield from request_gpt_model_in_new_thread_with_ui_alive(i_say, i_say_show_user,  # i_say=真正给chatgpt的提问， i_say_show_user=给用户看的提问
                                                                                llm_kwargs, chatbot,
                                                                                history=["The main idea of the previous section is?", last_iteration_result], # 迭代上一次的结果
                                                                                sys_prompt="Extract the main idea of this section with Chinese."  # 提示
                                                                                )
            gpt_say = normalize_summary_markdown(gpt_say)
            chatbot[-1] = (i_say_show_user, gpt_say)
            yield from update_ui(chatbot=chatbot, history=[])
            iteration_results.append(gpt_say)
            last_iteration_result = gpt_say

        ############################## <第 3 步，整理history，提取总结> ##################################
        final_results.extend(iteration_results)
        final_results.append(f'Please conclude this paper discussed above。')
        # This prompt is from https://github.com/kaixindelele/ChatPaper/blob/main/chat_paper.py
        NUM_OF_WORD = 1000
        i_say = """
请输出结构化Markdown总结，禁止使用Markdown表格。
严格按照以下结构输出，并保证每个小节之间有空行：

## 论文信息
- 标题（中文+英文）：
- 作者（英文）：
- 第一作者单位（中文）：
- 关键词（英文）：
- 链接（论文链接/GitHub，没有则写None）：

## 研究背景
- 要点1：
- 要点2：

## 方法与创新
- 要点1：
- 要点2：

## 实验与结果
- 任务：
- 关键指标：
- 结论：

## 局限与建议
- 局限：
- 后续建议：

要求：
1. 全文中文表达（专有名词可保留英文）。
2. 不要输出单段超长文本；每条要点独占一行。
3. 不要重复，不要输出插件说明，不要输出路径信息。
"""
        # This prompt is from https://github.com/kaixindelele/ChatPaper/blob/main/chat_paper.py
        file_write_buffer.extend(final_results)
        i_say, final_results = input_clipping(i_say, final_results, max_token_limit=2000)
        gpt_say = yield from request_gpt_model_in_new_thread_with_ui_alive(
            inputs=i_say, inputs_show_user='开始最终总结',
            llm_kwargs=llm_kwargs, chatbot=chatbot, history=final_results,
            sys_prompt= f"Extract the main idea of this paper with less than {NUM_OF_WORD} Chinese characters"
        )
        gpt_say = normalize_summary_markdown(gpt_say)
        chatbot[-1] = ('开始最终总结', gpt_say)
        final_results.append(gpt_say)
        file_write_buffer.extend([i_say, gpt_say])
        ############################## <第 4 步，设置一个token上限> ##################################
        _, final_results = input_clipping("", final_results, max_token_limit=3200)
        yield from update_ui(chatbot=chatbot, history=final_results) # 注意这里的历史记录被替代了

    res = write_history_to_file(file_write_buffer)
    promote_file_to_downloadzone(res, chatbot=chatbot)
    yield from update_ui(chatbot=chatbot, history=final_results) # 刷新界面


@CatchException
def PDF_Summary(txt, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt, user_request):
    import glob, os

    # 尝试导入依赖，如果缺少依赖，则给出安装建议
    try:
        import fitz
    except:
        report_exception(chatbot, history,
            a = f"解析项目: {txt}",
            b = f"导入软件依赖失败。使用该模块需要额外依赖，安装方法```pip install --upgrade pymupdf```。")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return

    # 清空历史，以免输入溢出
    history = []

    # 检测输入参数，如没有给定输入参数，直接退出
    if os.path.exists(txt):
        project_folder = txt
    else:
        if txt == "": txt = '空空如也的输入栏'
        report_exception(chatbot, history, a = f"解析项目: {txt}", b = f"找不到本地项目或无权访问: {txt}")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return

    # 搜索需要处理的文件清单
    file_manifest = [f for f in glob.glob(f'{project_folder}/**/*.pdf', recursive=True)]

    # 如果没找到任何文件
    if len(file_manifest) == 0:
        report_exception(chatbot, history, a = f"解析项目: {txt}", b = f"找不到任何.tex或.pdf文件: {txt}")
        yield from update_ui(chatbot=chatbot, history=history) # 刷新界面
        return

    # 开始正式执行任务
    yield from 解析PDF(file_manifest, project_folder, llm_kwargs, plugin_kwargs, chatbot, history, system_prompt)
