from toolbox import HotReload  # HotReload 的意思是热更新，修改函数插件后，不需要重启程序，代码直接生效
from toolbox import trimmed_format_exc
from loguru import logger

def get_crazy_functions():
    from crazy_functions.Paper_Abstract_Writer import Paper_Abstract_Writer
    from crazy_functions.Program_Comment_Gen import 批量Program_Comment_Gen
    from crazy_functions.SourceCode_Analyse import 解析项目本身
    from crazy_functions.SourceCode_Analyse import 解析一个Python项目
    from crazy_functions.SourceCode_Analyse import 解析一个Matlab项目
    from crazy_functions.SourceCode_Analyse import 解析一个C项目的头文件
    from crazy_functions.SourceCode_Analyse import 解析一个C项目
    from crazy_functions.SourceCode_Analyse import 解析一个Golang项目
    from crazy_functions.SourceCode_Analyse import 解析一个Rust项目
    from crazy_functions.SourceCode_Analyse import 解析一个Java项目
    from crazy_functions.SourceCode_Analyse import 解析一个前端项目
    from crazy_functions.SourceCode_Analyse import 解析一个Lua项目
    from crazy_functions.SourceCode_Analyse import 解析一个CSharp项目
    from crazy_functions.高级功能函数模板 import 高阶功能模板函数
    from crazy_functions.高级功能函数模板 import Demo_Wrap
    from crazy_functions.Latex_Project_Polish import Latex英文润色
    from crazy_functions.Latex_Project_Polish import Latex中文润色
    from crazy_functions.Latex_Project_Polish import Latex英文纠错
    from crazy_functions.Word_Summary import Word_Summary
    from crazy_functions.SourceCode_Analyse_JupyterNotebook import 解析ipynb文件
    from crazy_functions.Markdown_Translate import Markdown英译中
    from crazy_functions.PDF_Summary import PDF_Summary
    from crazy_functions.PDF_QA import PDF_QA标准文件输入
    from crazy_functions.PDF_Translate_Wrap import PDF_Tran
    from crazy_functions.Latex_Function import Latex英文纠错加PDF对比
    from crazy_functions.Latex_Function import Latex翻译中文并重新编译PDF
    from crazy_functions.Latex_Function_Wrap import Arxiv_Localize
    from crazy_functions.Latex_Function_Wrap import PDF_Localize
    from crazy_functions.Internet_GPT import 连接网络回答问题
    from crazy_functions.Internet_GPT_Wrap import NetworkGPT_Wrap
    from crazy_functions.Image_Generate import 图片生成_DALLE2, 图片生成_DALLE3, 图片修改_DALLE2
    from crazy_functions.Image_Generate_Wrap import ImageGen_Wrap
    from crazy_functions.SourceCode_Comment import 注释Python项目
    from crazy_functions.SourceCode_Comment_Wrap import SourceCodeComment_Wrap
    from crazy_functions.Document_Conversation import 批量文件询问
    from crazy_functions.Document_Conversation_Wrap import Document_Conversation_Wrap


    function_plugins = {
        "解析整个Python项目": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": True,
            "Info": "解析一个Python项目的所有源文件(.py) | 输入参数为路径",
            "Function": HotReload(解析一个Python项目),
        },
        "注释Python项目": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": False,
            "Info": "上传一系列python源文件(或者压缩包), 为这些代码添加docstring | 输入参数为路径",
            "Function": HotReload(注释Python项目),
            "Class": SourceCodeComment_Wrap,
        },
        "批量总结Word文档": {
            "Group": "学术",
            "Color": "stop",
            "AsButton": False,
            "Info": "批量总结word文档 | 输入参数为路径",
            "Function": HotReload(Word_Summary),
        },
        "解析整个Matlab项目": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": False,
            "Info": "解析一个Matlab项目的所有源文件(.m) | 输入参数为路径",
            "Function": HotReload(解析一个Matlab项目),
        },
        "解析整个C++项目头文件": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": False,  # 加入下拉菜单中
            "Info": "解析一个C++项目的所有头文件(.h/.hpp) | 输入参数为路径",
            "Function": HotReload(解析一个C项目的头文件),
        },
        "解析整个C++项目（.cpp/.hpp/.c/.h）": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": False,  # 加入下拉菜单中
            "Info": "解析一个C++项目的所有源文件（.cpp/.hpp/.c/.h）| 输入参数为路径",
            "Function": HotReload(解析一个C项目),
        },
        "解析整个Go项目": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": False,  # 加入下拉菜单中
            "Info": "解析一个Go项目的所有源文件 | 输入参数为路径",
            "Function": HotReload(解析一个Golang项目),
        },
        "解析整个Rust项目": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": False,  # 加入下拉菜单中
            "Info": "解析一个Rust项目的所有源文件 | 输入参数为路径",
            "Function": HotReload(解析一个Rust项目),
        },
        "解析整个Java项目": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": False,  # 加入下拉菜单中
            "Info": "解析一个Java项目的所有源文件 | 输入参数为路径",
            "Function": HotReload(解析一个Java项目),
        },
        "解析整个前端项目（js,ts,css等）": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": False,  # 加入下拉菜单中
            "Info": "解析一个前端项目的所有源文件（js,ts,css等） | 输入参数为路径",
            "Function": HotReload(解析一个前端项目),
        },
        "解析整个Lua项目": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": False,  # 加入下拉菜单中
            "Info": "解析一个Lua项目的所有源文件 | 输入参数为路径",
            "Function": HotReload(解析一个Lua项目),
        },
        "解析整个CSharp项目": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": False,  # 加入下拉菜单中
            "Info": "解析一个CSharp项目的所有源文件 | 输入参数为路径",
            "Function": HotReload(解析一个CSharp项目),
        },
        "解析Jupyter Notebook文件": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": False,
            "Info": "解析Jupyter Notebook文件 | 输入参数为路径",
            "Function": HotReload(解析ipynb文件),
            "AdvancedArgs": True,  # 调用时，唤起高级参数输入区（默认False）
            "ArgsReminder": "若输入0，则不解析notebook中的Markdown块",  # 高级参数输入区的显示提示
        },
        "读Tex论文写摘要": {
            "Group": "学术",
            "Color": "stop",
            "AsButton": False,
            "Info": "读取Tex论文并写摘要 | 输入参数为路径",
            "Function": HotReload(Paper_Abstract_Writer),
        },
        "翻译README或MD": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": True,
            "Info": "将Markdown翻译为中文 | 输入参数为路径或URL",
            "Function": HotReload(Markdown英译中),
        },
        "翻译Markdown或README（支持Github链接）": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": False,
            "Info": "将Markdown或README翻译为中文 | 输入参数为路径或URL",
            "Function": HotReload(Markdown英译中),
        },
        "批量生成函数注释": {
            "Group": "编程",
            "Color": "stop",
            "AsButton": False,  # 加入下拉菜单中
            "Info": "批量生成函数的注释 | 输入参数为路径",
            "Function": HotReload(批量Program_Comment_Gen),
        },
        "查互联网后回答": {
            "Group": "对话",
            "Color": "stop",
            "AsButton": True,  # 加入下拉菜单中
            # "Info": "连接网络回答问题（需要访问谷歌）| 输入参数是一个问题",
            "Function": HotReload(连接网络回答问题),
            "Class": NetworkGPT_Wrap     # 新一代插件需要注册Class
        },
        "历史上的今天": {
            "Group": "对话",
            "Color": "stop",
            "AsButton": False,
            "Info": "查看历史上的今天事件 (这是一个面向开发者的插件Demo) | 不需要输入参数",
            "Function": None,
            "Class": Demo_Wrap, # 新一代插件需要注册Class
        },
        "批量总结PDF文档": {
            "Group": "学术",
            "Color": "stop",
            "AsButton": False,  # 加入下拉菜单中
            "Info": "批量总结PDF文档的内容 | 输入参数为路径",
            "Function": HotReload(PDF_Summary),
        },
        "理解PDF文档内容 （模仿ChatPDF）": {
            "Group": "学术",
            "Color": "stop",
            "AsButton": False,  # 加入下拉菜单中
            "Info": "理解PDF文档的内容并进行回答 | 输入参数为路径",
            "Function": HotReload(PDF_QA标准文件输入),
        },
        "英文Latex项目全文润色（输入路径或上传压缩包）": {
            "Group": "学术",
            "Color": "stop",
            "AsButton": False,  # 加入下拉菜单中
            "Info": "对英文Latex项目全文进行润色处理 | 输入参数为路径或上传压缩包",
            "Function": HotReload(Latex英文润色),
        },

        "中文Latex项目全文润色（输入路径或上传压缩包）": {
            "Group": "学术",
            "Color": "stop",
            "AsButton": False,  # 加入下拉菜单中
            "Info": "对中文Latex项目全文进行润色处理 | 输入参数为路径或上传压缩包",
            "Function": HotReload(Latex中文润色),
        },
        # 已经被新插件取代
        # "英文Latex项目全文纠错（输入路径或上传压缩包）": {
        #     "Group": "学术",
        #     "Color": "stop",
        #     "AsButton": False,  # 加入下拉菜单中
        #     "Info": "对英文Latex项目全文进行纠错处理 | 输入参数为路径或上传压缩包",
        #     "Function": HotReload(Latex英文纠错),
        # },
        # 已经被新插件取代
        # "Latex项目全文中译英（输入路径或上传压缩包）": {
        #     "Group": "学术",
        #     "Color": "stop",
        #     "AsButton": False,  # 加入下拉菜单中
        #     "Info": "对Latex项目全文进行中译英处理 | 输入参数为路径或上传压缩包",
        #     "Function": HotReload(Latex中译英)
        # },
        # 已经被新插件取代
        # "Latex项目全文英译中（输入路径或上传压缩包）": {
        #     "Group": "学术",
        #     "Color": "stop",
        #     "AsButton": False,  # 加入下拉菜单中
        #     "Info": "对Latex项目全文进行英译中处理 | 输入参数为路径或上传压缩包",
        #     "Function": HotReload(Latex英译中)
        # },
        "Latex英文纠错+高亮修正位置 [需Latex]": {
            "Group": "学术",
            "Color": "stop",
            "AsButton": False,
            "AdvancedArgs": True,
            "ArgsReminder": "如果有必要, 请在此处追加更细致的矫错指令（使用英文）。",
            "Function": HotReload(Latex英文纠错加PDF对比),
        },
        "📚Arxiv论文精细翻译（输入arxivID）[需Latex]": {
            "Group": "学术",
            "Color": "stop",
            "AsButton": False,
            "AdvancedArgs": True,
            "ArgsReminder": r"如果有必要, 请在此处给出自定义翻译命令, 解决部分词汇翻译不准确的问题。 "
                            r"例如当单词'agent'翻译不准确时, 请尝试把以下指令复制到高级参数区: "
                            r'If the term "agent" is used in this section, it should be translated to "智能体". ',
            "Info": "ArXiv论文精细翻译 | 输入参数arxiv论文的ID，比如1812.10695",
            "Function": HotReload(Latex翻译中文并重新编译PDF),  # 当注册Class后，Function旧接口仅会在“Void_Terminal_removed”中起作用
            "Class": Arxiv_Localize,    # 新一代插件需要注册Class
        },
        "📚本地Latex论文精细翻译（上传Latex项目）[需Latex]": {
            "Group": "学术",
            "Color": "stop",
            "AsButton": False,
            "AdvancedArgs": True,
            "ArgsReminder": r"如果有必要, 请在此处给出自定义翻译命令, 解决部分词汇翻译不准确的问题。 "
                            r"例如当单词'agent'翻译不准确时, 请尝试把以下指令复制到高级参数区: "
                            r'If the term "agent" is used in this section, it should be translated to "智能体". ',
            "Info": "本地Latex论文精细翻译 | 输入参数是路径",
            "Function": HotReload(Latex翻译中文并重新编译PDF),
        },
        "批量文件询问 (支持自定义总结各种文件)": {
            "Group": "学术",
            "Color": "stop",
            "AsButton": False,
            "AdvancedArgs": False,
            "Info": "先上传文件，点击此按钮，进行提问",
            "Function": HotReload(批量文件询问),
            "Class": Document_Conversation_Wrap,
        },
    }

    function_plugins.update(
        {
        }
    )

    function_plugins.update(
        {
        }
    )








    try:
        from crazy_functions.Arxiv_Downloader import 下载arxiv论文并翻译摘要

        function_plugins.update(
            {
                "一键下载arxiv论文并翻译摘要（先在input输入编号，如1812.10695）": {
                    "Group": "学术",
                    "Color": "stop",
                    "AsButton": False,  # 加入下拉菜单中
                    # "Info": "下载arxiv论文并翻译摘要 | 输入参数为arxiv编号如1812.10695",
                    "Function": HotReload(下载arxiv论文并翻译摘要),
                }
            }
        )
    except:
        logger.error(trimmed_format_exc())
        logger.error("Load function plugin failed")


    try:
        from crazy_functions.SourceCode_Analyse import 解析任意code项目

        function_plugins.update(
            {
                "解析项目源代码（手动指定和筛选源代码文件类型）": {
                    "Group": "编程",
                    "Color": "stop",
                    "AsButton": False,
                    "AdvancedArgs": True,  # 调用时，唤起高级参数输入区（默认False）
                    "ArgsReminder": '输入时用逗号隔开, *代表通配符, 加了^代表不匹配; 不输入代表全部匹配。例如: "*.c, ^*.cpp, config.toml, ^*.toml"',  # 高级参数输入区的显示提示
                    "Function": HotReload(解析任意code项目),
                },
            }
        )
    except:
        logger.error(trimmed_format_exc())
        logger.error("Load function plugin failed")



    try:
        
        function_plugins.update(
            {
            }
        )
    except:
        logger.error(trimmed_format_exc())
        logger.error("Load function plugin failed")

    # try:
    #     from crazy_functions.Document_Optimize import 自定义智能文档处理
    #     function_plugins.update(
    #         {
    #             "一键处理文档（支持自定义全文润色、降重等）": {
    #                 "Group": "学术",
    #                 "Color": "stop",
    #                 "AsButton": False,
    #                 "AdvancedArgs": True,
    #                 "ArgsReminder": "请输入处理指令和要求（可以详细描述），如：请帮我润色文本，要求幽默点。默认调用润色指令。",
    #                 "Info": "保留文档结构，智能处理文档内容 | 输入参数为文件路径",
    #                 "Function": HotReload(自定义智能文档处理)
    #             },
    #         }
    #     )
    # except:
    #     logger.error(trimmed_format_exc())
    #     logger.error("Load function plugin failed")



    try:
        from crazy_functions.Paper_Reading import 快速论文解读
        function_plugins.update(
            {
                "速读论文": {
                    "Group": "学术",
                    "Color": "stop",
                    "AsButton": False,
                    "Info": "上传一篇论文进行快速分析和解读 |  输入参数为论文路径或DOI/arXiv ID",
                    "Function": HotReload(快速论文解读),
                },
            }
        )
    except:
        logger.error(trimmed_format_exc())
        logger.error("Load function plugin failed")


    # try:
    #     from crazy_functions.高级功能函数模板 import 测试图表渲染
    #     function_plugins.update({
    #         "绘制逻辑关系（测试图表渲染）": {
    #             "Group": "智能体",
    #             "Color": "stop",
    #             "AsButton": True,
    #             "Function": HotReload(测试图表渲染)
    #         }
    #     })
    # except:
    #     logger.error(trimmed_format_exc())
    #     print('Load function plugin failed')



    # 删除不需要的高风险/冗余功能
    remove_keys = [
        '谷歌学术检索助手（输入谷歌学术搜索页url）',
        '保存当前的对话',
        '询问多个GPT模型',
        '询问多个GPT模型（手动指定询问哪些模型）',
    ]
    for k in remove_keys:
        function_plugins.pop(k, None)

    # 恢复完整插件列表（仅移除中译英相关）
    """
    设置默认值:
    - 默认 Group = 对话
    - 默认 AsButton = True
    - 默认 AdvancedArgs = False
    - 默认 Color = secondary
    """
    for name, function_meta in function_plugins.items():
        if "Group" not in function_meta:
            function_plugins[name]["Group"] = "对话"
        if "AsButton" not in function_meta:
            function_plugins[name]["AsButton"] = True
        if "AdvancedArgs" not in function_meta:
            function_plugins[name]["AdvancedArgs"] = False
        if "Color" not in function_meta:
            function_plugins[name]["Color"] = "secondary"

    return function_plugins




def get_multiplex_button_functions():
    """多路复用主提交按钮的功能映射
    """
    return {
        "常规对话": "",
    }
