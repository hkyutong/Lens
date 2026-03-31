ACADEMIC_REPORT_CSS = """
body {
  margin: 0;
  padding: 0;
  background: #f5f7fb;
  color: #1f2937;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", sans-serif;
}

a {
  color: #1f4fd7;
}

code,
pre {
  font-family: "SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}

.markdown-body,
.chat-body {
  line-height: 1.72;
}

.markdown-body table,
.chat-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}

.markdown-body th,
.markdown-body td,
.chat-body th,
.chat-body td {
  border: 1px solid #d8dee8;
  padding: 10px 12px;
  vertical-align: top;
}

.markdown-body pre,
.chat-body pre {
  overflow: auto;
  padding: 14px 16px;
  border-radius: 12px;
  background: #0f172a;
  color: #e5eefb;
}

.markdown-body blockquote,
.chat-body blockquote {
  margin: 16px 0;
  padding: 0 0 0 14px;
  border-left: 3px solid #cdd7e6;
  color: #4b5563;
}

.markdown-body img,
.chat-body img {
  max-width: 100%;
}
""".strip()


def get_academic_report_css():
    return ACADEMIC_REPORT_CSS
