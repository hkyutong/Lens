import subprocess
import os

supports_format = ['.csv', '.docx', '.epub', '.ipynb',  '.mbox', '.md', '.pdf',  '.txt', '.ppt', '.pptm', '.pptx', '.bat']

def convert_to_markdown(file_path: str) -> str:
    """
    将支持的文件格式转换为Markdown格式
    Args:
        file_path: 输入文件路径
    Returns:
        str: 转换后的Markdown文件路径，如果转换失败则返回原始文件路径
    """
    _, ext = os.path.splitext(file_path.lower())

    if ext in ['.docx', '.doc', '.pptx', '.ppt', '.pptm', '.xls', '.xlsx', '.csv', '.pdf']:
        try:
            # 创建输出Markdown文件路径
            md_path = os.path.splitext(file_path)[0] + '.md'
            # 使用markitdown工具将文件转换为Markdown
            command = f"markitdown {file_path} > {md_path}"
            subprocess.run(command, shell=True, check=True)
            print(f"已将{ext}文件转换为Markdown: {md_path}")
            return md_path
        except Exception as e:
            print(f"{ext}转Markdown失败: {str(e)}，将继续处理原文件")
            return file_path

    return file_path

def _extract_text_by_llama_reader(file_path: str) -> str:
    from llama_index.core import SimpleDirectoryReader
    reader = SimpleDirectoryReader(input_files=[file_path])
    print(f"Extracting text from {file_path} using SimpleDirectoryReader")
    documents = reader.load_data()
    print(f"Complete: Extracting text from {file_path} using SimpleDirectoryReader")
    return '\n'.join(doc.text for doc in documents if getattr(doc, "text", None))


def _extract_pdf_by_pypdf(file_path: str) -> str:
    from pypdf import PdfReader
    reader = PdfReader(file_path)
    pages = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or '')
        except Exception:
            pages.append('')
    return '\n'.join(pages)


def _read_text_like_file(file_path: str) -> str:
    for encoding in ('utf-8', 'utf-8-sig', 'gb18030', 'latin-1'):
        try:
            with open(file_path, 'r', encoding=encoding) as f:
                return f.read()
        except Exception:
            continue
    return ''


# 修改后的 extract_text 函数，结合 SimpleDirectoryReader 和回退解析逻辑
def extract_text(file_path):
    _, ext = os.path.splitext(file_path.lower())

    if ext not in supports_format:
        return '格式不支持'

    # 1) 首选原有路径（兼容原行为）
    try:
        text = _extract_text_by_llama_reader(file_path)
        if text and text.strip():
            return text
    except Exception:
        pass

    # 2) PDF 回退：pypdf，解决部分 PDF 解析为空的问题
    if ext == '.pdf':
        try:
            text = _extract_pdf_by_pypdf(file_path)
            if text and text.strip():
                return text
        except Exception:
            pass

    # 3) 文本类文件兜底读取，避免空内容直接失败
    if ext in {'.txt', '.md', '.csv'}:
        text = _read_text_like_file(file_path)
        if text and text.strip():
            return text

    return ''
