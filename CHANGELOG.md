# 更新日志

## 0.0.16 (2026-03-06)
- 修复 Linux 服务器部署时 `admin` 的 Vite 配置崩溃：`admin/vite/plugins/compression.ts` 对空的 `VITE_BUILD_COMPRESS` 改为安全兜底，不再对 `undefined` 执行 `split()`，未配置压缩时直接跳过压缩插件，避免一键部署在 `vite build` 阶段报错。
- 修复 Linux 服务器部署时工作区被污染：`build.sh` 的 `admin` 构建改为直接执行 `vue-tsc + vite build`，不再调用 `admin/package.json` 中包含 `pnpm format` 的 `build` 脚本，避免部署后服务器源码被自动改写、`git pull` 被本地改动阻塞。
- 修复 Linux 部署时 `admin` 构建失败：补齐 `admin/src/views/users/index.vue` 与 `admin/src/views/users/accountLog.vue` 缺失的 `getAvatarText`，并为 `admin/src/views/sensitive/violation.vue` 的 `getAvatarText` 增加明确类型声明，消除 `TS2339` 与 `TS7006` 构建错误。
- 清理 `admin/src/views/users/index.vue` 模板中的残留脏字符 `expirationTime`，避免后续模板异常和构建隐患。
- 新增根目录 `test.sql`：写入首发商业化套餐方案，包含 `轻用版 / 专业版 / 旗舰版 / 高级模型加油包 / 特殊模型加油包` 五个正式套餐，并同步将积分公开名称切换为 `基础模型额度 / 高级模型额度 / 特殊模型额度`。
- 将本地数据库 `yuto3996` 的 `crami_package` 与 `config` 实际更新为上述首发套餐结构，清理旧的 `E2E会员包-*` 测试套餐，便于直接在后台与前台上线使用。

## 0.0.15 (2026-03-06)
- 将根目录 `build.sh` 从“本地打包拷贝脚本”重构为“Linux 服务器一键部署启动脚本”：自动检查 `node/npm/pnpm/pm2/python3`、安装 `admin/chat/service` 依赖、构建全部前后端、同步静态资源到 `service/public`、创建 `academic-4.0/venv` 并安装依赖、通过 PM2 启动 `lens-service` 与 `lens-academic`，并在启动后做 `9520/38000` 端口健康检查。
- 新增部署脚本可选能力：支持 `START_DOCKER_DEPS=1` 一键拉起本地 `mysql/redis` 容器依赖，支持 `INSTALL_ACADEMIC=0` 跳过学术引擎依赖安装，方便在不同 Linux 服务器环境复用。
- 同步更新部署文档 `docs/DEPLOYMENT.md`：改为以 `./build.sh` 为主入口，明确当前生产部署方式是由 `service` 统一托管前台 `/` 与后台 `/admin` 静态资源，不再要求单独起 `9000/9002` 开发服务器。
- 补充学术部署约束：`build.sh` 现在默认优先使用 `python3.12` 创建 `academic-4.0/venv`，并强制校验学术解释器精确版本为 `3.12.12`；同时补上 PM2 开机自启配置逻辑，使 `lens-academic` 在异常退出和系统重启后都能继续常驻运行。
- 重写官网产品文案 `docs/PRODUCT_PAGE_COPY.md`：调整为更接近 Prism 风格的用户价值表达，聚焦首屏、价值主张、使用流程、场景与 CTA，不暴露内部实现细节。

## 0.0.14 (2026-03-05)
- 清理仓库敏感信息：`academic-4.0/config.py` 与 `academic-4.0/docs/use_audio.md` 中的真实/高风险密钥示例全部替换为安全占位符，避免触发 GitHub Push Protection。
- 发布链路安全加固：准备重新整理提交历史后推送至 `git@github.com:hkyutong/Lens.git`，确保远程仓库不包含历史密钥痕迹。

## 0.0.13 (2026-03-05)
- 新增项目首页文档：`README.md`，统一 Lens 昱镜产品定位、能力、场景与项目结构说明，作为 GitHub 展示入口。
- 新增产品页文案：`docs/PRODUCT_PAGE_COPY.md`，提供可直接用于官网/发布页的 OpenAI 风格结构化介绍（Hero/价值/能力/CTA）。
- 重写部署文档：`docs/DEPLOYMENT.md` 升级为当前架构的全链路部署指南（service/chat/admin/academic + MySQL/Redis + PM2 + 发布闸门）。
- 新增根目录 `.gitignore`，按标准忽略 `node_modules`、`venv`、日志、运行时上传数据与 `.env`，仅保留源码与必要文档，便于安全推送 GitHub。

## 0.0.12 (2026-03-05)
- 修复服务端退出登录能力：`service/src/modules/auth/auth.controller.ts` 新增 `POST /auth/logout`，`service/src/modules/auth/auth.service.ts` 新增退出逻辑并使当前 JWT 立即失效。
- 强化登录态失效机制：`service/src/modules/redisCache/redisCache.service.ts` 新增 token 黑名单校验，`logout` 后即使是 `super/admin` 角色也会被正确拦截；同时避免 token 池为空时自动回填导致“退出后仍可访问”。
- 修复单模型配置兼容：`service/src/modules/academic/academic.service.ts` 新增学术模型选择兜底策略，优先使用请求模型，不可用时回退到 `deepseek-v3.2` / baseConfig / 首个启用模型，解决“仅配置 deepseek-v3.2 时学术调用报模型不存在”。
- 修复重复登录 token 冲突：`service/src/modules/auth/auth.service.ts` 的登录 JWT 增加 `sessionId`，避免“退出后立即重登拿到同 token 被黑名单误杀”。
- 更新生产闸门脚本：`service/scripts/prod_gate_suite.mjs` 去掉硬编码 `gpt-5-nano`，改为动态解析可用模型（优先 `deepseek-v3.2`），并加入真实 `logout` 校验和用户 token 续期逻辑，避免后台重置/解锁后旧 token 干扰积分与学术测试。
- 生产闸门复测通过：`prod_gate_suite` 最新结果 `totalChecks=24, passChecks=24, failChecks=0, blockers=0, canRelease=true`。

## 0.0.11 (2026-03-03)
- 修复上传文件卡片地址泄露：`chat/src/views/chat/components/Message/Text/index.vue` 将用户上传文件卡由 `<a href>` 直链改为受控按钮下载，不再在浏览器地址栏暴露真实文件地址。
- 新增上传下载代理接口：`service/src/modules/upload/upload.controller.ts` 增加 `POST /upload/file/download`（登录态），前端统一通过该接口下载上传文件。
- 增强下载安全与兼容：`service/src/modules/upload/upload.service.ts` 新增本地文件安全路径解析与流式下载能力，仅允许 `public/file` 目录内文件；同时兼容远程对象存储 URL 的后端转发下载，保证原有用户功能不受影响。

## 0.0.10 (2026-03-03)
- 学术流“覆盖回写”前端落地修复：`chat/src/views/chat/chatBase.vue` 现在消费 `resetContent` 信号并先清空旧流式内容，再追加新内容，修复“中间态+最终态混写”导致的编程分组表格裂行、半渲染与样式错乱。
- 代码解析表格一次性稳定化：`service/src/modules/academic/academic.service.ts` 与 `chat/src/views/chat/components/Message/Text/index.vue` 新增“拆行行对折叠 + 表格内部空行折叠”兜底规则，专门修复“路径行/描述行被拆开并夹分隔线”导致的丑表格。
- 代码解析汇总文本去污染：`academic-4.0/crazy_functions/SourceCode_Analyse.py` 强化摘要清洗，移除汇总句中的表格残片（`| 文件路径 | 功能描述 |`、分隔线、孤立竖线）与“正在开始汇总/程序整体功能概括”噪声，避免再次把表格语法混入正文。
- 发布链路同步：重新构建 `chat` 与 `service` 并同步 `chat/dist -> service/public/chat`，确保线上 9520 实际加载到本次表格修复资源。

## 0.0.9 (2026-03-02)
- 代码解析表格“拆头”渲染修复：`service/src/modules/academic/academic.service.ts` 与 `chat/src/views/chat/components/Message/Text/index.vue` 增加“拆分表头自动合并”规则，支持 `| 文件路径` + `| 功能描述 |` + 分隔线的损坏形态，统一重组成标准 Markdown 表格，修复仍显示竖线文本的问题。
- 代码解析汇总质量回归修复：`academic-4.0/crazy_functions/SourceCode_Analyse.py` 调整摘要压缩策略为“保留反引号内关键标识（如 `main.py`/`__init__.py`）+ 最多两句关键信息”，避免输出被过度裁剪成空括号或过短描述；同时统一表格路径展示为简洁相对路径（去掉 `.zip.extract` 噪声）并使用安全竖线字符，减少表格再次裂行。
- 学术请求链路稳定性增强：`academic-4.0/crazy_functions/crazy_utils.py` 增加并发硬上限（默认 8，可环境变量覆盖）、指数退避重试、空响应判定、失败分片自动补跑（默认 2 轮）与更长看门狗耐心时间，显著降低长任务中断与“只剩警告无结果”的概率。
- 收敛多线程状态刷屏：同文件默认启用紧凑进度模式，并移除逐秒倒计时式重试文案，避免 LaTeX 润色/翻译等任务输出数百行“处理中/重试中”。
- 默认并发配置修正：`academic-4.0/config.py` 将 `DEFAULT_WORKER_NUM` 从 `10000` 调整为 `8`，避免高并发打爆上游导致 `BrokenPipe/ConnectionError`。
- 压缩包上传解析兼容增强：`academic-4.0/shared_utils/handle_upload.py` 支持大小写后缀与更多压缩格式识别（如 `.ZIP/.TGZ/.TAR.GZ/.TXZ`），并保持安全解压校验。
- 代码解析插件上传路径修复：`academic-4.0/crazy_functions/SourceCode_Analyse.py` 新增“文件/目录统一解析 + `.extract` 自动识别”逻辑，修复上传压缩包后误报“找不到文件”。
- 代码解析自定义文件类型增强：同文件支持 `.py/.go/.rs` 这类简写自动转 `*.py/*.go/*.rs`，修复“解析项目源代码（自定义文件类型）”输入扩展名不生效的问题。
- 代码解析汇总表格渲染修复：同文件新增表格输出后处理，自动补齐句子与表头换行、缺失分隔行，避免“| 文件路径 | 功能描述 |”不按 Markdown 表格渲染。
- 代码解析汇总表格回写修复：`academic-4.0/crazy_functions/SourceCode_Analyse.py` 将规范化后的表格 Markdown 回写到当前聊天消息（而非仅内部变量），并补充“粘连行拆分”与分隔行识别，修复界面仍显示未渲染表格的问题。
- 代码解析汇总输出收敛：同文件的汇总提示词改为固定模板（单份表格 + 单句概括），并在后处理中仅保留最后一份有效表格，减少重复表格与脏文本。
- 代码解析汇总彻底稳定化：`academic-4.0/crazy_functions/SourceCode_Analyse.py` 改为“后端固定组装 Markdown 表格 + 模型仅生成一句总体概括”，不再依赖模型直接产出表格，解决行拆裂、重复分隔线、半渲染等问题。
- 前端表格渲染兼容增强：`chat/src/views/chat/components/Message/Text/index.vue` 的 `normalizeMarkdownTables` 新增“前置文案+表头同一行（如 `。 | 文件路径 |`）”拆分逻辑，并放宽两列表格识别，修复该场景下 Markdown 表格无法渲染的问题。
- 代码解析表格“拆行”兜底修复：`service/src/modules/academic/academic.service.ts` 新增 Markdown 表格重组器，自动合并“路径一行 + 描述一行”损坏数据、去除重复分隔行，并在输出净化阶段统一生效，避免流式拼接后表格畸形。
- 前端表格最终态重构：`chat/src/views/chat/components/Message/Text/index.vue` 新增表格行级合并逻辑，对历史脏消息与实时消息统一修复，确保两列表格稳定渲染不再出现竖线散落。
- 代码解析表格后处理重写：`academic-4.0/crazy_functions/SourceCode_Analyse.py` 重构 `_normalize_summary_table_markdown`，去除“每行插入分隔线”的错误逻辑，统一输出单一表头分隔线，并自动合并“路径行/描述行”拆裂数据。
- 学术流覆盖消息改为“替换”语义：`academic-4.0/shared_utils/fastapi_stream_server.py` 在检测到 assistant 文本被覆盖时发送 `resetContent`，`service/src/modules/academic/academic.service.ts` 接收后先清空旧内容再写入，修复“正在开始汇总”等旧进度文案串入最终结果。
- 代码解析汇总中间态降噪：`SourceCode_Analyse.py` 去除“正在开始汇总”文案回写，避免中间进度文本参与后续渲染合并。
- 注释 Python 项目进度体验优化：`academic-4.0/crazy_functions/SourceCode_Comment.py` 改为紧凑进度输出（已完成/处理中），不再反复打印大量“当前任务：正在处理xxx”行。
- 修复 Rust 误报文案：同文件将 Rust 插件“未找到文件”错误从错误的 `golang` 提示改为 Rust 正确提示。
- 路径泄露收敛：`SourceCode_Analyse.py`、`SourceCode_Comment.py`、`Latex_Function.py`、`Latex_Project_Polish.py`、`Latex_Project_Translate_Legacy.py` 的报错与状态提示改为业务文案，不再向用户回显本机真实路径。
- 上传确认展示脱敏：`academic-4.0/toolbox.py` 的上传文件列表展示改为相对路径/文件名，避免前端消息带出绝对路径。
- 核心功能顺序调整：`academic-4.0/core_functional.py` 与 `service/src/modules/academic/academic.service.ts` 将“学术型代码解释（解释代码）”固定到“参考文献转Bib”之后，前后端顺序一致。

## 0.0.8 (2026-03-01)
- 修复学术下载 500：`service/src/modules/academic/academic.service.ts` 的 `proxyFile` 增加下载参数解析与状态映射（400/403/404 -> 明确业务错误），并补齐 `Content-Disposition` 回传，避免前端统一收到 `Internal server error`。
- 修复下载文件元数据被清洗破坏：`service/src/modules/academic/academic.service.ts` 对 `fileVectorResult` 改为结构化保留（路径字段不再被通用文本脱敏破坏），仅规范显示名，避免按钮出现 `{_files__[_` 并导致下载失败。
- 增加前端下载兜底：`chat/src/views/chat/components/Message/Text/index.vue` 新增下载路径解析/合法性校验，自动过滤坏数据并在无效链接时直接提示用户，避免刷新后历史消息触发错误下载请求。
- 修复 LaTeX 内部提示清洗“误删正文”问题：`academic-4.0/toolbox.py` 的运行时文案清洗改为“按句子粒度”移除内部提示，不再因整行匹配导致有效结果被一起删掉。
- 收敛 LaTeX 中间态文案：`academic-4.0/crazy_functions/latex_fns/latex_actions.py` 去除“完成了吗/GPT结果已输出即将编译PDF/当前工作路径”等内部流程与路径提示，仅保留业务状态文案。
- 强化 LaTeX 纯排版片段跳过策略：`academic-4.0/crazy_functions/Latex_Project_Polish.py` 与 `academic-4.0/crazy_functions/latex_fns/latex_actions.py` 优化片段判定，命令密度高、可读正文低的片段直接透传，减少无意义模型调用与异常长输出。
- 修复 LaTeX 摘要兜底稳定性与路径外显：`academic-4.0/crazy_functions/Paper_Abstract_Writer.py` 增强本地兜底摘要清洗（去 Token 警告/重试噪声）、全文兜底来源改为提取后的正文片段，并将提示中的文件标识统一为文件名（不含路径）。
- 收紧上传/下载链路路径展示：`academic-4.0/toolbox.py` 调整上传确认与下载链接展示文案，前端显示仅保留文件名；同时对消息左列也执行路径脱敏，避免 `解析项目: /path/...` 外显。
- 修复 LaTeX 多线程进度刷屏：学术链路新增“任务处理中，请稍候（...）”内联进度噪声清洗（`academic-4.0/toolbox.py`、`service/src/modules/academic/academic.service.ts`、`chat/src/views/chat/chatBase.vue`、`chat/src/views/chat/components/Message/Text/index.vue`），避免一条回复堆积数百次处理中状态。
- 修复 LaTeX 摘要“只显示 Token 截断警告后停止”问题：`academic-4.0/crazy_functions/Paper_Abstract_Writer.py` 新增摘要前文本净化（过滤 `\put`/坐标排版噪声）与强制兜底摘要路径，确保任务可产出可读结果。
- 优化 LaTeX 润色/翻译性能：`academic-4.0/crazy_functions/Latex_Project_Polish.py`、`academic-4.0/crazy_functions/latex_fns/latex_actions.py` 新增“排版指令片段直通”策略，跳过无语义代码片段的 LLM 调用，显著减少任务分片数量与卡顿概率。
- 收敛 LaTeX 内部流程文案：`latex_actions.py`、`toolbox.py`、`service/src/modules/academic/academic.service.ts`、`chat/src/views/chat/chatBase.vue`、`chat/src/views/chat/components/Message/Text/index.vue` 统一清理“主文件分析/精细切分”等内部提示，前端仅展示业务状态文案。
- 补齐相对路径脱敏：新增对 `academic-4.0/...`、`gpt_log/...`、`downloadzone/...` 的统一净化规则，修复 LaTeX 润色回执中路径外显问题（含聊天流与报告写盘两条链路）。
- 降低 LaTeX 长任务误中断：`academic-4.0/crazy_functions/crazy_utils.py` 将看门狗耐心时间从 `5s` 提升至 `60s`，并将重试提示改为业务文案，减少网络抖动导致的提前失败。
- 修复 LaTeX 长任务被 5 分钟超时中断：`service/src/modules/academic/academic.service.ts` 本地学术流默认超时从 `300000ms` 提升到 `1800000ms`，减少 `fetch failed` 与中途停止。
- 优化 LaTeX 精准翻译/高亮纠错降级：`academic-4.0/crazy_functions/Latex_Function.py` 在无 `pdflatex` 环境时不再直接终止，改为继续产出可下载的 Tex 结果压缩包。
- 增强 LaTeX 摘要兜底完成率：`academic-4.0/crazy_functions/Paper_Abstract_Writer.py` 增加弱响应判定与本地兜底摘要，避免只返回截断警告后停止。
- 截断提示文案更新：`LaTeX 摘要` 等学术链路的 Token 超限提示统一为 `警告，文本过长将进行截断，Token溢出数：N，现继续运行。`，并同步兼容旧文案去重规则。
- 修复 LaTeX 摘要异常外泄：`academic-4.0/crazy_functions/crazy_utils.py` 不再把 requests/urllib3 traceback 回显到用户消息，改为记录服务端日志并统一提示“学术服务连接异常，请稍后重试”。
- 增加 traceback 二次净化：`academic-4.0/toolbox.py` 新增 `strip_traceback_runtime_noise`，在聊天刷新与报告写盘前剔除 Traceback/urllib3/requests/BrokenPipeError 残留，避免前端与下载报告暴露内部堆栈。
- 收敛 Token 溢出警告刷屏：`service/src/modules/academic/academic.service.ts` 与 `academic-4.0/toolbox.py` 将重复“文本过长截断”警告压缩为单条（保留最大溢出值），并在流式拼接阶段实时去重。
- 修复 `service` 构建阻断：`service/src/modules/userBalance/userBalance.service.ts` 调整动态字段写入类型，消除 `TS2322 (number -> never)`，恢复 `nest build` 可通过，确保学术链路改动可发布。
- 学术插件命名调整：将 `Arxiv 精准翻译` 统一更名为 `Arxiv 英文摘要`（仅改展示名，功能与后端路由保持不变，并兼容旧名称映射）。
- 修复 Arxiv 英文摘要断句异常：`service/src/modules/academic/academic.service.ts` 的摘要切句规则改为“仅在真实句边界切分”，避免 `e.g.` / `i.e.` / `github.com` 被错误拆成换行（如 `e.`、`g.` 或 `github.`、`com`）。
- 脑图一键下载增强：`chat/src/views/chat/components/Message/Text/index.vue` 为 Mermaid 渲染结果新增“点击图下载 + 悬浮下载按钮”，默认导出 PNG，异常时自动回退 SVG；仅在现有渲染层增量实现，不改后端接口与消息结构。
- 修复下载报告路径泄露：`academic-4.0/toolbox.py` 新增统一路径脱敏（`redact_sensitive_path_text`），`write_history_to_file` 写盘前会清理绝对路径/内部目录路径并标准化“找不到文件”文案，避免报告出现真实服务器路径。
- 增加下载区兜底净化：`promote_file_to_downloadzone` 现在会对 `.md/.txt/.log` 报告执行二次内容净化，防止插件链路差异导致路径再次落盘。
- 优化 PDF/Word 批量总结可读性：`academic-4.0/crazy_functions/PDF_Summary.py` 与 `Word_Summary.py` 强化为结构化 Markdown 输出（禁用表格、分点换行），并新增长段落自动拆分，降低“回复挤在一起”问题。
- 收敛历史消息路径占位词：`service/src/modules/chatLog/chatLog.service.ts` 改为直接移除敏感路径，不再返回 `[路径已隐藏]` / `【文件路径已隐藏】` 等内部文案。
- 历史可下载报告补清洗：批量净化 `academic-4.0/gpt_log` 下既有 `.md/.txt/.log` 文件，移除已落盘的绝对路径与内部目录路径，避免旧报告继续泄露路径信息。
- 修复 Arxiv 摘要“收尾被英文覆盖”问题：`service/src/modules/academic/academic.service.ts` 在 `ensureArxivSummary` 增加中文内容保留策略（优先保留流式阶段已生成的中文摘要），仅在内容缺失时才回退 Arxiv 元数据；并优化回退摘要分段，避免结束后挤成一段。
- 补齐相对路径脱敏：`academic-4.0/toolbox.py` 的报告清洗规则新增对 `gpt_log/...` / `downloadzone/...` 等内部相对路径识别（含带空格文件名），报告中仅保留文件名，不再暴露内部目录结构。
- 修复 Arxiv 摘要源头提示：`academic-4.0/crazy_functions/Arxiv_Downloader.py` 的用户展示文案改为仅显示论文文件名，避免把内部存储路径写入历史与下载报告。

## 0.0.7 (2026-03-01)
- 修复路径脱敏外显文案：学术与聊天链路不再向用户展示 `【文件路径已隐藏】` / `[路径已隐藏]` 占位词；找不到文件类报错统一改为业务可读文案（如“找不到任何.tex或.pdf文件。”）。
- 会话列表交互优化：`chat/src/views/chat/components/sider/ListItem.vue` 的三点菜单从“仅当前激活会话可见”调整为“悬浮会话项显示，激活或菜单展开时常显”，提升会话管理操作可发现性。
- 修复 LaTeX 插件首条回复泄露内部说明：`academic-4.0/crazy_functions/Latex_Project_Polish.py` 与 `academic-4.0/crazy_functions/Latex_Function.py` 将开场文案统一为简洁任务状态提示，不再展示“函数插件贡献者/注意事项/平台限制/README”等内部信息。
- 修复 LaTeX 英文润色/中文润色进度刷屏：`academic-4.0/crazy_functions/crazy_utils.py` 为多线程请求新增 `compact_progress` 模式，并在 LaTeX 润色调用侧启用，仅输出聚合进度，避免大量“执行中/已成功”滚动噪声。
- 强化后端流式清洗：`service/src/modules/academic/academic.service.ts` 扩展学术文本去噪规则，新增对“多线程状态矩阵、执行中行、LaTeX 内部说明行、注意事项行”的过滤，防止进入最终消息与落库内容。
- 强化前端实时兜底：`chat/src/views/chat/chatBase.vue` 同步增加噪声识别与行级清洗，确保流式阶段也不会回显 `[Local Message]` 前缀、内部实现说明和多线程状态行。
- 强化学术源头净化：`academic-4.0/toolbox.py` 新增 `strip_plugin_runtime_notice_text` 与 `strip_multithread_status_noise`，对插件输出做统一安全化/简洁化处理。

## 0.0.6 (2026-03-01)
- 修复学术输出刷新后 Markdown 结构丢失问题：`service/src/modules/academic/academic.service.ts` 在流式拼接时保留“仅空白/换行”的结构性 chunk，避免把表格、列表、段落换行误判为噪音丢弃。
- 修复学术流分片去重误删结构字符：保留仅符号分片（如 `**`、`|`、`\n`）避免在 `pickPrimaryAcademicText` 阶段丢失 Markdown 标题和表格语法。
- 修复表格分隔行被错误断行：移除 `getAcademicChunkJoiner` 对 `|` 分片的强制换行逻辑，避免把同一行内的表格 token 拆成多行导致“生成时挤在一起/刷新后丑表格”。
- 修复“句号+换行”误删：学术心跳噪声过滤保留包含结构换行的分片，避免表格前的断句/空行被吞掉。
- 修复前端流式展示与最终落库不一致：`chat/src/views/chat/chatBase.vue` 保留学术流中的结构换行分片，并在学术模式下优先采用后端 `finalContent` 作为最终渲染内容，避免“生成时挤一起、刷新后又变样”。
- 新增前端历史消息表格修复：`chat/src/views/chat/components/Message/Text/index.vue` 自动修复学术输出中的损坏表格语法（表格前换行丢失、分隔行被拆分），提升刷新后展示质量。
- 优化脑图/流程图流式体验：`chat/src/views/chat/components/Message/Text/index.vue` 在流式生成阶段不再实时渲染 Mermaid 图，仅展示稳定源码；消息完成后再一次性渲染图形，减少“源码与图来回跳动”。
- 该修复确保落库 `content` 维持与流式展示一致的换行结构，页面刷新后不再出现“内容挤成一段”。
- 品牌文案统一：将学术导出链路中用户可见的 `GPT-Academic` 报告标题/前缀改为 `Lens Report｜昱镜报告`（含 `toolbox.py` 报告头与默认文件名前缀）。
- 同步替换导出模板中的品牌文案：`shared_utils/advanced_markdown_format.py`、`crazy_functions/pdf_fns/report_template_v2.html`、`Conversation_To_File.py`、`doc_fns/review_fns` 的 Word/TXT/BibTeX 标题统一改为 `Lens ｜昱镜`。
- 同步替换运行期可见提示文案：欢迎语与 AutoGen 等待提示（`themes/welcome.js`、`waifu-tips.js`、`agent_fns/pipe.py`）不再显示 `GPT-Academic`。
- 新增统一聊天输出清洗：`academic-4.0/toolbox.py` 在 `update_ui` 前自动移除 `函数插件作者/贡献者` 文案与 `[Local Message]` 前缀，并去重重复的 Token 截断警告。
- 恢复 AIWebQuickDeploy 轻量部署包链路：`build.sh` 现在会自动把 `service dist` 与 `admin/chat dist` 同步到 `AIWebQuickDeploy/`，并新增 `QUICK_DEPLOY_ONLY=1` 只打包不启动模式。
- 新增 `AIWebQuickDeploy/start.sh` 与配套说明文档，目标服务器可直接安装运行时依赖并用 PM2 启动 `YutoLens`。
- 修复 Linux 部署学术服务缺依赖问题：`academic-4.0/requirements.txt` 补充 `markdown`、`pymdown-extensions`、`python-markdown-math`、`pygments`，避免 `lens-academic` 因 `ModuleNotFoundError: markdown` 启动失败。
- 修复截断提示格式：`crazy_functions/crazy_utils.py` 的超长文本提示改为 `警告，文本过长将进行截断，Token溢出数：N。`，不再输出 `[Local Message]`。
- 修复指定学术插件开场脏文案：`PDF_Summary.py`、`PDF_QA.py`、`Word_Summary.py`、`Arxiv_Downloader.py`、`PDF_Translate.py`、`PDF_Translate_Nougat.py` 去除“函数插件贡献者”展示，并增强 Markdown 结构化输出提示。
- 下载区文件名品牌兜底：`promote_file_to_downloadzone` 与 `write_history_to_file` 会自动把 `GPT-Academic` 前缀替换为 Lens 品牌命名，避免继续出现旧品牌文件名。
- 强化实时流品牌净化链路：`service/src/modules/academic/academic.service.ts` 的 `sanitizeAcademicDelta` / `sanitizeAcademicStreamLine` 现在对流式 chunk 也执行 `[Local Message]` 去前缀、`函数插件作者/贡献者` 清洗、`Lens Report｜昱镜报告` 标题规范化与 Token 截断警告去重，避免“生成时脏、刷新后才干净”。
- 插件列表品牌清洗补齐：`academic-4.0/shared_utils/fastapi_stream_server.py` 与 `service/src/modules/academic/academic.service.ts` 在插件 `info/description` 统一剔除“函数插件作者/贡献者”文案，确保侧栏只展示 Lens 品牌信息。
- 学术流源头补净化：`academic-4.0/shared_utils/fastapi_stream_server.py` 的 `_iter_ndjson_from_updates` 在输出 delta 前统一执行 `sanitize_chatbot_text`，从源头去掉品牌噪声和重复截断提示。
- 表格与脑图渲染稳定性增强：`chat/src/views/chat/components/Message/Text/index.vue` 新增“文内 Mermaid 片段自动围栏化”与更稳健的 Markdown 表格边界/分隔行修复逻辑，减少“生成时挤在一起、刷新后表格畸形”。
- 优化表格视觉样式：`chat/src/views/chat/components/Message/Text/index.vue` 新增表头、单元格、暗色模式等样式，修复刷新后“丑表格”显示体验。
- 下载区既有文件重命名兜底：`academic-4.0/toolbox.py` 新增 `sanitize_download_filename`，当文件已在 downloadzone 时也会自动品牌化重命名，不再保留 `GPT-Academic` 命名。
- 历史报告品牌迁移：一次性批量处理 `academic-4.0/gpt_log/**/*.md`，将历史文件名中的 `GPT-Academic` 迁移为 `Lens-Report`，并把文件内 `# GPT-Academic Report` 标题替换为 `# Lens Report｜昱镜报告`。
- 学术欢迎文案去旧品牌：`academic-4.0/themes/welcome.js.min.d84e650b.js` 的 `欢迎使用GPT-Academic` 已替换为 `欢迎使用Lens｜昱镜`。
- 补强指定插件输出格式约束：`academic-4.0/crazy_functions/PDF_QA.py` 与 `PDF_Summary.py` 增加强制 Markdown 小节+列表提示，降低长段落挤压显示概率。

## 0.0.5 (2026-02-28)
- 修复学术后端动态模型拦截问题：`academic-4.0/request_llms/bridge_all.py` 新增运行时模型自动注册机制，`predict`、`predict_no_ui_long_connection`、`ModelOverride` 全部接入同一校验逻辑。
- 现在 `admin` 新增但未写入 `AVAIL_LLM_MODELS` 的 OpenAI 兼容模型（如 `deepseek-v3.2`）可在请求时自动注册，不再直接报“模型暂不支持”。
- 保留原有前缀策略：`api2d-/azure-/one-api-/vllm-/ollama-/openrouter-/volcengine-` 仍按既有专用路由处理，避免兜底策略误覆盖。
- 修复动态模型 key 识别：`academic-4.0/shared_utils/key_pattern_manager.py` 中未知模型名默认按 OpenAI 兼容 key 选择，避免 `deepseek-v3.2` 被误判为“无可用 key”。

## 0.0.4 (2026-02-28)
- 强制 Playwright Edge-only 策略：新增 `service/playwright.config.mjs`，统一 `use.channel = "msedge"`，并在 `globalSetup` 启动阶段校验策略。
- 新增双保险守卫：`service/scripts/guard_playwright_policy.mjs` 会扫描 `scripts/package.json/CI`，发现 `playwright install` 立即失败；运行时若未检测到 Edge，会直接报“缺少 Edge”并停止，不会自动回退下载 Chromium。
- 新增 Edge 启动器：`service/scripts/run_playwright_edge.mjs`，固定用本机 Edge 执行 Playwright 回归。
- 新增 Mermaid 回归用例：`service/playwright/mermaid_bomb.spec.cjs`，覆盖“语法错误降级 + 不泄漏炸弹错误图”。
- CI 增加策略检查：`electron-build.yml` 在安装依赖前执行 `guard_playwright_policy --scan-only`。

## 0.0.3 (2026-02-28)
- 修复聊天区 Mermaid 语法错误常驻显示问题：启用 `suppressErrorRendering`，并清理 Mermaid 渲染失败时遗留在 `body` 的临时节点（`dmermaid-*` / `imermaid-*`），避免底部持续出现“Syntax error in text”炸弹图。
- 优化 Mermaid 渲染容器绑定：`render` 显式传入当前消息节点并执行 `bindFunctions`，确保错误回退与事件绑定行为一致。

## 0.0.2 (2026-02-28)
- 修复积分并发扣费一致性问题：`deductFromBalance` 改为事务+行级锁，避免并发请求下重复成功或余额更新丢失。
- 修复分享模块安全与冗余逻辑：新增基础 HTML 清洗（拦截 `script`、事件属性、`javascript:` URL），并移除重复数据库查询。
- 修复验收脚本默认账号与环境兼容性：`admin_write_smoke_test`、`full_smoke_test`、`e2e_acceptance` 默认改为 `super/123456`，支持在不同工作目录正确定位 `.env` 与样例文件。
- 修复 `e2e_acceptance` 退出码问题：当步骤失败/校验失败/插件失败时返回非 0，避免“失败却显示通过”。
- 新增生产验收脚本 `service/scripts/prod_gate_suite.mjs`：覆盖登录、后台、积分、安全、性能及数据库落库核验，输出可上线判定与阻断项。
- 为长耗时脚本补充可控参数：`full_smoke_test` 与 `e2e_acceptance` 支持 `*_CORE_ONLY` / `*_PLUGIN_LIMIT`，用于稳定复测与回归。

## 0.0.1 (2026-02-04)
- 初始化版本
