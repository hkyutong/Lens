# 更新日志

## 2026-10-18 公开资源定位后台图标发布门禁

- 通过 Codex 自带浏览器观察正式后台已加载的公开资源，再只读 GET 并在本机内存比较六项固定静态资源；仅 favicon.svg 与候选不同，其余五项一致。未通过 SSH 传输或执行此前被拒绝的核验代码，该脚本已删除。
- 将许可范围仅增加后台 SVG 品牌图标。新增覆盖发布、独立恢复、失败恢复，以及后台带指纹文件和其他固定文件保持不可覆盖的回归；修复前失败、修复后品牌 8 项及完整 Python 345 项通过。
- 更新仍在本地，尚未完成本轮正式发布或推送；上一条只读核验代码传输请求不再需要用户处理。


## 2026-10-18 后台静态门禁与就绪归属检查

- 第三次发布通过依赖闭包、学术事务准备和数据库独立恢复验证，在后台静态目录同名文件内容差异门禁停止。正式文件、运行服务和正式数据库未变更；临时发布目录清理完成，未验证备份证据保留。
- 发现并本地修复就绪阶段错误要求业务私有配置归发布执行身份的问题：受测 Python 控制器提供预期服务归属，Node 读取继续验证用户、组、私有模式及文件类型；错误归属保持拒绝。新增回归修复前失败、修复后通过。
- 当前完整 Python 341 项、独立 Node 11 组回归通过；新就绪修复尚未部署或推送。
- 自动审批拒绝将受测只读库存代码发送到服务器以定位静态文件冲突，原因是缺少该源码传输的具体授权；动作未执行，已请求用户授权，未采用绕过方案。
- 本地前台、后台、业务 API 与学术服务均已确认可访问；正式站公开首页以正常浏览器标识请求返回正常页面。


## 2026-10-18 独立管理进程发布兼容

- 第二次发布通过生产依赖闭包后，在学术事务准备门禁停止；正式文件、运行服务和数据库未变更。临时发布目录已清理，未验证备份证据暂保留。
- 只读核验确认业务与学术服务由不同管理进程托管，旧代码错误要求共享同一管理进程。配置一致性、目录归属、模式、源码基线与网络命名空间均通过只读验证。
- 本地修复为按受测控制器观察到的学术管理器建立独立连接；业务进程身份由其自身管理器确认并在就绪时刷新。保留源码根、运行身份、私有模式及进程唯一性验证；缺少既有管理套接字时拒绝连接。
- 新增不同管理器生命周期、失败断开、缺失套接字拒绝、恢复及错误业务进程拒绝回归；当前 11 组独立 Node、340 项完整 Python 回归通过。修改尚未部署或推送。


## 2026-10-18 生产依赖闭包门禁修复

- 首轮本次发布在替换正式文件前被依赖闭包门禁拒绝；确认生产未变更、临时发布目录已清理。
- 本机独立复现确认校验器错误依赖仅开发环境存在的 YAML 解析器。修复为兼容现有生产 js-yaml，不新增依赖，并保持重复键、锚点和别名、自定义标签、多文档及警告拒绝。
- 新增独立运行等六项回归：修复前失败，修复后闭包 32 项通过。两份独立生产依赖树均通过；完整 Python 回归 334 项再次通过。
- 自动审批拒绝的远端复现脚本未执行；改由本机复现和验证，已清理未执行脚本及重复安装夹具。


## 2026-10-18 发布兼容与公式渲染安全复验

- 修复发布事务对不同服务运行身份的错误同身份假设：验证并保留私有配置原有归属，仅为事务新建目录设置预期归属；发布前后验证模式和身份，独立恢复兼容旧记录。
- 当前完整 Python 回归 334 项、独立 Node 回归 11 组通过。
- 经用户明确授权，仅在远端独立合成临时目录验证真实降权读写、其他身份隔离及独立恢复；全部通过，已独立确认临时目录删除。正式服务、配置和业务数据未变更。
- 公式渲染安全回归在旧版复现三项失败。独立源码将直接与间接 KaTeX 升级至 0.18.11，四项回归、类型检查及生产构建通过；官方 npm 复核不再报告 KaTeX，仍报告一项 sprintf-js 中危。
- 其余告警按当前调用方式复核：SDK 明确禁用重定向，上传走原始内容且不构造 XML；配置验证未开启动态数据选项；应用未使用受影响的文件探测、Nest SSE 和 UUID 相关变体；文档转换主入口未引入命令行格式化链。后台图表当前使用柱状系列。以上是当前调用范围的证据，不是依赖无漏洞的声明，入口或配置变化必须重新评估。
- 本轮尚未部署生产或推送；完整报告与附件闭环仍待最终页面验收。


## 2026-10-04 敏感信息零泄漏规则同步

- 按用户明确要求，已将敏感信息零泄漏写入本项目 `AGENTS.md` 作为最高优先级长期规则，并在 `STATUS.md` 标明当前强制约束；本条仅记录已完成的规则同步。此次未读取或输出凭据、用户数据或其他敏感原文。

## 2026-10-05

### 本地账号收敛与学术视觉重构

### 学术运行时纳入 service 合同

- academic-4.0 新增受控的 /health readiness 探针，固定返回脱敏的 Lens 学术运行时合同标识。
- Nest service 新增认证后的 /api/academic/health 适配层，探测上游失败时只返回 degraded/unavailable 和延迟，不向前端暴露内部地址、堆栈或凭据。
- Lens 前端初始化在登录后先检查该 readiness，再决定显示研究服务可用状态；既有聊天、编排、能力列表和文件链路未改写。
- 前后端 TypeScript、研究契约、Vite production build、Python 语法检查与 git diff --check 通过；本地 9520 和 38000 当前未监听，因此尚未做运行时 HTTP 闭环复核。


- 按用户明确要求在本机事务中删除原有全部 33 个用户及 53 条余额记录，仅保留一个 super 角色的本地测试账号；密码未写入三件套、日志、截图或回复。
- 清理 29 个旧用户对应的 Redis 会话索引；另有 3 个更早遗留且无法证明归属的孤立索引未触碰，避免扩大不可逆删除范围。
- 完成暖纸张/学术蓝/墨色视觉系统、非对称研究协议、纸张卡片输入区和研究任务设置重构；未改变认证、研究能力选择、文件导入与移动端抽屉调用链。
- vue-tsc、研究契约、Vite production build 与 git diff --check 通过；本地登录态桌面与 390×844 移动视口复核通过，移动端无横向溢出，未部署线上。

## 2026-09-01

### 收口研究文件与分享地址边界

- 新增 `chat/src/domain/research/downloads.ts`，统一解析学术结果文件和用户上传文件，兼容 JSON、对象数组及旧版逗号分隔文件地址；文件名统一去除控制字符和路径分隔符，避免结果下载时出现路径注入或多文件丢失。
- `Message/Text` 改为复用下载领域模块；学术结果外部下载地址仅允许公开 HTTP(S) 主机，拒绝凭据型 URL、本机和内网地址；Blob 下载改为 `finally` 清理 DOM 节点，并延迟释放 object URL，避免浏览器尚未消费链接时提前失效。
- 分享码解析与分享结果 URL 归一化收口至 `chat/src/domain/research/share.ts`，仅接受 8 位分享码和单一 `shareCode` 查询参数；新增离线契约断言覆盖非法查询参数、凭据型地址和本机地址。
- 本地验证通过：`chat` 的 `verify:research-contract`、`vue-tsc --noEmit`、`vite build --mode=production`、`service` 的 `build:test`、`git diff --check`；构建仅保留既有动态/静态导入和 Browserslist 警告。
- `verify:legacy-removal-ready --candidate ../../chat/dist --mirror ./public/chat` 仍返回 `canDelete:false`，原因是缺少删除证据文件且部署镜像入口哈希不一致；没有删除旧 99AI 用户端源码，没有覆盖 `service/public/chat`，没有访问线上环境。
- 回滚方式：恢复本节新增领域模块、调用方和契约断言即可；不涉及服务器、数据库、支付、账号或外部平台。

### 对齐本地 AcademicGPT 部署镜像

- 使用 `service/scripts/sync_static_release.mjs` 将已通过发布候选门禁的 `chat/dist` 原子同步到本地 `service/public/chat`，共 182 个文件；同步前旧镜像已保存到 `.release-backups/chat-latest`。
- `chat` 发布候选门禁以 `--mirror ../service/public/chat` 复核通过，候选与本地镜像 `index.html` 哈希一致；静态发布契约测试通过，旧哈希资源保留且无 staging 残留。
- 删除就绪门禁现在仅因缺少 `.legacy-removal-evidence.json` 拒绝，未执行删除；服务器、数据库、支付和线上静态目录均未触碰。
- 回滚方式：在本地执行 `npm run rollback:chat-static`，或恢复 `.release-backups/chat-latest`；不涉及线上回滚。

### 固定 Chromium 浏览器回归阻塞复核

- 执行 `npm run test:playwright -- playwright/academic_regression.spec.cjs` 时，固定共享 Chromium 可执行文件存在，但 headless 运行预检以 `SIGABRT` 退出；策略按约束停止，没有回退到本机 Chrome/Edge。
- 本轮未安装、下载、替换或删除任何浏览器运行时，也未读取 cookie、localStorage、sessionStorage、密码或 token；浏览器 E2E 不计为通过。
- 静态候选与本地镜像哈希已一致，静态发布契约、真实认证契约、受控写入契约和删除门禁契约仍通过。

### 完整本地发布候选复核

- `chat` 的 `npm run release-check` 通过，包含类型检查、生产构建、研究契约和发布候选门禁；`service` 的 `npm run build:test` 及四组离线契约门禁也通过。
- 审查 `build.sh` 后确认其默认行为包含依赖安装、部署目录清理、PM2/学术服务启动和端口健康检查；本轮没有执行，避免在未授权时产生安装、进程或外部状态副作用。
- 复核确认 `chat/dist/index.html` 与 `service/public/chat/index.html` 哈希一致，`service/.release-backups/chat-latest` 仍存在；没有发现 staging、临时文件或 `.DS_Store` 残留。

### 线上只读版本状态复核

- 只读 `HEAD https://lens.yutoai.net/` 曾返回 HTTP 200，但 `Last-Modified` 为 2026-06-16；后续 GET 因当前环境 DNS 解析失败，未读取入口 HTML 或资源内容。
- 该结果只能证明一次首页请求可达，不能证明线上已部署 AcademicGPT；本轮没有执行线上写入、发布、重启或缓存刷新。
- 由检查产生的临时文件已确认不存在；不涉及业务文件清理。

### 对齐 QuickDeploy 本地部署包

- 使用 `service/scripts/sync_static_release.mjs` 将 `chat/dist` 原子同步到 `AIWebQuickDeploy/public/chat`，旧入口保存至 `AIWebQuickDeploy/.release-backups/chat-latest`。
- 候选、`service/public/chat` 和 QuickDeploy 的 `index.html` 哈希均为 `99a1d401…46a4ef0`；两个镜像的发布候选门禁均通过，入口不再引用旧 99AI 页面。
- 删除就绪门禁仍因缺少 `.legacy-removal-evidence.json` 拒绝；未生成、伪造或绕过观察证据，未删除旧源码，未部署线上。

### 区分活动入口与回滚静态资产

- 审计确认活动源码及新构建入口不含 `AppList`、`AppTips`、应用市场等旧用户端标记；两个本地镜像的活动 `index.html` 也已与候选一致。
- 镜像目录中仍保留旧哈希 JS 资源，用于旧客户端缓存命中和回滚；这些资源未被新入口引用，当前不作为物理删除完成的证据。
- 删除旧前端源码和旧静态资源仍须等待真实回归、灰度及至少 24 小时稳定观察，不在本轮执行。

## 2026-08-31

### 整理 Lens 三件套并固化回复收尾规则

- 按项目三件套职责整理 `AGENTS.md`、`STATUS.md`、`CHANGELOG.md` 的记录边界：长期规则写入 `AGENTS.md`，当前交接快照写入 `STATUS.md`，已确认事实追加到 `CHANGELOG.md`。
- 在 `AGENTS.md` 新增回复收尾规则：每次回复必须说明代码质量是否遵从第一性原理与“无屎山代码”要求、工作树是否干净、垃圾是否清理到位；未检查项必须如实标注，不得推断。
- 更新 `STATUS.md` 日期为 2026-08-31，并记录本次仅整理文档的范围；未修改业务代码、配置、依赖、构建产物、服务器、数据库或外部平台。
- 本轮未运行代码测试、未部署、未排障、未执行实时 Git 工作树检查，也未执行垃圾扫描或清理；这些状态保持未知，不能写成“已通过”或“已清理”。
- 回滚方式：恢复本次对三件套文档的改动即可；不涉及业务代码或线上状态。

### 启动 AcademicGPT 学术前端重构目标

- 用户确认 Lens 前端以 `binary-husky/gpt_academic` 的学术任务流为参考，目标是面向老师和学生提供简单易用的 AcademicGPT 研究工作区；不复制第三方品牌、素材或未授权实现。
- 已将该重构设为当前目标：公网用户端最终只保留 AcademicGPT 风格界面，继续复用现有 99AI/NestJS 后端、`academic-4.0` 学术服务、账号、会话、文件、计费、分享和 `chat/dist` 部署契约。
- 已完成阶段 0 的只读架构盘点：确认 `chat` 为现有用户端，`service` 为后端网关，`academic-4.0` 为学术服务；确认当前 `main` 工作树存在未提交和未跟踪改动。
- 已确定执行约束：先隔离可回滚基线，再建立 API/NDJSON/本地数据迁移契约，先完成登录→新建研究→上传论文→问答→结果→刷新恢复的核心闭环，最后才清理旧 99AI 用户端实现。
- 已完成首轮只读契约清点：用户端现有调用覆盖认证、普通聊天、会话与分组、学术单能力、工作流、上传下载、余额套餐、订单支付、分享、模型配置、前台配置和微信登录；后续将按保留、迁移、隐藏、废弃建立逐项契约。
- 已确认 `build.sh` 的部署契约仍以 `chat/dist` 为用户端静态产物，并复制到 `service/public/chat` 与 `AIWebQuickDeploy/public/chat`；新前端不能形成第二套长期部署入口。
- 本轮尚未修改业务代码、删除文件、构建、部署或切换线上版本。
- 回滚方式：本轮仅新增目标与状态记录；恢复本次三件套文档改动即可，不涉及业务代码或线上状态。

### 落地学术流增量分帧契约

- 新增 `chat/src/domain/research/ndjson.ts`，提供无业务耦合的 `NdjsonStreamDecoder`，统一处理网络分片、换行边界和尾部残片。
- `chat/src/views/chat/chatBase.vue` 的学术聊天与科研工作流继续使用原有业务事件解析器，仅替换底层分帧实现；未改变接口地址、请求字段、消息落库字段或部署产物路径。
- 新增 `chat/src/domain/research/contracts.ts`，集中声明学术聊天、科研工作流请求结构与端点常量；`chat/src/api/academic.ts` 已接入这些类型，减少页面层直接依赖字符串端点和 `any` 请求体。
- 新增 `chat/src/domain/research/storage.ts`，以 `lens.research.v1` 版本化保存研究工作区偏好；`chat/src/store/modules/chat/helper.ts` 首次读取时从旧 `chatStorage` 迁移相关字段，并继续保留旧键写入以兼容现有会话。
- `Workspace/Home.vue` 已开始采用 AcademicGPT 研究工作区骨架：增加语义化研究入口标题/说明和线性分区分隔线；light/dark 主题新增研究区视觉令牌，未引入第三方依赖。
- 空工作区新增“提问”与“导入”两个首要动作：前者聚焦现有 composer，后者复用既有文件选择器与上传链路，未新增平行上传实现。
- 新增 `chat/src/domain/research/files.ts`，统一解析研究会话文件字段并仅保留文件名用于展示；空工作区和 Footer 共用该解析器，删除已保存文件仍调用原 `updateGroupInfo` 接口。
- 本轮未修改上传接口协议、文件存储位置或下载权限；未部署或修改服务器。
- 本地浏览器只读验收确认：空工作区显示“开始研究 / 提问 / 导入”；“提问”按钮聚焦研究输入框；“导入”按钮打开多选文件选择器。未选择或上传文件。由于本地开发服务器未连接后端，用户信息与会话初始化请求返回“服务暂时不可用”，联网核心闭环不计为通过。
- 测试结束已关闭临时浏览器标签并停止本地开发服务器；未读取浏览器 cookie、localStorage、token 或隐私数据。
- `chatBase.vue` 新增研究服务初始化状态机：用户信息或会话初始化失败时进入可见的“研究服务暂时不可用”状态，并提供重试动作；错误文案不暴露堆栈、路径或请求标识。
- 浏览器已验证该失败态真实渲染；重试入口可见。本轮仍未连接真实后端，因此联网登录、上传、学术问答和刷新恢复不计为通过。
- 失败态改动后再次通过 `vue-tsc --noEmit -p chat/tsconfig.json`、`vite build --mode=production` 与 `git diff --check`；构建仍仅保留既有动态/静态导入 warning。
- 联调只读检查确认 `chat/.env` 的 API 基址为本机 `127.0.0.1:9520`，当前无该端口监听；尝试用 `INIT_DB_ON_BOOT=false` 启动现有后端时，沙箱禁止 Redis 连接并返回 EPERM，已停止进程。未读取环境变量值、未修改数据库、未修改线上服务。
- 新增 `chat/src/domain/research/stream.ts`，把学术流字段别名、进度、正文/最终正文、推理和错误统一成单一事件契约，并接入 `chatBase.vue`。
- 新增 `chat/scripts/verify_research_contract.mjs` 与 `chat/package.json` 的 `verify:research-contract` 脚本；无新增依赖，离线覆盖 NDJSON 分片、尾部残片、字段别名、进度归一化和文件名清洗。
- `node scripts/verify_research_contract.mjs`、`vue-tsc --noEmit -p tsconfig.json`、`vite build --mode=production` 和 `git diff --check` 均通过；构建仍仅保留既有动态/静态导入 warning。
- `normalizeAcademicMessageSnapshot` 已接入 chat store 的 `normalizeChatRows`，刷新历史消息时统一恢复文件、推理、检索、向量、工作流和引用字段；离线契约脚本已增加蛇形字段恢复断言。
- 新增 `chat/src/domain/research/result.ts`，以纯 reducer 统一学术结果生命周期（idle、streaming、completed、failed、aborted）、进度、最终正文和结构化结果标记；`chatBase.vue` 已在流消费、异常与收尾路径接入，正文拼接仍由既有展示层负责。
- 离线契约脚本已覆盖结果 reducer 的进度、最终正文、完成和中止保护；`verify:research-contract`、`vue-tsc --noEmit -p tsconfig.json`、`vite build --mode=production` 和 `git diff --check` 最新均通过，构建仅保留既有动静态导入 warning。
- 新增 `chat/src/domain/research/starter.ts`，把研究入口任务、分区和后端能力选择器集中为声明式配置；`Workspace/Home.vue` 仅负责翻译、权限判断和交互编排，并补齐“代码解释”入口，未改变任何后端请求语义。
- 研究入口任务补充描述文案，帮助老师和学生在选择能力前理解用途；描述复用现有多语言资源，不新增依赖或第二套 UI 链路。
- `verify_research_contract.mjs` 已增加研究入口配置完整性断言，覆盖任务 ID 唯一性、分区引用完整性与代码解释入口存在性。
- `AcademicPanel.vue` 已接入研究目标概览：单能力显示当前学术能力，工作流显示步骤标签，未选择时显示下一步提示；该层只读现有 store 状态，不新增请求或权限逻辑。
- 浏览器真实渲染复核通过：本地未登录页面显示研究服务失败恢复条、研究入口描述、“代码解释”任务和能力面板空状态；未读取 cookie、localStorage、token 或其他隐私数据，测试标签与开发服务器已关闭。
- 新增 `chat/src/domain/research/sources.ts`，统一检索来源解析与 URL 安全归一化：只保留有标题的 http/https 外部来源，过滤 localhost、内网地址、URL 凭据和无效链接；消息来源列表已复用该解析器并补充 `noopener noreferrer`。
- 研究契约校验脚本已增加来源安全断言；`verify:research-contract`、`vue-tsc --noEmit -p tsconfig.json`、`vite build --mode=production` 和 `git diff --check` 最新均通过。
- 已完成公网用户端的旧应用广场入口隔离：`chatBase.vue` 不再渲染或加载 `AppList`，`Header` 不再显示应用广场切换/关闭控件；全局状态、兼容处理和后端能力暂不删除，保留回滚边界。
- 生产构建已确认用户端不再引入 AppList 动态模块；这只是入口隐藏，不等同于旧实现删除，删除仍受登录、上传、学术任务、支付、分享和灰度观察门槛约束。
- 浏览器真实渲染复核确认主界面直接进入学术工作区，存在“开始研究”和“当前任务”，不存在“应用广场/应用市场”入口；测试标签和开发服务器已关闭。
- 研究入口新增“开始文献综述”通用学术对话任务，采用独立 `chat` 模式直接预填综述框架提示；它不依赖插件列表，仍沿用现有 academic chat 请求、会话、计费和历史落库契约。
- 入口配置和多语言资源已同步更新，契约脚本覆盖任务模式与入口存在性；`verify:research-contract`、`vue-tsc --noEmit -p tsconfig.json`、`vite build --mode=production` 和 `git diff --check` 最新均通过。
- 浏览器真实渲染复核确认未登录首页显示“开始文献综述”、用途描述和研究输入框；未读取浏览器隐私数据，测试标签和开发服务器已关闭。
- `Message/Text.vue` 已补充学术结果状态徽标：根据既有 loading/status 字段显示进行中、已完成或失败，失败结果仍保留原重新生成入口；未新增状态真相源、接口字段或扣费逻辑。
- 状态反馈改动后 `verify:research-contract`、`vue-tsc --noEmit -p tsconfig.json`、`vite build --mode=production` 和 `git diff --check` 最新均通过。
- 研究入口、能力面板、来源、下载和后续操作已补充统一 `focus-visible` 焦点环；任务选择与单能力/工作流模式增加 `aria-pressed`，消息状态增加 live status，滚动到底部支持 Enter/Space 键。
- 契约脚本新增 Academic-only 主布局和关键无障碍属性静态断言；最新契约验证、类型检查、生产构建与 diff 校验均通过。
- 本地 `vue-tsc --noEmit` 与生产 `vite build --mode=production` 均通过；构建仅保留既有 `chat/src/store/modules/chat/index.ts` 动静态导入 warning。
- 本地直接执行 `chat/node_modules/.bin/vue-tsc --noEmit -p chat/tsconfig.json` 通过；`pnpm -C chat run type-check` 因 pnpm 非交互环境尝试清理 modules 目录而中止，未安装、升级或新增依赖。
- 本轮未删除旧 99AI 用户端、未修改后端、未构建、未部署、未重启服务或触碰服务器/数据库；工作树仍保留任务开始前已有的未提交与未跟踪改动。
- 回滚方式：删除新增分帧器并恢复 `chatBase.vue` 原有局部分帧代码；不涉及后端或线上状态。

## 2026-06-22

### Lens SEO/AIO 同日增量周检

- 目标：按自动化要求对 `https://lens.yutoai.net` 做同日增量 SEO/AIO 周检，避免重复生成 2026-06 已上线补丁，只复查公开线上状态、本地静态对应文件和浏览器真实标题。
- 读取上下文：已读取 `/Users/hkyutong/Work/Projects/YutoAI/AGENTS.md`、Lens `AGENTS.md`、`STATUS.md`、`CHANGELOG.md` 与 `/Users/hkyutong/.codex/automations/lens-seo-aio/STATUS.md`。
- 线上只读复查继续通过：首页、`/robots.txt`、`/sitemap.xml`、`/llms.txt`、`/llms-full.txt`、7 个 `/seo/*.html` 均返回 `HTTP 200`；旧本地法律页 `/legal/terms.html` 与 `/legal/privacy.html` 均返回 `HTTP 410`。
- 发现链路继续通过：`sitemap.xml` 返回 `application/xml`，包含 10 个唯一绝对 Lens URL，不含 `/legal/`，包含 `https://lens.yutoai.net/seo/literature-review.html`；`robots.txt` 声明 sitemap、开放 llms/seo 并阻止 `/api/`；`llms.txt` 与 `llms-full.txt` 覆盖 7 个 SEO 专题页，`llms-full.txt` 未命中旧 `YutoAI combines / YutoAI can work with / YutoAI is suited for` 口径。
- SEO 语义复查：7 个 SEO 专题页均未误命中 SPA fallback，canonical 与 OG URL 均为 `https://lens.yutoai.net/...` 绝对 URL，均具备 Twitter Card 和 Lens 品牌语义；`research-workspace.html`、`literature-review.html`、`faq.html` 有 JSON-LD，`paper-summary.html`、`arxiv-summary.html`、`latex-translation.html`、`academic-polishing.html` 暂无 JSON-LD，记录为非阻塞增强候选。
- Chrome 真实浏览器只读验收通过：运行时 `document.title` 为 `Lens - YutoAI 科研工作台`；首页可见 `Lens 使用教程` 入口；线上 JS 资产与本地 `Home.vue` 均确认入口指向 `https://docs.yutoai.net/lens/`；隐藏 SEO 快照为 `aria-hidden="true"`、1x1、overflow hidden，与用户操作界面隔离。已按 Chrome skill 要求 finalization，未保留测试标签页。
- 本地一致性复查：`chat/public` 与 `chat/dist` 的 robots、sitemap、llms 与 SEO 静态页无差异；`xmllint --noout chat/public/sitemap.xml` 通过；旧本地法律页源文件和构建产物均不存在；公开 SEO 页敏感词扫描未命中内部路径、服务器、密钥、数据库等词。
- 搜索引擎与 Cloudflare：本轮没有公开索引 URL 或发现文件变化，未再次调用 Google/Bing API；沿用本日状态，Google Search Console 仍待修复本机 OAuth token 后提交 sitemap，Bing Webmaster 上次读回为 `Pending`。Cloudflare 仅通过公开响应头只读观察，线上文件由 Cloudflare 返回，未调用 Cloudflare API、未刷新缓存、未改 DNS/WAF/配置。
- 本轮改动：仅更新本地 `STATUS.md`、`CHANGELOG.md` 与自动化记忆；未修改 SEO 源文件、未构建、未上传、未部署、未重启服务、未改服务器、未改数据库或业务链路，未修改 `AGENTS.md`。
- 风险与下一步：Google Search Console token 需要重新授权或修复后再提交 sitemap 并读回；下次周检继续复查 Bing feed 是否从 `Pending` 进入可抓取/成功状态；如要补齐 4 个中文工作流页 JSON-LD，应作为单独最小 SEO 静态补丁处理。
- 回滚方式：本轮没有业务或线上改动；如需回滚，仅还原本次对 `STATUS.md`、`CHANGELOG.md` 和自动化记忆的记录即可。

### Lens SEO/AIO 周检

- 目标：对 `https://lens.yutoai.net` 执行每周 SEO/AIO 周检，复查公开线上页面、AI 抓取器发现链路、旧法律页删除语义和搜索引擎提交状态。
- 读取上下文：已读取 `/Users/hkyutong/Work/Projects/YutoAI/AGENTS.md`、Lens `AGENTS.md`、`STATUS.md`、`CHANGELOG.md` 与自动化记忆。
- 线上只读复查通过：首页、`/robots.txt`、`/sitemap.xml`、`/llms.txt`、`/llms-full.txt`、7 个 `/seo/*.html` 均返回 `HTTP 200`；旧本地法律页 `/legal/terms.html` 与 `/legal/privacy.html` 均返回 `HTTP 410`。
- 发现链路通过：`sitemap.xml` 返回 `application/xml`，包含 10 个唯一绝对 Lens URL，不含 `/legal/`，并包含 `https://lens.yutoai.net/seo/literature-review.html`；`robots.txt` 声明 sitemap、开放 llms/seo 并阻止 `/api/`；`llms.txt` 与 `llms-full.txt` 均覆盖 sitemap 中的 SEO 专题页，`llms-full.txt` 已使用 `Lens combines` 主语。
- SEO 语义通过：6 个旧 SEO 专题页已具备 Twitter Card；`/seo/literature-review.html` 返回静态英文页，标题为 `AI Literature Review Workspace | Lens by YutoAI`，canonical、OG URL、Twitter Card 与 JSON-LD 均存在；SEO 专题页未误命中 SPA fallback。
- Chrome 真实浏览器只读验收通过：运行时浏览器标题为 `Lens - YutoAI 科研工作台`；首页存在 `Lens 使用教程` 入口，本地源码确认入口打开 `https://docs.yutoai.net/lens/`；隐藏 SEO 快照为 `aria-hidden="true"`、1x1、overflow hidden，与用户操作界面隔离。
- Bing Webmaster：已最小范围提交 `https://lens.yutoai.net/sitemap.xml`，读回站点为 `https://yutoai.net/`，feed URL 为 `https://lens.yutoai.net/sitemap.xml`，类型 `Sitemap`，状态 `Pending`，`UrlCount=10`。
- Google Search Console：本机 OAuth token 刷新返回 `400`，本轮未能提交 sitemap；未打印 token、Authorization header、Keychain 原始输出或凭据文件内容。
- Cloudflare：仅通过公开响应头只读观察，线上文件由 Cloudflare 返回，公开文件多为 `cf-cache-status: DYNAMIC`，`robots.txt` 为 `MISS`；未调用 Cloudflare API、未刷新缓存、未改 DNS/WAF/配置。
- 本轮改动：仅更新本地 `STATUS.md`、`CHANGELOG.md` 与自动化记忆；未修改 SEO 源文件、未构建、未上传、未部署、未重启服务、未改服务器、未改数据库或业务链路，未修改 `AGENTS.md`。
- 风险与下一步：Google Search Console token 需要重新授权或修复后再提交 sitemap 并读回；下次周检继续复查 Bing feed 是否从 `Pending` 进入可抓取/成功状态。
- 回滚方式：本轮没有业务或线上改动；如需回滚，仅还原本次对 `STATUS.md`、`CHANGELOG.md` 和自动化记忆的记录即可。

## 2026-06-21

### 清理旧 Playwright CLI 临时目录

- 目标：清理确认无用的本地 Playwright 临时产物。
- 判断：`output/playwright/.playwright-cli` 只包含 2026-04 的 Playwright snapshot/截图，体积约 576K，可重建且不含业务数据、源码、配置、密钥或正式产物。
- 执行：删除 `output/playwright/.playwright-cli`。
- 验证：根目录复查 `find ... -path '*/.playwright-cli*'` 无残留。
- 回滚：如需同类证据，重新运行对应 Playwright 检查生成；业务代码无需回滚。

### Chrome Codex 插件优先级规则统一

- 目标：按用户要求把根目录和各项目三件套中的浏览器执行默认面统一为 Chrome Codex 插件，同时保留 Playwright Chrome runtime 的 headless 测试价值。
- 结果：系统 Google Chrome + Codex Chrome Extension 已复测连通；各项目三件套已写入“优先 Chrome skill / Codex Chrome Extension、Edge 仅备用、Playwright Chrome runtime 用于公开读取/截图/流程测试/无登录态验收”的规则。
- 影响范围：仅本地三件套 Markdown 规则与状态记录；未修改业务代码、配置、依赖、构建产物、服务器或线上数据。
- 边界：未读取 cookie、localStorage、sessionStorage、密码、token 或浏览器隐私数据；未发帖、评论、私信、提交表单、上传或付款。
- 回滚：还原本次对 `AGENTS.md` / `AGENTS.md` / `STATUS.md` / `CHANGELOG.md` 中“Chrome Codex 插件优先级规则统一”相关段落即可。


# 0.0.97 (2026-06-18)
- 完成 Lens 英文 literature-review 公开 SEO/AIO 页受限上线：本地 `chat/public/seo/literature-review.html`、`sitemap.xml`、`llms.txt`、`llms-full.txt` 已构建并最小同步到线上 `public/chat` 对应路径。
- 本地验证通过：`chat ./node_modules/.bin/vue-tsc --noEmit` 通过；`chat ./node_modules/.bin/vite build --mode=production` 通过，仅保留既有 `chat/src/store/modules/chat/index.ts` 动静态导入 warning；`git diff --check`、`xmllint --noout chat/public/sitemap.xml`、公开文件敏感词扫描均通过。
- 部署前只读确认：远端 `public/chat` 与 `public/chat/seo` 存在，`/seo/literature-review.html` 同步前命中 SPA fallback，非静态英文页；`9520` 主服务与 `38000` 学术服务在线。
- 服务器同步范围：已创建备份 `/www/wwwroot/Lens/AIWebQuickDeploy/backups/public-chat-before-literature-review-20260618191618.tar.gz`，随后仅同步 `chat/dist/sitemap.xml`、`chat/dist/llms.txt`、`chat/dist/llms-full.txt`、`chat/dist/seo/literature-review.html`；未重启服务、未改 PM2、未刷新 Cloudflare、未改数据库、未碰后台/支付/密钥/环境变量/日志/用户数据。
- 线上验证通过：`https://lens.yutoai.net/seo/literature-review.html?v=20260618191618` 返回 HTTP 200，标题为 `AI Literature Review Workspace | Lens by YutoAI`；公网 `sitemap.xml`、`llms.txt`、`llms-full.txt` 均命中 `literature-review.html`；主站 `https://lens.yutoai.net/?v=20260618191618` 仍返回 HTTP 200；远端 `9520` 和 `38000` 端口保持在线。
- 边界：本轮未提交搜索引擎，未发帖/评论/私信，未提交海外目录，未注册外部账号。
- 回滚方式：恢复备份 `/www/wwwroot/Lens/AIWebQuickDeploy/backups/public-chat-before-literature-review-20260618191618.tar.gz` 中的 `public/chat/sitemap.xml`、`public/chat/llms.txt`、`public/chat/llms-full.txt` 和 `public/chat/seo`；本地回滚则删除 `chat/public/seo/literature-review.html` 并从三份发现文件移除该 URL。

# 0.0.96 (2026-06-18)
- 新增 Lens 海外研究者 SEO/AIO 入口：`chat/public/seo/literature-review.html`，英文定位为 AI literature review workspace，覆盖 paper triage、PDF notes、source comparison、review drafting 和 academic writing refinement。
- 公开发现链路同步接入：`chat/public/sitemap.xml` 新增 `https://lens.yutoai.net/seo/literature-review.html`，`chat/public/llms.txt` 与 `chat/public/llms-full.txt` 增加 literature review 页面和相关用途说明。
- 安全边界：页面仅展示研究者可理解的价值、场景、边界和公开入口；不包含内部路径、服务器信息、后台字段、客户资料、审计细节、风控阈值或未公开业务规则。
- 验证：`git diff --check -- chat/public/seo/literature-review.html chat/public/sitemap.xml chat/public/llms.txt chat/public/llms-full.txt` 无输出；`xmllint --noout chat/public/sitemap.xml` 通过；已确认新页包含 canonical、OG URL、Twitter Card 和 JSON-LD；公开文件敏感词扫描未命中内部路径、服务器、密钥、数据库等词。
- 边界：本轮未运行生产构建，未部署服务器，未刷新缓存，未提交搜索引擎，未注册账号，未发帖/评论/私信，未提交海外目录。
- 回滚方式：删除 `chat/public/seo/literature-review.html`，并从 `chat/public/sitemap.xml`、`chat/public/llms.txt`、`chat/public/llms-full.txt` 移除 literature review 相关条目。

# 0.0.95 (2026-06-17)
- 强化 Lens 长期代码质量规则：用户要求“确保所有代码像诗一样优雅，不要屎山代码”，已写入 `AGENTS.md`。新规则要求所有新写和重构代码表达准确、节奏清楚、无多余分支、无重复堆叠、无暧昧命名；宁可收窄范围，也不要把能运行但难理解、难回滚、难扩展的代码留进主路径。
- 本次仅更新本地 `AGENTS.md`、`STATUS.md` 和 `CHANGELOG.md`；未修改业务代码、未构建、未部署、未改服务器、未刷新缓存、未触碰数据库或线上服务。

# 0.0.94 (2026-06-16)
- 记录 Lens 专属 SEO/AIO 自动部署授权：用户确认以后 Lens SEO/AIO 自动化完成本地优化并通过校验后，若改动仅涉及 `lens.yutoai.net` 的公开 SEO/AIO 范围，例如 metadata、robots、sitemap、llms、canonical、JSON-LD、Open Graph、Twitter Card 和公开可索引静态页内容，可以按最小范围自动部署到线上并在完成后汇报。
- 同步保留自动部署安全边界：禁止自动触碰数据库、支付、后台、密钥、环境变量、Nginx、PM2、Cloudflare DNS/WAF、用户数据、日志、上传文件、非 SEO 业务源码或高风险服务器状态；如部署需要重启服务、刷新缓存、修改服务器配置、迁移数据库或覆盖非 SEO 文件，仍必须先停止并请求用户明确授权。
- 完成 Lens 2026-06 SEO/AIO 补丁受限自动部署：本地通过 `git diff --check`、`chat ./node_modules/.bin/vue-tsc --noEmit` 与 `chat ./node_modules/.bin/vite build --mode=production`；构建仅保留既有 `chat/src/store/modules/chat/index.ts` 动静态导入 warning。部署前只读确认远端 `public/chat` 与 `public/chat/seo` 目录存在，`9520` 仍由 PM2 监听。
- 服务器同步范围保持最小：已创建备份 `/www/wwwroot/Lens/AIWebQuickDeploy/backups/public-chat-before-seo-autodeploy-20260616232242.tar.gz`，随后仅同步 `chat/dist/index.html`、`chat/dist/llms-full.txt` 与 `chat/dist/seo/` 到线上 `public/chat` 对应路径；未重启服务、未改 PM2、未刷新 Cloudflare、未改数据库、未碰后台/支付/密钥/环境变量/日志/用户数据。
- 部署后验证通过：远端文件校验确认 `index.html` 包含 `Lens by YutoAI 学术工作台`、`llms-full.txt` 包含 `Lens combines`、所有线上 `public/chat/seo/*.html` 包含 `twitter:card`；公网 `https://lens.yutoai.net/?v=20260616232242` 返回 `HTTP 200`，`Last-Modified` 为 `Tue, 16 Jun 2026 14:17:41 GMT`，公网 `llms-full.txt` 与 `seo/paper-summary.html` 已命中新内容。

# 0.0.93 (2026-06-15)
- 执行 Lens SEO/AIO 每周只读复查：已读取根目录 `AGENTS.md`、Lens `AGENTS.md`、`STATUS.md`、`CHANGELOG.md` 与自动化记忆；本次终端 `curl` 可直接访问线上 `https://lens.yutoai.net/`，已抓取首页、`/robots.txt`、`/sitemap.xml`、`/llms.txt`、`/llms-full.txt`、6 个 `/seo/*.html` 和旧法律页 `/legal/terms.html`、`/legal/privacy.html`。
- 线上基础状态通过：首页、robots、sitemap、llms 与 6 个 SEO 专题页均返回 `HTTP 200`，旧本地法律页均返回 `HTTP 410`；`robots.txt` 声明 sitemap、开放 llms/seo 并阻止 `/api/`；`sitemap.xml` 返回 `application/xml`，包含 9 个唯一绝对 URL 且不含 `/legal/`；6 个 SEO 专题页均未误命中 SPA fallback，canonical 与 OG URL 均为 `https://lens.yutoai.net/...` 绝对 URL。
- 发现线上与本地补丁未对齐：线上 6 个 `/seo/*.html` 仍缺少本地已补的 Twitter Card；线上 `/llms-full.txt` 仍使用 `YutoAI combines / YutoAI can work with / YutoAI is suited for` 三处旧主语，本地 `chat/public/llms-full.txt` 与 `chat/dist/llms-full.txt` 已收敛为 `Lens`。线上公开文件 `Last-Modified` 均为 `Thu, 14 May 2026 05:58:00 GMT`，说明 2026-06 本地 SEO/AIO 补丁尚未完整部署。
- 本地一致性复核通过：`chat/public/seo` 与 `chat/dist/seo` 无差异，`chat/public/llms-full.txt` 与 `chat/dist/llms-full.txt` 无差异，`robots.txt` 和 `sitemap.xml` 的 public/dist 产物一致。旧本地法律页源文件和构建产物仍不存在。
- 本轮未修改 SEO 源文件、未构建、未上传、未部署、未刷新 Cloudflare 缓存、未提交 Google/Bing、未重启服务、未修改服务器、未读取 Keychain 凭据、未改数据库或业务链路；仅更新本地 `STATUS.md`、`CHANGELOG.md` 与自动化记忆。若后续人工授权上线，最小范围为 `chat/dist/index.html`、`chat/dist/llms-full.txt` 与 `chat/dist/seo/*.html` 到线上 `public/chat` 对应路径，先备份再零停机同步，回滚时恢复同步前备份。

# 0.0.92 (2026-06-08)
- 执行 Lens SEO/AIO 每周只读复查：已读取根目录 `AGENTS.md`、Lens `AGENTS.md`、`STATUS.md`、`CHANGELOG.md` 与自动化记忆；确认 2026-06-01 本地 SEO/AIO 补丁仍在工作区，尚未部署。
- 本地公开发现链路复核通过：`chat/public/sitemap.xml` 包含 9 个唯一绝对 URL；`robots.txt` 声明 sitemap、开放 llms/seo 并阻止 `/api/`；`llms.txt` 与 `llms-full.txt` 覆盖全部 6 个专题页；6 个 `chat/public/seo/*.html` 均包含绝对 canonical、OG URL、Twitter Card、绝对 Twitter image 和 Lens 品牌语义，且未误命中 SPA 根容器；旧本地法律页源文件与构建产物均不存在。
- 完成低风险本地 SEO/AIO 优化：`chat/public/llms-full.txt` 将三处能力说明主语从泛品牌 `YutoAI` 收敛为 `Lens`，并通过生产构建同步到 `chat/dist/llms-full.txt`。影响范围仅 AI 抓取器扩展说明文件，不改变登录、上传、聊天、学术调用、科研流水线、套餐、支付、数据库或用户数据。
- 本地验证通过：静态一致性检查、`git diff --check`、`chat ./node_modules/.bin/vue-tsc --noEmit` 与 `chat ./node_modules/.bin/vite build --mode=production` 均通过；构建仅保留既有 `chat/src/store/modules/chat/index.ts` 动静态导入 warning。
- 历史运行地址及相关连接元数据已脱敏，原始值不再保留于本记录。
- 本轮未上传、未部署、未刷新缓存、未提交 Google/Bing、未重启服务、未修改服务器、未读取 Keychain 凭据、未改数据库或业务链路。若后续人工授权上线，先备份线上 `public/chat`，再零停机同步除 `index.html` 外静态文件，最后覆盖 `index.html`；回滚时恢复同步前备份。

# 0.0.91 (2026-06-08)
- 执行 Lens SEO/AIO 每周只读复查：已读取根目录 `AGENTS.md`、Lens `AGENTS.md`、`STATUS.md`、`CHANGELOG.md` 与自动化记忆；确认 2026-06-01 本地 SEO/AIO 补丁仍存在于工作区和 `chat/dist`，但尚未部署。
- 本地 SEO/AIO 状态保持完整：`chat/index.html` 的隐藏 SEO 快照与 noscript 主语为 `Lens by YutoAI`；6 个 `chat/public/seo/*.html` 均保留 `twitter:card / twitter:title / twitter:description / twitter:image`，图片统一为绝对 URL `https://lens.yutoai.net/logo.png`；sitemap 仍包含 9 个唯一绝对 URL，robots 声明 sitemap、开放 llms/seo 并阻止 `/api/`，两份 llms 文档覆盖全部专题页；旧本地法律页源文件与构建产物均不存在。
- 本地验证通过：已执行静态一致性检查、`git diff --check`、`chat ./node_modules/.bin/vue-tsc --noEmit` 与 `chat ./node_modules/.bin/vite build --mode=production`；构建仅保留既有 `chat/src/store/modules/chat/index.ts` 动静态导入 warning。
- 历史运行地址及相关连接元数据已脱敏，原始值不再保留于本记录。
- 本轮未上传、未部署、未刷新缓存、未提交 Google/Bing、未重启服务、未修改服务器、未读取 Keychain 凭据、未改数据库或业务链路。若后续人工授权上线，先备份线上 `public/chat`，再零停机同步除 `index.html` 外静态文件，最后覆盖 `index.html`；回滚时恢复同步前备份。

# 0.0.90 (2026-06-01)
- 执行 Lens SEO/AIO 首次自动化周检：本地静态审计确认 `chat/index.html`、`robots.txt`、`sitemap.xml`、两份 llms 文档与 6 个专题页均存在；sitemap 包含 9 个唯一绝对 URL，robots 已声明 sitemap、开放 llms/seo 发现链路并阻止 `/api/`，两份 llms 文档均覆盖全部专题页。
- 补齐专题页 Twitter Card：`chat/public/seo/*.html` 的 6 个公开专题页新增 `twitter:card / twitter:title / twitter:description / twitter:image`，图片统一为绝对 URL `https://lens.yutoai.net/logo.png`。影响范围仅公开 SEO 元数据；不改变页面业务逻辑、登录、上传、聊天、学术调用、科研流水线、套餐、支付或数据库。
- 收敛首页抓取器品牌语义：`chat/index.html` 的隐藏 SEO 快照标题、简介与 noscript 文案统一改为 `Lens by YutoAI` 主语，避免抓取器继续只看到泛品牌 `YutoAI`。影响范围仅静态抓取器语义与禁用 JavaScript 时的提示文本。
- 本地验证通过：已执行静态一致性检查、`git diff --check`、`chat ./node_modules/.bin/vue-tsc --noEmit` 与 `chat ./node_modules/.bin/vite build --mode=production`；构建仅保留既有 Vite 动静态导入 warning。`chat/dist` 已本地生成并确认专题页与 public 源文件一致，旧 `legal/terms.html` 与 `legal/privacy.html` 构建产物均不存在。
- 线上复查受阻：终端沙箱无法解析 `lens.yutoai.net`；Chrome 插件连接成功，但浏览器安全策略明确阻止访问 `https://lens.yutoai.net` 且禁止绕过。因此本轮没有独立确认线上 HTTP 状态、Content-Type、SPA fallback、旧法律页 `410`、Cloudflare 缓存、Google Search Console 或 Bing Webmaster 状态。未部署、未上传、未刷新缓存、未提交搜索引擎、未重启服务、未改服务器或数据库。后续如获人工授权上线，先备份线上 `public/chat`，再零停机同步除 `index.html` 外静态文件，最后覆盖 `index.html`；回滚时恢复同步前备份。

# 0.0.89 (2026-05-14)
- 图片全局解析正式启用：`admin/src/views/models/key.vue` 中图片解析的 `全局解析` 选项已解除禁用，提示文案改为“先用全局视觉模型解析图片，再把图片内容交给当前模型”；`service/src/modules/chat/chat.service.ts` 新增全局图片摘要前置逻辑，会提取上传图片、调用全局视觉模型生成安全摘要，再把摘要注入当前模型输入。影响范围：图片上传后的聊天输入构造；不改变逆向格式、GPT Vision、文件解析、扣费、套餐或学术服务。回滚方式：恢复本次 admin 与 chat service 改动，重新构建并同步 `public/admin` 与 `dist`。
- 首页新增 Lens 教程入口：`chat/src/views/chat/components/Workspace/Home.vue` 在首页主能力区上方增加低噪音文本导航，打开 `https://docs.yutoai.net/lens/`；五套语言包新增教程文案。影响范围：仅首页导航展示；不改变能力入口、上传、编排或业务接口。回滚方式：移除该按钮和语言包 key 后重新构建同步 `public/chat`。
- 浏览器标题延续修正：`chat/src/App.vue` 的运行时 SEO 标题保持 `Lens - YutoAI 科研工作台`，让标签页、Open Graph title 和 Twitter title 都以 Lens 为主语。
- 本地验证通过：已执行五套 locale JSON 解析、`chat ./node_modules/.bin/vue-tsc --noEmit`、`admin ./node_modules/.bin/vue-tsc --noEmit`、`service ./node_modules/.bin/tsc -p tsconfig.json --noEmit`、`service ./node_modules/.bin/nest build`、`chat ./node_modules/.bin/vite build --mode=production`、`admin ./node_modules/.bin/vite build --mode=production`；构建仅保留既有 Vite/Browserslist/chunk warning。
- 已完成服务器同步：同步前备份 `public/chat`、`public/admin` 与 `dist` 到 `/www/wwwroot/Lens/AIWebQuickDeploy/backups/public-chat-before-global-image-20260514135843.tar.gz`、`public-admin-before-global-image-20260514135843.tar.gz`、`service-dist-before-global-image-20260514135843.tar.gz`；随后同步最新 `chat/dist`、`admin/dist`、`service/dist` 并 reload `www` 用户下 `Lens` PM2 到 PID `2560554`，`lens-academic` 仍为 PID `1307221` 未重启。服务器本机 `127.0.0.1:9520` 与公网 `https://lens.yutoai.net/` 均返回 `HTTP 200`，公网当前脚本 `js/index-d5cf264c.js` 返回 `application/javascript` 并包含 `Lens - YutoAI 科研工作台` 与 `Lens 使用教程` 标记。

# 0.0.88 (2026-05-14)
- 浏览器标签品牌顺序修正：`chat/src/App.vue` 的运行时 SEO 标题从 `YutoAI - AI 科研工作台` 改为 `Lens - YutoAI 科研工作台`，让标签页、Open Graph title 和 Twitter title 都以 Lens 为主语。影响范围：仅前端标题与分享标题展示；不改变后台 `siteName` 配置、业务逻辑、支付、套餐、学术接口或服务器进程。回滚方式：恢复该常量后重新构建并同步 `chat/dist`。
- 本地验证通过：已执行 `chat ./node_modules/.bin/vue-tsc --noEmit` 与 `chat ./node_modules/.bin/vite build --mode=production`；构建仅保留既有 Vite 动静态导入 warning。

# 0.0.87 (2026-05-14)
- 中文套餐名改造：`Plus / Pro / Max` 的中文展示与线上商品名统一为“学生版 / 教授版 / 至尊版”。影响范围包括会员中心套餐卡片、设置页用户必读、后台套餐管理提示、学术能力权限错误文案和前后端套餐识别逻辑；内部权限仍按原套餐权重和 `plus/pro/max` 层级工作，并兼容 `Plus / Pro / Max`、旧中文名和繁体写法。回滚方式：恢复本次代码并把 `crami_package.id IN (17,18,19)` 的 `name` 从备份恢复为原值。
- 价格与权限保持不变：线上 `crami_package` 只更新 `name` 字段，`price=45/140/210` 人民币付款价、`usdPrice=7/20/30` 美元展示价、`weight=10/20/30` 权限权重均未改变；学术权限边界仍是学生版轻量能力、教授版最多 2 步编排、至尊版最多 3 步编排。
- 本地验证通过：已执行中文/繁体语言包 JSON 解析、`chat ./node_modules/.bin/vue-tsc --noEmit`、`admin ./node_modules/.bin/vue-tsc --noEmit`、`service ./node_modules/.bin/tsc -p tsconfig.json --noEmit`、`service ./node_modules/.bin/nest build`、`chat ./node_modules/.bin/vite build --mode=production`、`admin ./node_modules/.bin/vite build --mode=production`；构建仅保留既有 Vite/Browserslist/chunk warning。
- 已完成服务器同步：同步前备份 `public/chat`、`public/admin`、`dist` 与 `crami_package` 到 `/www/wwwroot/Lens/AIWebQuickDeploy/backups/*before-plan-rename-20260514130610*`；随后同步最新 `chat/dist`、`admin/dist`、`service/dist` 并更新 `crami_package` 三条套餐名。`www` 用户下 `Lens` PM2 已 reload 为 PID `2464064`，`lens-academic` 仍为 PID `1307221` 未重启；`127.0.0.1:9520` 与 `https://lens.yutoai.net/` 均返回 `HTTP 200`，套餐接口已返回“至尊版 / 教授版 / 学生版”。

# 0.0.86 (2026-05-08)
- 历史运行地址及相关连接元数据已脱敏，原始值不再保留于本记录。
- 服务器只读确认：Nginx 正常监听 `80/443`，学术后端 `38000` 正常返回，`/www/server/panel/vhost/nginx/node_Lens.conf` 将 `lens.yutoai.net` 反代到 `127.0.0.1:9520`，但当前 `9520` 未监听且本机 curl 返回 connection refused。
- 服务器 PM2 状态：root PM2 仅有 `lens-academic` 在线，www PM2 无 Lens 主应用；`/www/wwwroot/Lens/AIWebQuickDeploy/pm2.conf.json` 存在 Lens 主应用配置但当前未托管运行。推断直接原因是 Lens 主 Node 应用进程退出或未自启，导致 Nginx 上游不可用。
- 用户明确授权修复后，已在 `/www/wwwroot/Lens/AIWebQuickDeploy` 使用现有 `pm2.conf.json` 以 `www` 用户启动 Lens 主应用，并执行 `pm2 save` 写入 `/home/www/.pm2/dump.pm2`。当前 `www` PM2 中 `Lens` 进程在线，版本 `4.3.0`，PID `187862`，`9520` 已恢复监听；root PM2 中 `lens-academic` 仍保持 PID `1307221` 在线，本轮未重启学术后端、未改 Nginx、未改代码、未改数据库、未清 Cloudflare 缓存。
- 恢复验证：服务器本机 `http://127.0.0.1:9520/` 返回 `HTTP 200`；公网 `https://lens.yutoai.net/` 返回 `HTTP 200`，内容类型 `text/html; charset=UTF-8`。直接原因已解除。后续风险是需要确认服务器开机自启是否会恢复 `www` 用户 PM2 dump；当前至少已避免继续依赖一次性 SSH/setsid 会话。

# 0.0.85 (2026-04-24)
- 修复 Lens 根路径 sitemap 发现链路：新增静态 `chat/public/sitemap.xml`，使 `https://lens.yutoai.net/sitemap.xml` 直接返回 XML，而不再落到 SPA 首页；`chat/public/robots.txt` 同步追加 `Sitemap: https://lens.yutoai.net/sitemap.xml`。影响范围：仅前端公开 SEO 静态文件与搜索引擎发现链路，不改变聊天、登录、支付、学术调用或学术服务端口。回滚方式：删除静态 `sitemap.xml` 并恢复 `robots.txt` 到上一版后重新构建同步 `chat/dist`。
- 统一公开 SEO 绝对 URL：`chat/index.html`、`chat/public/llms.txt`、`chat/public/llms-full.txt` 与全部 `chat/public/seo/*.html` 的 canonical、Open Graph URL、图片 URL 与 LLM 文档链接已改为 `https://lens.yutoai.net/...` 绝对地址，避免 Google/Bing/AI 抓取器解析相对路径失败。影响范围：仅公开 SEO 元信息和 AI 文档入口；不改变真实用户界面交互逻辑。回滚方式：恢复上述静态文件到本次改动前版本并重新构建同步。
- Lens 品牌语义补齐：首页与专题 SEO 落地页的 title、description、FAQ 文案和 JSON-LD 结构化数据已统一成 `Lens by YutoAI / Lens 学术工作台` 口径，增强 Lens 子域名独立收录与品牌识别。影响范围：仅公开元信息、静态落地页文本与结构化数据。回滚方式：恢复 `chat/index.html` 与 `chat/public/seo/*.html` 到上一版并重新构建。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仅有既有 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。`chat/dist/index.html`、`chat/dist/sitemap.xml`、`chat/dist/robots.txt` 与全部 `chat/dist/seo/*.html` 已确认包含绝对 canonical/OG URL 与静态 sitemap 内容。
- 已完成 GitHub 与服务器同步：提交 `4713cb0 feat: tighten lens seo discovery` 已推送到 `origin/main`；`chat/dist` 已零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`。同步前已在服务器创建备份 `backups/public-chat-before-seo-20260424231731.tar.gz`；本轮未重启 `9520` 或 `38000`，当前监听进程仍为 `503151` 与 `4048524/2995907`。
- 已完成最小范围 Cloudflare 缓存刷新：按 URL 级别清理了首页、`index.html`、`sitemap.xml`、`robots.txt`、`llms*.txt` 和 6 个 `/seo/*.html`；线上回查确认 `https://lens.yutoai.net/` 默认 URL 已切到新 title/canonical/og，`https://lens.yutoai.net/sitemap.xml` 已返回 `application/xml` 与新静态内容。`robots.txt` 默认 URL 仍短暂命中旧缓存，但带查询参数已返回新版本且远端源文件已同步，预计按当前缓存策略自然更新。

## 0.0.84 (2026-04-22)
- 全员赠送一个月 Pro 会员：按用户要求直接在 Lens 线上数据库为全部未删除账号发放 Pro 会员权益。执行前只读确认 `users` 未删除账号共 346 个，角色分布为 `super=1 / user=1 / viewer=343 / views=1`；Pro 套餐为 `id=18 / weight=20 / days=30 / 3600普通积分 / 360高级积分 / 25顶级额度`。影响范围：仅服务器数据库 `user_balances` 与 `account_log`；不修改代码、配置、静态资源、上传文件、日志、Nginx、PM2 或学术服务。
- 发放规则：所有未删除用户均叠加 Pro 套餐对应的会员额度；普通/历史套餐/Plus/无套餐用户设置为 `packageId=18` 并获得从当前时间起至少 30 天的 Pro 会员；如果未来存在有效 Max 等更高等级用户，规则为保留高等级套餐并延长一个月，避免降级。本次线上实际结果为 346 个用户全部变为 `packageId=18`，新增 346 条 `account_log` 管理员赠送记录。
- 备份与回滚：执行前已备份 `users / user_balances / account_log / crami_package` 到服务器 `backups/all-users-before-pro-gift-20260422233758.sql`。回滚方式：在确认影响范围后从该 SQL 恢复上述表，或针对本次 `uid` 前缀 `pro-gift-` 的 `account_log` 与 `2026-04-22 23:38` 附近的 `user_balances` 更新做定向恢复。
- 结果验证：赠送后 `user_balances` 中 346 个未删除用户均为 `packageId=18`，赠送日志 346 条；会员最早到期时间为 `2026-05-22 23:38:00`，最晚到期时间为 `2026-06-10 16:54:44`。线上 `https://lens.yutoai.net/?v=progift20260422233758` 与后台入口均返回 `HTTP 200`；本轮未重启 `9520` 或 `38000`，未启动 Playwright/Chromium，收尾无 SSH/SCP/Chromium/Playwright 残留进程。

## 0.0.83 (2026-04-22)
- 支付确认页价格展示继续统一为美元：`chat/src/components/Settings/MemberPayment.vue` 不再在商品支付页展示人民币 `￥`，顶部“需要支付”、右侧“折合每月”、年付“按月购买”和“节省”均改为读取后端 `displayPrice / displayMonthlyEquivalentPrice / displayOriginalTotal / displaySaveAmount` 并显示 `$ ... USD`。影响范围：仅支付确认页的价格展示文案；订单创建仍只传 `goodsId / payType / billingCycle`，真实订单金额、支付通道结算和会员到账仍由后端人民币 `price` 计费快照决定。回滚方式：恢复 `MemberPayment.vue` 到上一版并重新构建同步 `chat/dist`。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仅有既有 Vite 动静态导入 warning。
- 已完成 GitHub 与服务器同步：提交 `d167e7f fix: show usd price on payment page` 已推送到 `origin/main`；最新 `chat/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`。同步前已备份 `public/chat` 到 `backups/public-chat-before-usd-payment-20260422162508.tar.gz`；本轮未重启 `9520` 或 `38000`，主服务保持 PID `503151`。线上 `https://lens.yutoai.net/?v=20260422162508` 与后台入口均返回 `HTTP 200`，服务器前端产物已确认包含 `USD/月` 与 `USD/年` 展示文案，AppleDouble `._*` 元数据文件为 0。

## 0.0.82 (2026-04-22)
- 套餐价格模型纠偏：会员套餐不再用同一个 `price` 同时承担前台美元展示和付款金额；后端 `crami_package` 新增 `usdPrice` 字段作为前台会员页美元展示价，原 `price` 保持人民币付款价。影响范围：套餐查询、会员页展示、支付确认页、后台套餐管理和订单计费快照；不改变会员到账、卡密兑换、学术权限和支付回调链路。回滚方式：回退本次代码并从服务器 `backups/crami_package-before-usd-price-20260422160331.sql` 恢复 `crami_package` 表，再重新构建同步。
- 前台显示与付款分离：`chat/src/components/Settings/MemberCenter.vue` 的 Plus / Pro / Max 官方卡片展示美元 `displayPrice`，因此 Plus/Pro/Max 月付显示分别为 `$6 / $20 / $30`；`chat/src/components/Settings/MemberPayment.vue` 支付确认页始终显示人民币 `price`，因此付款仍为 `￥45 / ￥140 / ￥210`。年付同样分别用美元展示字段和人民币结算字段计算折扣，不再出现 `$45` 这种把人民币错当美元展示的问题。
- 后台套餐管理补齐双价格：`admin/src/views/package/package.vue` 的套餐列表和编辑弹窗新增“美元展示价”和“人民币付款价”两个独立字段，后台可分别配置前台展示美元价与实际支付人民币价。`service/src/modules/crami/dto/createPackage.dto.ts`、`crami.service.ts`、`cramiPackage.entity.ts` 和 `package-pricing.util.ts` 已同步支持 `usdPrice` 与 `displayPrice` 计费快照。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`./admin/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production`、`./admin/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`；构建仅有既有 Vite chunk/import warning 和 Browserslist 提示。
- 已完成 GitHub 与服务器同步：提交 `69e6640 fix: split usd display and cny payment prices` 已推送到 `origin/main`；`chat/dist`、`admin/dist`、`service/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy`。同步前已备份 `public/chat`、`public/admin`、`dist` 与 `crami_package`，备份路径为 `backups/public-chat-before-split-price-20260422160331.tar.gz`、`backups/public-admin-before-split-price-20260422160331.tar.gz`、`backups/service-dist-before-split-price-20260422160331.tar.gz`、`backups/crami_package-before-usd-price-20260422160331.sql`；数据库迁移后已初始化 `Plus=6 / Pro=20 / Max=30` 的 `usdPrice`。`9520` 主服务已从 PID `3220959` 切换到 PID `503151`，`38000` 学术服务未重启；线上 `https://lens.yutoai.net/?v=20260422160331` 与 `https://lens.yutoai.net/alice3306/?v=20260422160331` 均返回 `HTTP 200`，接口已确认返回 `price=45/140/210` 与 `usdPrice=6/20/30`，AppleDouble `._*` 元数据文件为 0。

## 0.0.81 (2026-04-22)
- 会员套餐美元展示价改为后台可调：`chat/src/components/Settings/MemberCenter.vue` 已移除官方 Plus / Pro / Max 的 `$6 / $20 / $30` 前端硬编码，会员卡片展示价现在统一读取后台套餐 `price` 与后端返回的 `billingOptions`，官方套餐继续显示 `USD`，自定义套餐继续显示 `CNY`。影响范围：仅会员套餐展示价与支付确认页展示币种；不改变套餐表结构、支付接口、订单创建参数或会员到账逻辑。回滚方式：恢复本次 `MemberCenter.vue`、`MemberPayment.vue` 与全局订单信息字段变更后重新构建同步 `chat/dist`。
- 支付确认页币种一致：`chat/src/components/Settings/MemberPayment.vue` 会读取订单上下文中的 `displayCurrencySymbol`，官方套餐从会员卡片进入支付时继续显示 `$`，避免会员页美元价和支付页人民币符号不一致；默认空订单仍回退 `¥`。
- 后台套餐价格提示收口：`admin/src/views/package/package.vue` 的套餐价格输入提示已说明“官方套餐前台按 USD 展示；自定义套餐按 CNY 展示”，避免后台误以为该字段只服务人民币展示。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`./admin/node_modules/.bin/vue-tsc --noEmit`、`./chat/node_modules/.bin/vite build --mode=production` 与 `./admin/node_modules/.bin/vite build --mode=production`；构建仅有既有 Vite chunk warning 与 Browserslist 提示。
- 已完成 GitHub 与服务器同步：提交 `8eb2395 fix: use admin price for plan display` 已推送到 `origin/main`；最新 `chat/dist` 与 `admin/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat` 与 `/www/wwwroot/Lens/AIWebQuickDeploy/public/admin`。同步前已备份 `public/chat` 到 `backups/public-chat-before-admin-price-20260422153900.tar.gz`，备份 `public/admin` 到 `backups/public-admin-before-admin-price-20260422153900.tar.gz`；本轮未重启服务，`9520` 保持 PID `3220959`，`38000` 保持 `4048524/2995907`。线上 `https://lens.yutoai.net/?v=202604221540` 与 `https://lens.yutoai.net/alice3306/?v=202604221540` 均返回 `HTTP 200`，服务器已确认 `public/chat` 包含 `displayCurrencySymbol`，`public/admin` 包含新的 USD 提示，AppleDouble `._*` 元数据文件为 0。

## 0.0.80 (2026-04-22)
- 用户必读多语言修复：`chat/src/components/Settings/NoticeDialog.vue` 的套餐规则结构化展示已改为通过 `vue-i18n` 读取语言包，不再在组件内硬编码中文套餐说明；`zh-CN / en-US / zh-TW / ja-JP / ko-KR` 已补齐 `lens.usageNotice` 文案。影响范围：仅设置页“用户必读”结构化套餐规则展示；不改变线上公告数据库内容、套餐限制、后端校验、计费逻辑或 Markdown 兜底公告渲染。回滚方式：恢复 `NoticeDialog.vue` 和对应语言包变更后重新构建同步 `chat/dist`。
- 本地验证通过：已执行 5 个语言包 JSON 解析校验、`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；前端构建仅有既有 Vite 动静态导入 warning。
- 已完成 GitHub 与服务器同步：提交 `61a4de4 fix: localize usage notice` 已推送到 `origin/main`；最新 `chat/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`。同步前已备份 `public/chat` 到 `backups/public-chat-before-usage-notice-i18n-20260422150915.tar.gz`，压缩包方式部署前再次备份到 `backups/public-chat-before-usage-notice-i18n-tar-20260422151517.tar.gz`；本轮未重启服务，`9520` 保持 PID `3220959`，`38000` 保持 `4048524/2995907`。线上 `https://lens.yutoai.net/?v=202604221515` 返回 `HTTP 200`，服务器前端产物已确认包含英文用户必读文案，部署过程中产生的 AppleDouble `._*` 元数据文件已清理为 0。

## 0.0.79 (2026-04-22)
- 用户必读排版优化：`chat/src/components/Settings/NoticeDialog.vue` 针对 Lens 套餐规则公告新增结构化展示，不再把套餐规则作为原始 Markdown 大标题和长列表直接渲染；当前展示改为顶部说明、Plus/Pro/Max 三列能力对比、计费与有效期、任务执行说明四个清晰区域。影响范围：仅设置页“用户必读”公告的前端展示排版；不改变公告数据库内容、套餐权限、后端校验或计费逻辑。回滚方式：恢复 `NoticeDialog.vue` 到上一版并重新构建同步 `chat/dist`。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；前端构建仅有既有 Vite 动静态导入 warning。
- 已完成 GitHub 与服务器同步：提交 `e287009 refactor: improve usage notice layout` 已推送到 `origin/main`；最新 `chat/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，同步前已备份 `public/chat` 到 `backups/public-chat-before-usage-notice-layout-20260422025347.tar.gz`。本轮未重启服务，`9520` 保持 PID `3220959`，`38000` 保持 `4048524/2995907`；线上 `https://lens.yutoai.net/?v=202604220254` 返回 `HTTP 200`，服务器前端产物已确认包含 `usage-notice__plans` 结构化版式。

## 0.0.78 (2026-04-22)
- 用户必读内容替换：`chat/src/components/Settings/NoticeDialog.vue` 不再使用初始化时解构出的旧 `noticeInfo`，改为响应式读取全局公告内容，并在公告为空时回退到新的套餐规则说明；新增 `chat/src/constants/usageNotice.ts` 作为前端默认“用户必读”内容。影响范围：设置弹窗“使用必读/用户必读”展示内容；不改变用户协议、隐私政策或登录协议弹窗。回滚方式：恢复 `NoticeDialog.vue` 和默认内容常量后重新构建同步 `chat/dist`。
- 后端默认公告替换：新增 `service/src/common/constants/usageNotice.constant.ts`，`DatabaseService.createBaseSiteConfig` 的新环境默认公告改为套餐使用规则，并补齐默认 `noticeTitle=用户必读`；原初始化公告中的老登录说明不再作为默认内容。影响范围：新部署或初始化场景的公告默认值；不改变现有用户、套餐、支付或会员数据结构。回滚方式：恢复 `DatabaseService` 默认 `noticeInfo` 后重新构建同步 `service/dist`。
- 线上公告配置已更新：同步前已备份 `public/chat` 与 `service/dist` 到服务器 `backups/public-chat-before-usage-notice-20260422022427.tar.gz`、`backups/service-dist-before-usage-notice-20260422022427.tar.gz`；更新数据库前已备份旧公告配置到 `backups/config-notice-before-usage-notice-20260421182721.json`，并在发现 `configKey` 非唯一导致重复行后，再备份到 `backups/config-notice-duplicates-before-normalize-20260421182820.json`，随后将所有 `noticeInfo / noticeTitle` 行统一更新为新套餐规则。影响范围：仅 `config` 表中的公告标题与公告正文。回滚方式：从上述 JSON 备份恢复对应 `config` 行。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`；前端构建仅有既有 Vite 动静态导入 warning。
- 已完成 GitHub 与服务器同步：提交 `d3e3e03 feat: publish plan usage notice` 已推送到 `origin/main`；`chat/dist` 与 `service/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy`。`9520` 主服务已从 PID `3208282` 切换到 PID `3220959`，`38000` 学术服务保持 `4048524/2995907` 未重启；线上 `https://lens.yutoai.net/?v=202604220230` 返回 `HTTP 200`，`/api/config/queryFront` 已确认返回“Lens 用户必读 / 套餐使用规则”，且不再返回旧“Lens 昱镜”内容。

## 0.0.77 (2026-04-22)
- 学术会员分层限制落地：新增 `chat/src/utils/academicPlanAccess.ts` 统一前端套餐能力判断；前端学术面板和首页入口会根据用户套餐过滤可用单能力，Plus/非会员只保留轻量单能力，Pro 可使用 PDF/Word/LaTeX 等进阶能力并支持最多 2 步能力编排，Max 支持全部能力和最多 3 步编排。影响范围：学术能力入口展示、快捷入口、编排模板和编排步骤上限；不改变套餐购买、卡密兑换、积分扣费或文件上传逻辑。回滚方式：回退本次前端权限过滤文件与面板改动并重新构建同步 `chat/dist`。
- 后端硬校验补齐：`service/src/modules/userBalance/userBalance.service.ts` 的余额接口新增 `isMember / packageName / packageWeight`，用于稳定区分 Plus/Pro/Max；`service/src/modules/academic/academic.service.ts` 在普通学术任务和多能力编排执行前做服务端套餐校验，避免绕过前端直接调用 Pro/Max 能力。影响范围：`/api/academic/chat-process` 与 `/api/academic/workflow-process` 的越权请求会返回升级提示；不改变学术服务端口、模型配置、扣费顺序或数据库结构。回滚方式：恢复本次服务端校验与余额返回字段后重新构建同步 `service/dist` 并重启 `9520`。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`；前端构建仅有既有 Vite 动静态导入 warning。
- 已完成 GitHub 与服务器同步：提交 `4f86f59 feat: enforce academic plan access` 已推送到 `origin/main`；`chat/dist` 与 `service/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy`。同步前已在服务器创建 `public-chat-before-plan-access-20260422021406.tar.gz` 与 `service-dist-before-plan-access-20260422021406.tar.gz` 备份；`9520` 主服务已从 PID `3061585` 精确切换到 PID `3208282`，`38000` 学术服务保持 `4048524/2995907` 未重启。线上 `https://lens.yutoai.net/?v=202604220215` 返回 `HTTP 200`，远端 `dist/main.js` 已确认包含“当前套餐最多支持”后端拦截，前端产物已确认包含 `packageWeight` 等套餐等级字段。

## 0.0.76 (2026-04-22)
- 年会员卡密链路补齐：`service/src/modules/crami/createCrami.dto.ts` 与 `crami.service.ts` 已支持套餐卡密传入 `billingCycle=monthly|annual`；生成套餐卡密时复用现有套餐计费快照逻辑，年卡会按 12 个月额度和 365 天有效期生成，兑换后沿用现有 `addBalanceToUser` 会员到账链路。影响范围：仅套餐类卡密生成；不改变用户直接购买年付套餐的订单逻辑、支付回调或卡密兑换入口。回滚方式：移除 `billingCycle` 入参与 `getPackageBillingOffer` 生成逻辑后重新构建同步 `service/dist`。
- 后台发行年卡入口：`admin/src/views/package/crami.vue` 的生成卡密弹窗新增“月卡 / 年卡”计费周期选择，并显示即将生成的有效期和三类额度；`admin/src/views/package/package.vue` 在套餐列表操作区新增“发行年卡密”快捷入口，会跳转到卡密管理并预选当前套餐与年卡周期。影响范围：仅后台套餐卡密发行体验，不改变套餐配置字段或已有卡密数据。回滚方式：恢复两个后台页面并重新构建同步 `admin/dist`。
- 本地验证通过：已执行 `./admin/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./admin/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`；构建仅有既有 Browserslist/chunk warning。
- 已完成 GitHub 与服务器同步：提交 `5592bb0 feat: support annual member card secrets` 已推送到 `origin/main`；`service/dist` 与 `admin/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy`。`9520` 主服务已从 PID `3008741` 精确切换到 PID `3061585`，`38000` 学术服务保持 `4048524/2995907` 未重启；线上 `https://lens.yutoai.net/?v=202604220100` 返回 `HTTP 200`，服务器后台资源已确认包含“发行年卡密 / 年卡”，服务端 `dist/main.js` 已确认套餐卡密生成走 `getPackageBillingOffer(pkg, billingCycle)`。

## 0.0.75 (2026-04-22)
- 研究结果头部对齐修复：`chat/src/views/chat/components/Message/Text/index.vue` 已修正第一个 `workspace-record__meta-chip` 的伪元素布局，避免隐藏圆点仍占用 flex gap，导致“附件 1”比“生成 1 份可下载结果。”右缩。影响范围：仅消息头部元信息排版，不改变下载结果、文件展示、生成正文或接口逻辑。回滚方式：恢复该伪元素样式后重新构建同步 `chat/dist`。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仅有既有 Vite 动静态导入 warning。
- 已完成 GitHub 与服务器同步：提交 `cc54b8d fix: align research result metadata` 已推送到 `origin/main`；最新 `chat/dist` 已零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，`index.html` 更新时间为 `2026-04-22 00:40:19 +0800`。线上 `https://lens.yutoai.net/?v=202604220045` 返回 `HTTP 200`，服务器 CSS 已确认包含 `.workspace-record__meta-chip:first-child:before{content:"";display:none}`；`9520` 保持 PID `3008741`，`38000` 保持 `4048524/2995907`，本轮未重启服务。

## 0.0.74 (2026-04-22)
- 学术长任务进度接入：`service/src/modules/academic/academic.service.ts` 新增安全 `thinkingPreview` 提炼链路，会从普通学术任务和多能力编排调用学术后端时收到的流式片段中提取、脱敏、降噪、截断后推给前端。多能力编排仍保留 `progressText/taskData`，并把真实流片段同步写入当前步骤进度。影响范围：仅用户等待期间的进度展示，不改变最终正文生成、文件结果、扣费、模型调用顺序或数据库结构。回滚方式：移除 `thinkingPreview` 推送和前端消费逻辑后重新构建同步 `chat/dist` 与 `service/dist`。
- 前端深度思考条真实化：`chat/src/views/chat/chatBase.vue`、`Message/index.vue`、`Message/Text/index.vue` 和 `chat.d.ts` 已补齐 `thinkingPreview` 透传；“深度思考中”长条优先显示编排进度，其次显示学术后端实时预览，再兜底显示模型 reasoning 或轮播文案。加载期间标签固定为“深度思考中”，避免长任务正文未完成时误显示“已深度思考”。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`；构建仅有既有 Vite 动静态导入 warning。
- 已完成 GitHub 与服务器同步：提交 `de90b1f feat: stream academic thinking previews` 已推送到 `origin/main`；`chat/dist` 与 `service/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy`。`9520` 主服务已精确切换为 PID `3008741`，`38000` 学术服务保持原监听进程 `4048524/2995907` 未重启；线上 `https://lens.yutoai.net/?v=202604220030` 返回 `HTTP 200`，服务器 `dist/main.js` 已确认包含 `thinkingPreview` 推送逻辑。

## 0.0.73 (2026-04-22)
- 积分命名收口：`chat` 中文可见文案把“顶级模型额度”改为“顶级积分”，并在会员中心兼容线上旧 `drawMjName` 配置值；后端数据库初始化默认值同步改为“顶级积分”。影响范围：用户端积分名称展示与新环境默认配置，不改变积分扣减、套餐额度或会员逻辑。回滚方式：恢复本次中文语言包、会员中心兼容逻辑和默认配置改动后重新构建同步。
- 后台额度命名收口：`admin` 中“特殊额度”相关表格、表单、校验与 placeholder 改为“顶级额度”，用于套餐、卡密和注册/签到配置页。影响范围：仅后台文案，不改变字段名、接口参数或数据库结构。回滚方式：恢复本次后台文案改动后重新构建同步 `admin/dist`。
- 生产错误清洗：`service/src/common/utils/sanitizeClientErrorMessage.ts` 与 `chat/src/utils/request/sanitizeErrorMessage.ts` 新增异常前缀剥离，`OrderService.buy` 不再把捕获到的原始 `error.message` 直接抛给前端；“Error: 订单存在!” 会显示为“订单已存在，请勿重复提交”。影响范围：订单购买失败提示和通用请求错误清洗，不改变支付创建、查询或扣费逻辑。回滚方式：恢复清洗器和订单接口 catch 分支后重新构建同步 `chat/dist` 与 `service/dist`。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`./admin/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production`、`./admin/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`；构建仅有既有 Vite chunk/import 警告和 Browserslist 数据提示。
- 已完成 GitHub 与服务器同步：提交 `bdf97e7 fix: clean quota labels and order errors` 已推送到 `origin/main`；`chat/dist`、`admin/dist` 与 `service/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy`。`9520` 主服务已重启为 PID `2995614`，学术服务父进程仍为 `4048524`，当前监听子进程为 `2995907`，本轮未主动重启学术服务。线上 `https://lens.yutoai.net/?v=20260422002130` 返回 `HTTP 200`，远端构建产物已确认包含“顶级积分”“顶级额度”和“订单已存在，请勿重复提交”，且不再包含 `Error: 订单存在` 原始前缀。

## 0.0.72 (2026-04-21)
- 编排准备态兜底：针对用户截图中“能力编排进度 0% 但深度思考长条仍显示通用轮播文案”的问题，`service/src/modules/academic/academic.service.ts` 现在会在文件转交/编排准备阶段立即写入并推送第一条 workflow 事件，把首个步骤标记为 `running`，并显示“正在接收上传资料 / 正在准备编排任务”等安全阶段说明。
- 前端长条兜底：`chat/src/views/chat/components/Message/Text/index.vue` 的 `workflowLiveProgressText` 不再依赖必须已有完整步骤列表；只要当前消息是能力编排且仍在 loading，就优先显示“正在接收上传资料，准备能力编排”或“正在准备能力编排”，避免用户只看到泛化“正在理解用户的想法”。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`。影响范围：仅多能力编排流式状态和前端等待文案，不改变最终模型调用、学术服务处理、扣费或文件生成逻辑。回滚方式：恢复本次对早期 workflow 事件和前端兜底文案的改动，并重新构建同步 `chat/dist` 与 `service/dist`。
- 已完成 GitHub 与服务器同步：提交 `cff0d5e fix: show workflow preparation progress` 已推送到 `origin/main`；`chat/dist` 与 `service/dist` 已同步到服务器。重启期间普通 SSH 会话多次被服务器关闭，曾短暂出现 `9520` 未监听导致 Cloudflare `502`，已改用 `setsid node dist/main.js` 恢复服务，当前 `9520` 监听 PID 为 `2954971`，线上 `https://lens.yutoai.net/?v=20260422000030` 返回 `HTTP 200`；本轮未重启 `38000` 学术服务。

## 0.0.71 (2026-04-21)
- 控制面板减噪：`chat/src/views/chat/components/Footer/components/AcademicPanel.vue` 已删除高级设置中补充输入框上方的独立“补充要求”标题，保留输入框 placeholder 与“只有在需要约束术语、输出格式或翻译策略时再填写。”提示说明，避免表单层级过重。
- 影响范围：仅能力设置面板的显示文案结构，不影响补充要求输入、清洗、提交或编排逻辑。回滚方式：恢复该 textarea 上方的 label 后重新构建并同步 `chat/dist`。
- 已完成 GitHub 与服务器同步：提交 `bd57e84 fix: remove extra instruction label` 已推送到 `origin/main`；最新 `chat/dist` 已零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，未重启 `9520` 或 `38000`。线上回查 `https://lens.yutoai.net/?v=20260421232200` 返回 `HTTP 200`，`Last-Modified` 已更新为 `2026-04-21 15:16:18 GMT`；服务器端口保持 `9520` PID `2860669`、`38000` PID `4048524`。

## 0.0.70 (2026-04-21)
- 编排耗时排查：线上最近一次三步多能力编排总耗时约 `264s`，第一步插件阶段约 `196s`，第二步基础能力约 `58s`，第三步约 `10s`；主要原因是编排链路按步骤串行执行，且第一步插件内部包含资料处理与上游模型等待，耗时不只取决于最终输出模型速度。
- 编排进度可视化：`service/src/modules/academic/academic.service.ts` 的 workflow heartbeat 现在会附带安全的 `progressText`，按步骤显示“正在接收论文资料 / 正在切分论文正文 / 正在分析问题、方法和实验结果 / 正在汇总结果”等阶段说明；`chat/src/views/chat/components/Message/Text/index.vue` 让“深度思考中”长条优先展示当前编排步骤说明，并在编排详情中展示运行中步骤的阶段文本。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`。影响范围：多能力编排流式状态展示与服务端 workflow 事件，不改变模型调用顺序、扣费逻辑、学术服务处理逻辑或最终结果。回滚方式：移除 `progressText` 字段与 heartbeat 文案生成逻辑，并恢复前端 `reasoningPreview` 为原通用轮播文案后重新构建、同步 `chat/dist` 与 `service/dist`。
- 已完成 GitHub 与服务器同步：提交 `b2e6177 feat: show workflow stage progress` 已推送到 `origin/main`；`chat/dist` 与 `service/dist` 已同步到 `/www/wwwroot/Lens/AIWebQuickDeploy`，重启 `9520` Node 服务后新 PID 为 `2860669`，`38000` 学术服务保持 PID `4048524` 未重启。线上回查 `https://lens.yutoai.net/` 与 `/api/sitemap.xml` 均返回 `HTTP 200`，服务器构建产物已包含 `progressText` 与“正在切分论文正文”等阶段文本。

## 0.0.69 (2026-04-21)
- 研究结果加载态去噪：`chat/src/views/chat/components/Message/Text/index.vue` 已移除助手消息加载时头部的“进行中”状态 chip 和“正在整理分析、引用和可交付结果。”说明句；保留“研究结果”标题和下方深度思考/生成进度展示。
- 影响范围：仅聊天消息加载态展示文案，不影响生成、推理、联网搜索、文件结果或工作流逻辑。回滚方式：恢复 `recordStatus` 与加载态 `recordSummary` 文案并重新构建、同步 `chat/dist`。

## 0.0.68 (2026-04-21)
- 会员中心额度信息继续收敛：`chat/src/components/Settings/MemberCenter.vue` 中普通积分、高级积分、顶级模型额度和会员状态不再使用独立灰线圆角框，改为白色卡面上的横向信息行；名称在左、数值和单位在右，并使用 `whitespace-nowrap` 防止“积分”或“到期”被拆成两行。
- 影响范围：仅会员中心额度信息展示样式，不涉及积分、签到或会员状态业务逻辑。回滚方式：恢复本次对 `MemberCenter.vue` 的信息行 class 调整并重新构建、同步 `chat/dist`。

## 0.0.67 (2026-04-21)
- 会员中心视觉细节调整：`chat/src/components/Settings/MemberCenter.vue` 中“签到赠送”、普通积分、高级积分、顶级模型额度和会员状态信息行不再使用灰色 `surface-panel` 背景，改回跟随原有白色 `surface-card` 背景，仅保留边框、圆角和排版层级。
- 影响范围：仅会员中心签到和额度信息展示样式，不涉及签到、积分、会员到期时间等业务数据或接口逻辑。回滚方式：将上述信息行背景从 `surface-card` 恢复为 `surface-panel` 后重新构建并同步 `chat/dist`。

## 0.0.66 (2026-04-21)
- 补齐旧法律页删除语义：由于 SPA fallback 会把不存在的 `/legal/terms.html` 与 `/legal/privacy.html` 回退到 `index.html`，`service/src/modules/spa/spa.controller.ts` 已对这两个旧 Lens 本地路径显式返回 `410 Gone`，避免它们在浏览器或爬虫侧继续表现为可访问页面。
- 影响范围：仅旧本地法律页路径的 HTTP 行为；登录弹窗仍使用 `https://yutoai.net/terms/` 与 `https://yutoai.net/privacy-policy/`。回滚方式：移除 `removedLocalLegalPaths` 分支并重新构建、同步 `service/dist`。

## 0.0.65 (2026-04-21)
- 协议入口纠正：Lens 登录弹窗中的《服务协议》《隐私政策》不再指向本地 `/legal/terms.html` 与 `/legal/privacy.html`，改为统一加载 YutoAI 主站协议 `https://yutoai.net/terms/` 与 `https://yutoai.net/privacy-policy/`；新增 `chat/src/constants/legalLinks.ts` 统一维护链接，避免邮箱登录和微信登录分叉。
- 删除 Lens 本地法律页：已移除 `chat/public/legal/terms.html` 与 `chat/public/legal/privacy.html`，同步清理 `chat/index.html`、`chat/public/llms.txt`、`chat/public/llms-full.txt`、`chat/public/seo/research-workspace.html`、`chat/public/robots.txt` 与 `service/src/modules/spa/spa.controller.ts` 中的本地 `/legal/*.html` 入口和 sitemap 条目。
- 本地验证通过：`https://yutoai.net/terms/` 与 `https://yutoai.net/privacy-policy/` 均返回 `HTTP 200`，响应头未发现禁止 iframe 嵌入的 `X-Frame-Options` 或 `frame-ancestors`；已执行 `./chat/node_modules/.bin/vue-tsc --noEmit`、`pnpm -C service exec tsc -p tsconfig.json --noEmit`、`./chat/node_modules/.bin/vite build --mode=production` 与 `pnpm -C service run build:test`。影响范围：登录弹窗协议 iframe、公开 SEO 文档、robots/sitemap 和前端/服务端构建产物。回滚方式：恢复本次提交并重新同步 `chat/dist` 与 `service/dist`，如确需恢复本地法律页需重新添加两份静态 HTML。

## 0.0.64 (2026-04-21)
- 同步链路排查：确认 GitHub `origin/main` 与本地 HEAD 同为 `e084744 docs: record legal policy deployment`，但本地存在 19 个未提交前端/SEO/品牌文案改动；服务器 `/www/wwwroot/Lens`、`/www/wwwroot/Lens/AIWebQuickDeploy`、`/www/wwwroot/Lens/academic-4.0` 均不是 Git 仓库，线上运行版本只能通过构建产物、文件时间与内容校验反推。
- 法律页品牌开头修正：`chat/public/legal/terms.html` 首段改为“本服务协议适用于 YutoAI 提供的 Lens 等相关服务”，`chat/public/legal/privacy.html` 首段改为“本隐私政策说明 YutoAI 在提供 Lens 等相关服务时如何处理个人信息”；保留 Lens 作为 YutoAI 旗下服务自然出现，不把 Lens 单独拆成独立品牌协议。
- 本地验证通过：已在 `chat` 子目录执行 `./node_modules/.bin/vue-tsc --noEmit` 与 `./node_modules/.bin/vite build --mode=production`；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。影响范围：公开法律页开头、现有前端/SEO/品牌文案工作树改动及其构建产物。回滚方式：回退本次提交并重新构建、同步 `chat/dist`；服务器前端静态资源可回退到上一版 `public/chat` 构建产物。

## 0.0.63 (2026-04-21)
- 公开法律页更新：`chat/public/legal/terms.html` 已替换为用户提供的 2026-04-21 版 `YutoAI 服务协议 / Terms of Service`，`chat/public/legal/privacy.html` 已替换为 2026-04-21 版 `YutoAI 隐私政策 / Privacy Policy`，补齐服务主体、服务范围、账号安全、API、退款、第三方服务、企业服务、投诉、责任限制、香港法律与隐私数据处理等完整条款。
- 法律页排版同步调整为网站静态文档格式：新增 `YutoAI Legal` 页眉、双语标题、更新时间、章节锚点目录、主体信息块、清晰分节和移动端适配；保持纯静态 HTML，不引入脚本和新运行时依赖，兼容登录弹窗 iframe 与公开访问。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`，并确认 `chat/dist/legal/terms.html`、`chat/dist/legal/privacy.html` 包含 2026-04-21 版内容；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。影响范围：仅公开法律页静态内容与排版。回滚方式：恢复两份 `chat/public/legal/*.html` 到上一版本并重新同步 `chat/dist` 即可。
- 已完成本轮安全同步：代码已提交为 `15a204b docs: update public legal policies` 并推送到 `origin/main`；随后已将最新 `chat/dist` 零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`。线上回查 `terms.html` 与 `privacy.html` 均返回 `HTTP 200`，`Last-Modified` 均为 `2026-04-21 04:38:15 GMT`，服务器内容 grep 已确认包含新版标题，`9520/38000` 监听未变。

## 0.0.62 (2026-04-20)
- 首页继续按反馈做减法：`chat/src/views/chat/components/Workspace/Home.vue` 已删除“提问”主动作与空 Hero 占位；案例行左侧 padding 清零，使下面案例和 `读材料 / 写内容 / 研究链路` 三个分区标题左对齐。
- 研究链路继续降噪：已从“研究链路”分区移除 `代码解释` 入口，仅保留编排相关入口。已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`，构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。影响范围：仅首页前端展示。回滚方式：恢复 `Workspace/Home.vue` 到本次改动前版本即可。
- 已完成本轮安全同步：代码已提交为 `489fb38 refactor: remove workspace home action chrome` 并推送到 `origin/main`；随后已将最新 `chat/dist` 零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，线上回查 `https://lens.yutoai.net/?v=20260420223100` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-20 14:31:06 GMT`，`9520/38000` 监听未变。影响范围：仅首页前端展示。回滚方式：回退 GitHub 到上一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.61 (2026-04-20)
- 首页字号关系调整：`chat/src/views/chat/components/Workspace/Home.vue` 已将 `读材料 / 写内容 / 研究链路` 三个分区标题从 `13px` 调整为 `14px`，并将下面案例标题从 `14px` 调整为 `13px`，保留案例灰色与 `500` 字重，避免重新变成黑色粗标题墙。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。
- 已完成本轮安全同步：代码已提交为 `4d0297e refactor: adjust workspace home type scale` 并推送到 `origin/main`；随后已将最新 `chat/dist` 零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，线上回查 `https://lens.yutoai.net/?v=20260420213200` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-20 13:31:55 GMT`，`9520/38000` 监听未变。影响范围：仅首页前端展示。回滚方式：回退 GitHub 到上一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.60 (2026-04-20)
- 首页继续按截图做减法：`chat/src/views/chat/components/Workspace/Home.vue` 已移除顶部动作中的“导入”，首页空状态现在只保留“提问”主动作；同时将能力案例标题从黑色粗字降为 `text-sub` 灰色与 `500` 字重，降低案例行视觉权重。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。
- 已完成本轮安全同步：代码已提交为 `d90bbeb refactor: soften workspace home entries` 并推送到 `origin/main`；随后已将最新 `chat/dist` 零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，线上回查 `https://lens.yutoai.net/?v=20260420212200` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-20 13:21:08 GMT`，`9520/38000` 监听未变。影响范围：仅首页前端展示。回滚方式：回退 GitHub 到上一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.59 (2026-04-20)
- 首页字体与灰线治理：`chat/src/views/chat/components/Workspace/Home.vue` 已移除首页分组标题上的衬线字体，改为继承产品统一无衬线体系；同时去掉 Hero、分组和入口行上的密集灰色横线，改用留白、轻量胶囊动作和 hover 背景表达层级。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。浏览器截图尝试受本地预览代理配置阻塞，已立即关闭 Chromium、停止预览并清理临时 profile，无后台进程残留。
- 已完成本轮安全同步：代码已提交为 `9668ea2 refactor: align workspace home typography` 并推送到 `origin/main`；随后已将最新 `chat/dist` 零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，线上回查 `https://lens.yutoai.net/?v=20260420203500` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-20 12:32:36 GMT`，`9520/38000` 监听未变。影响范围：仅首页前端样式。回滚方式：回退 GitHub 到上一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.58 (2026-04-15)
- 已同步新的浏览器清理约束：按根目录 `AGENTS.md`，以后每次使用 Playwright / Chromium 完成调试、截图、自动化或验收后，必须立即关闭浏览器窗口、会话和残留后台进程，不允许继续占用系统资源。
- 本地记录已补齐：`STATUS.md` 已把这条要求写入当前长期约束，后续所有浏览器相关操作都按这条规则收尾。影响范围：仅本地规则与记忆文件。回滚方式：恢复本地记录到本次补充前版本即可。

## 0.0.57 (2026-04-15)
- 已纠正 Chromium 路径真相源：按根目录 `AGENTS.md` 重新核对后，当前固定 Playwright Chromium 本体应以 `/Users/hkyutong/Library/Application Support/PlaywrightChromium/chromium-1217/...` 为准，`~/Library/Caches/ms-playwright` 不再作为是否可用的判断依据。
- 本地记录已同步校正：`AGENTS.md`、`STATUS.md` 已补上“先看固定本体路径、不要再把缓存目录当真相源”的说明，避免后续 Playwright/Chromium 验收时再沿用旧路径判断。影响范围：仅本地规则与记忆文件。回滚方式：恢复三份本地记录到本次修正前版本即可。

## 0.0.56 (2026-04-15)
- 首页继续做减法并完成发布：`chat/src/views/chat/components/Workspace/Home.vue` 已移除大标题 Hero，只保留一行动作入口；读材料区撤下 `Arxiv 摘要`，第三列标题收成“研究链路”，并把 `代码解释 / 自己编排 / 1 条精选案例` 合并进同一列，首页整体从“分段展示”进一步收敛成更短的研究目录。
- 多语言文案同步压缩：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 已把首页动作按钮缩成更短的操作词，并统一第三列标题语义，避免首页继续靠长句撑版面。
- 已完成本轮安全同步：代码已提交为 `01d514a refactor: tighten the research entry` 并推送到 `origin/main`；随后已将最新 `chat/dist` 零停机同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，线上回查 `https://lens.yutoai.net/?v=20260415080300` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-15 00:01:14 GMT`，`9520/38000` 监听未变。影响范围：仅首页前端结构与五套 locale。回滚方式：回退 GitHub 到上一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.55 (2026-04-15)
- 首页继续做减法：`chat/src/views/chat/components/Workspace/Home.vue` 已移除 `01/02/03` 编号、入口右侧“进入”文字、流程模板的重复步骤展开，并把流程案例缩到 1 条；当前首页收成三栏主入口加一块极简编排区，减少层级和重复阅读。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。影响范围：仅首页前端结构。回滚方式：恢复 `Workspace/Home.vue` 到本次改动前版本即可。

## 0.0.54 (2026-04-14)
- 已完成本轮安全同步：主界面去噪改动已提交为 `f43ab15 refactor: reduce workspace noise` 并推送到 `origin/main`；本次仍未把本地 `AGENTS.md / STATUS.md / CHANGELOG.md` 推上 GitHub，只同步了前端显示层代码与构建产物。
- 已完成前端零停机发布：本地 `chat/dist` 已再次同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，继续采用“先同步除 `index.html` 外的静态资源、最后覆盖 `index.html`”的方式，不重启 `9520` 与 `38000`，也不触碰学术服务目录。
- 线上回查通过：`https://lens.yutoai.net/?v=20260414082441` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-14 00:24:41 GMT`；服务器 `public/chat/index.html` 修改时间为 `2026-04-14 08:24:41 +0800`，`9520` 仍由进程 `4048630` 监听，`38000` 仍由进程 `4048524` 监听。影响范围：仅前端显示层与语义层。回滚方式：回退 GitHub 到前一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.53 (2026-04-14)
- 继续给主界面做减法：`chat/src/views/chat/components/Workspace/Home.vue` 已移除 Hero 辅助说明、入口用途说明、能力标签和编排说明句，首页从“解释入口”继续收敛成“直接操作入口”；`chat/src/views/chat/components/Footer/components/AcademicPanel.vue` 已移除顶部综述卡和底部“当前任务”重复摘要，只保留真正需要操作的控制项。
- 修正 SEO 语义层串入产品界面：`chat/index.html` 中的 `seo-snapshot` 现在改为真正的视觉隐藏语义层，仍保留给抓取器读取，但不再直接堆在应用页底部干扰学术用户操作。
- 同步压缩交互文案：`chat/src/views/chat/components/Footer/index.vue` 把“提交任务”收成“发送”；`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 同步缩短首页区块标题、登录占位文案和右侧面板标题/空态提示。已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`，构建仍只有既有 warning。影响范围：仅前端显示层与语义层。回滚方式：恢复 `Workspace/Home.vue`、`AcademicPanel.vue`、`Footer/index.vue`、`chat/index.html` 与上述 locale 到本次改动前版本即可。

## 0.0.52 (2026-04-14)
- 已完成本轮安全同步：首页重设计已提交为 `4c2e360 refactor: redesign the research workspace` 并推送到 `origin/main`；本次仍未把本地 `AGENTS.md / STATUS.md / CHANGELOG.md` 推上 GitHub，只同步了首页前端代码与构建产物。
- 已完成前端零停机发布：本地 `chat/dist` 已再次同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，继续采用“先同步除 `index.html` 外的静态资源、最后覆盖 `index.html`”的方式，不重启 `9520` 与 `38000`，也不触碰学术服务目录。
- 线上回查通过：`https://lens.yutoai.net/?v=20260414081200` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-14 00:12:35 GMT`；服务器 `public/chat/index.html` 修改时间为 `2026-04-14 08:12:35 +0800`，`9520` 仍由进程 `4048630` 监听，`38000` 仍由进程 `4048524` 监听。影响范围：仅首页前端静态资源。回滚方式：回退 GitHub 到前一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.51 (2026-04-14)
- 首页继续做成更像专业科研平台的研究界面：`chat/src/views/chat/components/Workspace/Home.vue` 这轮把首页从“目录式入口”进一步重构为“Lens 标识 + 研究入口 Hero + 三段研究工作流”，加入更强的编辑式排版层级、弱化功能陈列感，并把代码解释与多步流程统一收到“拆方法与编排”区域。
- 首页入口全部改成任务语义：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 已为论文总结、PDF 深读、Arxiv 摘要、英文润色、LaTeX 翻译、代码解释补上用途说明，并把按钮文案收敛成“进入 / Open / 開く / 進入 / 열기”，让入口更像研究动作而不是功能标签。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。影响范围：仅首页前端结构与五套 locale。回滚方式：恢复 `Workspace/Home.vue` 与对应 locale 到本次改动前版本即可。

## 0.0.50 (2026-04-14)
- 已完成本轮安全同步：首页“工作方式入口”改造已提交为 `0b25356 refactor: focus the research entry` 并推送到 `origin/main`；本次没有把本地 `AGENTS.md / STATUS.md / CHANGELOG.md` 推上 GitHub，只同步了首页前端代码与构建产物。
- 已完成前端零停机发布：本地 `chat/dist` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，继续采用“先同步除 `index.html` 外的静态资源、最后覆盖 `index.html`”的方式，未重启 `9520` 与 `38000`，也未触碰学术服务目录。
- 线上回查通过：`https://lens.yutoai.net/?v=20260414074458` 返回 `HTTP 200`，`Last-Modified` 为 `2026-04-13 23:44:58 GMT`；服务器 `public/chat/index.html` 修改时间为 `2026-04-14 07:44:58 +0800`，`9520` 仍由进程 `4048630` 监听，`38000` 仍由进程 `4048524` 监听。影响范围：仅首页前端静态资源。回滚方式：回退 GitHub 到前一提交，并把服务器 `public/chat` 恢复到上一版构建产物即可。

## 0.0.49 (2026-04-14)
- 首页继续从“功能目录”收敛成“工作方式入口”：`chat/src/views/chat/components/Workspace/Home.vue` 已取消左右双区工作台，把首页改成单列三段式结构，按“读材料 / 写内容 / 多步流程”组织入口；用户先判断自己在做哪类研究工作，再进入具体能力，减少功能货架感并强化首屏主次。
- 首页文案进一步改成任务导向：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 已把主标题与分区标题改成更直接的研究语义，如“开始研究 / 先选工作方式 / 读材料 / 写内容”，避免“研究工作台 / 单步任务”这类偏后台或产品目录的措辞。
- 本地验证通过：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`；构建仍只有既有的 `chat/src/store/modules/chat/index.ts` 动静态混合导入 warning。影响范围：仅首页前端结构与五套 locale。回滚方式：恢复 `Workspace/Home.vue` 与对应 locale 到本次改动前版本即可。

## 0.0.48 (2026-04-14)
- 首页结构继续专业化：`chat/src/views/chat/components/Workspace/Home.vue` 已从“高频能力 + 能力编排”的同层清单，重构为“单步任务 / 多步流程”的双区工作台；左侧按“阅读与理解 / 写作与改写”组织入口，右侧独立承载流程编排，减少功能市场感并强化研究任务导向。
- 首页文案改成操作语言：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 已把首页改成更偏研究操作的措辞，如 “研究工作台 / 单步任务 / 直接提问 / 阅读与理解 / 写作与改写”，避免学术用户先读营销式或泛功能式标题。
- 长期规则入口迁移到本地 `AGENTS.md`：后续以 `AGENTS.md / STATUS.md / CHANGELOG.md` 持续维护流程与记忆，`.gitignore` 已补充 `AGENTS.md`。本地验证：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 通过；Playwright 浏览器验收本轮受现有共享 Chromium 缺失提示阻塞，未下载或替换任何运行时。影响范围：仅首页前端结构、五套 locale、本地规则文件与忽略规则。回滚方式：恢复 `Workspace/Home.vue`、对应 locale、`.gitignore` 与本地记录文件到本次改动前版本即可。
## 0.0.47 (2026-04-14)
- 继续收掉空主页文案噪音：`chat/src/views/chat/chatBase.vue` 已移除空主页内容区的大字“你的项目”，`chat/src/views/chat/components/Workspace/Home.vue` 已移除说明句“直接提问，或先导入资料。”，首页进一步只保留真正可操作的标题与入口。
- 补充同步纪律：后续默认按“完成改动后立即同步”的方式执行，至少包含本地校验、更新 `AGENTS.md / STATUS.md / CHANGELOG.md`、推送 GitHub，以及按影响范围同步服务器；前端展示层改动默认热同步 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`。
- 本地验证：已执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`。影响范围：仅聊天空主页与首页 Hero 展示，以及后续交付流程约束。回滚方式：恢复 `chatBase.vue`、`Workspace/Home.vue` 与记录文件到本次改动前版本即可。

## 0.0.46 (2026-04-14)
- 继续收掉空主页冗余标题：`chat/src/views/chat/chatBase.vue` 已移除空主页内容区里那行大字“你的项目”，保留顶部菜单标题，不再让空主页出现重复层级标题。
- 继续压缩首页 Hero：`chat/src/views/chat/components/Workspace/Home.vue` 已移除说明句“直接提问，或先导入资料。”，首屏只保留主标题和两个直接动作，减少无效解释。
- 本地验证：已重新执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production`。影响范围：仅聊天空主页与首页 Hero 展示。回滚方式：恢复 `chatBase.vue` 与 `Workspace/Home.vue` 到本次改动前版本即可。

## 0.0.45 (2026-04-14)
- 已完成一次头部标题修正同步：`chat/src/views/chat/components/Header/index.vue` 已恢复顶部菜单区的“你的项目”标题，并再次同步到 GitHub 与线上静态资源，确保顶部菜单标题存在、聊天主区大字不回退。
- 本次发布仍采用前端静态零停机方式：仅更新 `chat/dist` 到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，保持“静态资源先传、`index.html` 最后覆盖、不删除旧哈希文件”的切换策略，不动学术服务目录。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过。影响范围：仅聊天工作区顶部头部与对应前端构建产物。回滚方式：恢复 `Header/index.vue` 与 `public/chat` 到上一版构建产物即可。

## 0.0.44 (2026-04-14)
- 修正工作区标题误删：`chat/src/views/chat/components/Header/index.vue` 已恢复顶部菜单区的“你的项目”标题，继续保留可拖拽头部区域和右侧操作按钮，不再把顶部菜单标题和聊天主区的大标题混为一处。
- 保持聊天主区收口不回退：本次没有恢复 `chat/src/views/chat/chatBase.vue` 里的大字展示调整，只修正了头部菜单被误删的问题，避免聊天界面重新出现重复的大标题。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 通过。影响范围：仅工作区顶部头部展示。回滚方式：恢复 `Header/index.vue` 到本次改动前版本即可。

## 0.0.43 (2026-04-14)
- 已完成一次代码与现网同步：当前工作树已提交为 `48afaab feat: refine workspace experience and service runtime` 并推送到 `origin/main`，GitHub 主线与本地当前代码状态已对齐。
- 已完成一次整套服务器同步：本地 `service/dist/`、`admin/dist/`、`chat/dist/` 已同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy`，其中前端仍采用“静态资源先传、`index.html` 最后覆盖”的方式；同时把 `academic-4.0/shared_utils/fastapi_stream_server.py` 同步到 `/www/wwwroot/Lens/academic-4.0/shared_utils/`。
- 已完成必要重载与回查：远端 `lens-academic` 已通过 PM2 重启为新进程 `4048524`，`9520` 主服务已重载为新进程 `4048630`；`https://lens.yutoai.net/` 当前返回 `HTTP 200`，`Last-Modified` 为 `2026-04-13 22:55:10 GMT`。影响范围：`AIWebQuickDeploy` 运行时代码、前后台静态资源与学术服务共享流式模块。回滚方式：回退 GitHub 到上一提交并把服务器 `AIWebQuickDeploy/dist`、`AIWebQuickDeploy/public` 与 `academic-4.0/shared_utils/fastapi_stream_server.py` 恢复到上一版产物后，再按相同方式重载服务。

## 0.0.42 (2026-04-14)
- 继续压缩首页首屏高度：`chat/src/views/chat/components/Header/index.vue` 已移除顶部重复显示的“你的项目”标题；`chat/src/views/chat/components/Workspace/Home.vue` 已把首页收紧为 4 个高频能力入口和 2 个精选案例，并同步缩小 Hero 标题、分区标题与列表留白，尽量避免用户进入首页后还要下滑才能看完主要入口。
- 保持目录式布局不回退：高频能力区继续保持无卡片的两列清单，编排区保持“能力编排”标题、一个“自己编排”入口和 2 个精选案例，仍然不回到卡片矩阵或多层容器。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过。影响范围：仅首页与工作区头部前端展示，不涉及服务端和现网进程。回滚方式：恢复 `Header/index.vue` 与 `Workspace/Home.vue` 到本次改动前版本即可。

## 0.0.41 (2026-04-14)
- 继续收口首页目录结构：`chat/src/views/chat/components/Workspace/Home.vue` 已把编排区标题从“科研流水线”改成更准确的“能力编排”，避免与第一条“自己编排”入口形成重复语义；主页当前保留“自己编排”入口和 3 个精选案例，不再扩成整组模板展示。
- 同步补齐列表式入口文案：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 已补充 `starterAction` 并把编排区标题统一调整为“能力编排 / Capability Flows / 機能編成 / 能力編排 / 기능 조합”。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过；并用 Playwright 打开本地 `vite preview` 进行真实页面核对，确认首页当前是目录式而非卡片式布局。影响范围：仅首页前端结构与多语言文案，不涉及服务端和现网进程。回滚方式：恢复 `Workspace/Home.vue` 与上述 locale 文件到本次改动前版本即可。

## 0.0.40 (2026-04-13)
- 继续收口首页视觉语言：`chat/src/views/chat/components/Workspace/Home.vue` 已把高频能力区和编排区从圆角小容器/小卡片改成分隔线式线性清单，Hero 也去掉了容器感，首屏整体改成更接近研究目录页的结构。
- 编排区只保留一个“自己编排”入口和三个案例：主页不再同时铺一整组模板项，避免信息拥挤；对应 `chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 新增 `starterAction` 文案键，用于新的列表式高频能力入口。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过。影响范围：仅首页前端结构与多语言文案，不涉及服务端和现网进程。回滚方式：恢复 `Workspace/Home.vue` 与上述 locale 文件到本次改动前版本即可。

## 0.0.39 (2026-04-13)
- 已完成主页简化版本的二次线上同步：把本地最新 `chat/dist` 再次同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，继续采用“先同步除 `index.html` 外的静态资源、最后覆盖 `index.html`、不删除旧哈希文件”的零停机方式发布，不影响已打开页面和缓存中的旧哈希资源。
- 同步后线上核查通过：`https://lens.yutoai.net/` 继续返回 `HTTP 200`，响应头 `Last-Modified` 已更新为 `2026-04-12 20:36:09 GMT`（对应服务器东八区 `2026-04-13 04:36:09`），说明这轮首页简化版前端资源已经切到线上。
- 现网进程未受影响：服务器 `9520` 仍由原有进程 `2081187` 持续监听，`38000` 仍由原有进程 `81539` 持续监听，本轮未重启 Node 服务或学术服务。影响范围仅限 `AIWebQuickDeploy/public/chat` 下的前端静态资源。回滚方式：把 `public/chat` 恢复到上一版构建产物即可，因旧哈希文件仍保留，短期回滚风险较低。

## 0.0.38 (2026-04-13)
- 继续简化首页介绍密度：`chat/src/views/chat/components/Workspace/Home.vue` 已移除 Hero 右侧状态/步骤说明区，并把首页保留为“主标题 + 极短说明 + 两个主动作 + 高频能力 + 科研流水线”的单层结构，避免首屏出现多段解释让用户抓不住重点。
- 同步压缩首页文案：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 已把 Hero 标题、简介、高频能力标题和科研流水线编排文案压短，只保留动作导向表达，不再做流程教学式描述。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过。影响范围：仅首页前端展示与多语言文案，不涉及服务端、数据库和现网进程。回滚方式：恢复 `Workspace/Home.vue` 与上述 locale 文件到本次改动前版本即可。

## 0.0.37 (2026-04-13)
- 继续收口首页首屏：`chat/src/views/chat/components/Workspace/Home.vue` 已移除 Hero 顶部的 `Lens Research Desk` 眉标，避免首屏在品牌层之外再出现一层多余标题。
- 重做“能力编排”模板区展示：原先两列小卡片已改为单列流水线清单，每条模板现在按“编号 + 标题 + 步骤链路 + 侧边动作/状态”展示，更接近研究操作列表而不是卡片拼贴；对应多语言文案 `chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 新增了“使用这条链路”动作文案，并移除了不再使用的 `heroEyebrow` 文案。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过；并用现有 Playwright + 共享 Chromium 对首页进行了截图验收，确认首屏不再显示 `Lens Research Desk`，且科研流水线模板区已经从小卡片改为列表式展示。影响范围：仅 `Workspace/Home.vue` 与对应 locale 文案，不涉及服务端和现网进程。回滚方式：恢复 `Workspace/Home.vue` 与上述 locale 文件到本次改动前版本即可。

## 0.0.36 (2026-04-13)
- 已完成一次线上零停机静态同步：把本地 `chat/dist` 同步到服务器 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat`，采用“先同步除 `index.html` 外的全部静态资源、最后覆盖 `index.html`、不删除旧哈希文件”的方式上线本轮前端改动，避免现有用户会话因旧资源丢失而中断。
- 同步前已做只读核查：`https://lens.yutoai.net/` 同步前返回 `HTTP 200`；服务器 `9520` 当前由原有 `node dist/main.js`（PID `2081187`）提供服务，`38000` 仍为原有 `lens-academic` Python 进程（PID `81539`）。本轮未重启任何现网进程，也未触碰学术服务目录。
- 同步后线上校验通过：`https://lens.yutoai.net/` 继续返回 `HTTP 200`，响应头 `Last-Modified` 已更新到本次前端构建时间；影响范围仅限 `AIWebQuickDeploy/public/chat` 下的前端静态资源。回滚方式：如需回退，可把服务器 `public/chat` 恢复为上一次前端构建产物；由于本轮未删除旧哈希文件，短期回滚与缓存兼容风险较低。

## 0.0.35 (2026-04-13)
- 继续收敛右侧学术控制面板空态与深色模式：`chat/src/views/chat/components/Footer/components/AcademicPanel.vue` 现在在概览区补上动态引导句，把“单能力 / 能力编排”切换做成更均衡的双列按钮，并为“常用能力 / 常用工具”在无候选项时提供显式空态说明，避免深色模式下出现大片留白让人误判为面板异常。
- 同步补齐多语言空态文案：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 新增控制面板空态说明与“可直接开始 / 再展开更多设置”的引导文案，保持五种语言下的状态表达一致。
- 本地验证通过：`./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过；并使用 `/Users/hkyutong/.codex/skills/playwright/scripts/playwright_cli.sh` 配合共享 Chromium 完成深色模式真实截图验收，确认右侧控制面板空态不再留白。影响范围：仅聊天前端右侧学术控制面板及多语言文案，不涉及服务端和部署。回滚方式：恢复 `AcademicPanel.vue` 与上述 locale 文件到本次改动前版本即可。

## 0.0.34 (2026-04-13)
- 补强浏览器运行时禁令：`sop.md`、`STATUS.md`、`CHANGELOG.md` 已再次明确 `/Users/hkyutong/Library/Caches/ms-playwright/chromium-1217/...` 属于全局共享 Playwright Chromium 运行时，严禁清理、删除、移动或替换，也不能当作普通缓存处理。
- 继续收敛科研流水线反馈：`chat/src/views/chat/components/Message/Text/index.vue` 现在在折叠态增加进度条、已完成步数和当前/失败状态 chip，并补上步骤卡片的完成态/运行态/失败态样式，深色模式下也保持更稳定的对比度与状态辨识度；`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 同步新增对应文案。
- 本地验证通过：直接使用项目现有二进制执行 `./chat/node_modules/.bin/vue-tsc --noEmit && echo TYPECHECK_OK` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过；期间未下载、安装或升级任何新依赖。影响范围：仅聊天消息区的科研流水线展示与多语言文案，不涉及服务端和部署链路。回滚方式：恢复 `Message/Text/index.vue` 与上述 locale 文件到本次改动前版本即可。

## 0.0.33 (2026-04-13)
- 收敛空状态首页首屏焦点：`chat/src/views/chat/components/Workspace/Home.vue` 从“说明 + 平铺按钮”重构为“主动作 Hero + 高频能力区 + 科研流水线区”的三段结构，补上真正可点击的“直接开始”和“导入资料”入口，并加入当前能力状态卡与三步引导，减少首屏入口堆叠导致的焦点分散。
- 同步补齐首页文案多语言：`chat/src/locales/zh-CN.json`、`chat/src/locales/en-US.json`、`chat/src/locales/ja-JP.json`、`chat/src/locales/zh-TW.json`、`chat/src/locales/ko-KR.json` 新增首屏 Hero、三步引导和科研流水线说明文案，保持多语言界面完整。
- 本地验证通过：直接使用项目现有二进制执行 `./chat/node_modules/.bin/vue-tsc --noEmit` 与 `./chat/node_modules/.bin/vite build --mode=production` 均通过；期间未下载、安装或升级任何新依赖。
- 浏览器验收未完成但已受控停止：尝试用现有 Playwright 包装脚本做本地可视化验收时，包装层报“shared Playwright Chromium is missing”，但共享 Chromium 目录仍在本机缓存中；本轮仅做只读确认，没有下载新浏览器，也没有继续展开排障。影响范围：仅前端空状态首页和对应文案，不涉及接口、服务端或部署链路。风险：主要是尚未完成浏览器级目测验收。回滚方式：恢复 `Workspace/Home.vue` 与上述多语言文件到本次改动前版本即可。

## 0.0.32 (2026-04-13)
- 仅更新项目记录文件，不改业务代码：`sop.md`、`STATUS.md`、`CHANGELOG.md` 已同步补充长期工程约束，明确后续代码必须保持结构清楚、分层明确、命名准确、抽象克制、职责单一、可读可测可维护可扩展，禁止为了图快堆砌屎山代码或主动留下隐性技术债。
- 安全规则进一步收紧：补充“敏感信息、隐私文件和内部资产默认只在本地安全环境处理，遵循最小暴露、最小权限、最小留痕；未经用户明确批准，禁止上传到服务器、GitHub、公开站点或第三方平台”的长期约束，并继续保留 `受控服务器入口文件` 仅限本地使用的禁令。
- 文档维护规则改为强制执行：以后每次任务完成后都要同步更新 `STATUS.md`、`sop.md`、`CHANGELOG.md`，其中 `STATUS.md` 负责当前状态快照，`CHANGELOG.md` 负责已发生事实，`sop.md` 负责稳定流程与长期规范。
- 工具与清理规则补齐：确认可直接使用已安装的插件、skill、Playwright 与现有共享 Chromium；测试结束后主动关闭 Chromium；同时把“清理本地垃圾前必须先评估是否影响业务、调试、审计、回滚和维护”写入长期规则。影响范围仅限记录与流程约束，无运行时行为变化；风险较低。回滚方式：若未来确认这些规则描述需要调整，仅回退本次对 `sop.md`、`STATUS.md`、`CHANGELOG.md` 的文档修改即可。

## 0.0.31 (2026-04-12)
- 完成长会话抗卡死与上线验证收尾：`service/src/modules/chatLog/chatLog.service.ts` 正式固定 `/chatlog/chatList` 为分页接口，`chat/src/store/modules/chat/index.ts`、`chat/src/views/chat/chatBase.vue`、`chat/src/views/chat/components/Message/index.vue`、`chat/src/views/chat/components/Message/Text/index.vue` 同步完成历史记录分页加载、顶部加载旧消息、可视区窗口化渲染与正文缓存，配合 `service/scripts/prod_gate_suite.mjs`、`service/scripts/full_smoke_test.mjs` 与 `service/playwright/long_chat_pressure.spec.cjs` 完成 500/1000 条长会话压测与发布闸门验证。
- 完成学术上传架构收口：`service/src/modules/academic/academic.service.ts`、`academic-4.0/shared_utils/lens_storage.py`、`academic-4.0/shared_utils/fastapi_stream_server.py`、`academic-4.0/shared_utils/path_safety.py` 与 `academic-4.0/toolbox.py` 将当前“双存原件”改为“共享唯一原件 + academic 按需临时副本”，唯一原件继续保留在 `service/public/file/userFiles`；`private_upload` 只承载远程文件、压缩包和必须改写的学术工作目录，并新增 `24h` 临时副本、`6h` 解压目录、`7d` Lens 专用结果目录清理策略。
- 完成科研流水线 v1：`service/src/modules/academic/academic.service.ts` 新增 `/academic/workflow-process`，支持最多 `1-3` 步的基础能力/研究工具串联执行；`chat/src/views/chat/components/Workspace/Home.vue`、`chat/src/views/chat/components/Footer/index.vue`、`chat/src/views/chat/components/Footer/components/AcademicPanel.vue`、`chat/src/views/chat/components/Message/Text/index.vue` 同步增加模板入口、自定义编排、步骤进度和最终结果展示，保持“单条用户消息 + 单条助手结果”的对话结构。
- 前端交互继续从“工作台”收敛到“研究工具”：`chat/src/views/chat/components/Workspace/Home.vue`、`chat/src/views/chat/components/Message/Text/index.vue`、`chat/src/views/chat/components/Footer/index.vue` 与 `chat/src/views/chat/components/Footer/components/AcademicPanel.vue` 进一步简化首页引导、前置高频能力、弱化右侧辅助面板、压缩用户附件为短标签，并补齐多语言与深色模式细节，目标是保持 Lens 品牌视觉的同时恢复学术 GPT 式的高效交互。
- 完成一次完整发布链路：代码已推送到 `origin/main`（提交 `32420b0 feat: add academic workflows and shared file runtime`），并同步部署到 `/www/wwwroot/Lens/AIWebQuickDeploy` 与 `/www/wwwroot/Lens/academic-4.0`；上线后完成登录、上传、学术调用、支付、科研流水线主链路 smoke，线上 `9520` 与 `38000` 核心接口返回正常。
- 补齐服务器学术运行依赖：服务器 `academic-4.0/venv` 已补装 `openpyxl`、`scipy`、`rarfile`、`py7zr`、`python-pptx`、`pdfminer.six`、`markdownify`，解决 Excel、音频、压缩包、PPT、部分 PDF 与 Markdown 转换类功能的缺包风险。
- 浏览器验收策略更新：Playwright 默认浏览器实测入口改为 `/Users/hkyutong/.codex/skills/playwright/scripts/playwright_cli.sh` 配合 `/Users/hkyutong/.codex/skills/playwright/.playwright/cli.config.json`，默认使用 Playwright 缓存中的 Chromium/Google Chrome for Testing，不再默认依赖本机 `Google Chrome.app`。
- 已知风险：学术服务仍受第三方模型源稳定性影响，单个模型端点超时可能导致个别能力偶发失败；前端深色模式与科研流水线观感仍在持续打磨中。回滚方式：恢复 `/www/wwwroot/Lens/AIWebQuickDeploy/public/chat` 与 `/www/wwwroot/Lens/AIWebQuickDeploy/dist` 到上一版发布包、恢复 `/www/wwwroot/Lens/academic-4.0` 到上一版同步内容，并重启 `Lens` 与 `lens-academic`。

## 0.0.30 (2026-03-19)
- 将 `chat` 前端从“通用聊天页 + 学术按钮”重构为“学术工作台”：`chat/src/views/chat/chatBase.vue`、`chat/src/views/chat/components/Workspace/Home.vue`、`chat/src/views/chat/components/Footer/index.vue`、`chat/src/views/chat/components/Footer/components/AcademicPanel.vue`、`chat/src/views/chat/components/sider/index.vue`、`chat/src/views/chat/components/sider/List.vue` 与 `chat/src/views/chat/components/sider/ListItem.vue` 现在改为左侧研究导航、中间研究会话区、右侧常驻研究控制栏的布局；空状态首页改成 Research Desk，输入区改成更偏论文/研究工作流的 composer，学术模式在 UI 上提升为“研究模式”主流程。
- 统一学术工作台视觉系统：`chat/src/styles/global.less`、`chat/src/styles/themes/light.css` 与 `chat/src/styles/themes/dark.css` 新增 paper/surface/accent 等设计 token，整体改成更偏专业学术产品的浅色主视觉，同时保留暗色模式兼容。
- 补强站点 SEO 与 AI SEO：`chat/index.html` 与 `chat/src/App.vue` 现在会输出并动态同步 `title`、`description`、`keywords`、`robots`、Open Graph、Twitter Card、canonical 与 JSON-LD 结构化数据；SPA 入口新增可供搜索引擎和 AI 抓取器理解的静态语义首屏。
- 新增 AI 检索与爬虫入口：`chat/public/robots.txt` 增加对 `GPTBot`、`OAI-SearchBot`、`ClaudeBot`、`PerplexityBot` 等爬虫的规则；新增 `chat/public/llms.txt` 与 `chat/public/llms-full.txt` 描述 Lens 的学术产品定位；`chat/public/icon/manifest.webmanifest` 同步补齐名称、描述、启动路径并修复图标路径错误。
- 增加 AI SEO 内容层专题页：新增 `chat/public/seo/research-workspace.html`、`chat/public/seo/paper-summary.html`、`chat/public/seo/arxiv-summary.html`、`chat/public/seo/latex-translation.html`、`chat/public/seo/academic-polishing.html`、`chat/public/seo/faq.html` 与 `chat/public/seo/styles.css`，把 “AI 学术工作台 / 论文速读 / Arxiv / LaTeX / 学术润色 / FAQ” 做成可被搜索引擎和 AI 检索器直接抓取的静态落地页，并接入 `index.html` 静态语义首页、`llms.txt`、`llms-full.txt`、`robots.txt` 与动态 `sitemap.xml` 的发现链路。
- 新增动态站点地图：`service/src/modules/spa/spa.controller.ts` 增加 `/sitemap.xml` 输出，优先跟随后台 `siteUrl` 配置生成公开页面与 AI 文档入口的 sitemap，避免把域名写死在静态文件中。
- 消除前端构建警告：`chat/src/main.ts` 改为只注册实际使用的 Iconify 图标子集，新增 `chat/src/constants/iconCollections.ts` 承载本地图标集合，避免把整套 `@iconify-json/material-symbols` 与 `@iconify-json/ri` 全量打进主包；`chat/vite.config.ts` 调整 Rollup `manualChunks` 粒度，拆分 `markdown/highlight/katex/codemirror` 等 vendor；`chat/src/App.vue`、`chat/src/views/chat/chat.vue`、`chat/src/views/chat/chatBase.vue`、`chat/src/views/chat/components/Message/index.vue`、`chat/src/views/chat/components/Message/Text/index.vue`、`chat/src/components/SettingsDialog.vue`、`chat/src/components/MobileSettingsDialog.vue` 与 `chat/src/components/Login/Login.vue` 进一步改为按需异步加载重组件和 `mermaid`，最终消除了 `vite build` 的 chunk size 警告，并通过更新 `chat/pnpm-lock.yaml` 中的 `caniuse-lite` 数据消除了 `Browserslist` 过期警告。
- 增加图标兜底：`chat/src/components/common/SvgIcon/index.vue` 现在会对未预注册的字符串图标自动回退到本地 `ri:question-line`，配合 `chat/src/constants/iconCollections.ts` 的已打包图标白名单，避免未来新增图标名但未同步到本地图标集时出现生产环境空白图标。
- 完成验证：`pnpm -C chat type-check`、`pnpm -C chat exec vite build --mode=production`、`pnpm -C service exec tsc -p tsconfig.json --noEmit` 与 `pnpm -C service run build:test` 均通过；当前前端生产构建输出已消除 `chunk size` 与 `Browserslist` 警告。

## 0.0.29 (2026-03-12)
- 修复手机端学术插件面板交互：`chat/src/views/chat/components/Footer/components/AcademicPanel.vue`、`chat/src/views/chat/components/Footer/index.vue`、`chat/src/views/chat/chatBase.vue` 与 `chat/src/store/modules/chat/index.ts` 现在将“学术模式是否启用”和“手机端面板是否展开”拆分为两个状态；右上角 `x` 只会收起手机端学术面板，不会取消当前学术能力选择，底部“学术”按钮在手机端可重新展开面板。
- 收敛生产环境内部错误暴露：`chat/src/main.ts`、`chat/src/views/chat/chatBase.vue` 与 `service/src/modules/academic/academic.service.ts` 现在仅在 `dev/test` 显示调试红条和详细请求标识，生产环境改为通用用户文案，不再直接暴露内部错误状态与请求 ID。
- 修复生产环境学术插件列表异常导致前端崩溃：`chat/src/store/modules/chat/index.ts` 对 `/academic/core-function-list` 与 `/academic/plugin-list` 返回值统一做数组兜底，避免异常返回体触发 `undefined.map`。
- 修复生产环境动态图标回源外网：`chat/src/main.ts` 与 `chat/package.json` 预注册本地图标集，避免生产部署时再请求 `api.simplesvg.com` 导致图标加载失败。
- 优化部署包清理与 macOS 元数据处理：`build.sh` 新增 `sanitize_macos_metadata`，`AIWebQuickDeploy` 打包前会自动移除 `._*` 与 `.DS_Store`，降低上传服务器后出现脏文件的概率。

## 0.0.28 (2026-03-10)
- 修复中英文润色“刷新页面后表格重新挤在一起”：`service/src/modules/academic/academic.service.ts` 现在将流式阶段形成的稳定三列表 `修改前原文片段 | 修改后片段 | 修改原因与解释` 作为只增不减的快照保存，并在正常结束、超时、上游中断与异常分支统一优先用该快照回包和落库，避免后续汇总文本再次污染历史记录。

## 0.0.27 (2026-03-09)
- 修复中英文润色“生成过程是稳定三列表、结束后又跳成拥挤布局”：`chat/src/views/chat/chatBase.vue` 与 `service/src/modules/academic/academic.service.ts` 现在只锁定连续且完整的三列表 `修改前原文片段 | 修改后片段 | 修改原因与解释`，完成态优先保留该稳定表格，不再用后端汇总大段文本覆盖流式结果。
- 修复重新生成与编辑未跟随当前前端选模：`chat/src/views/chat/chatBase.vue`、`chat/src/views/chat/components/Message/Text/index.vue` 与 `service/src/modules/chat/chat.service.ts` 统一显式携带当前 `model/modelName/modelType/modelAvatar`，后端在用户已选模型但配置不可用时直接报错，不再静默回退到默认模型。
- 修复重新生成与编辑误覆盖后续消息链：`chat/src/views/chat/chatBase.vue` 与 `chat/src/views/chat/components/Message/Text/index.vue` 现在只在前端可见列表中裁剪被编辑/重生回复之后的消息，不再误把整段历史回复覆盖到当前气泡里；后端历史记录不删除，只重写当前用户消息对应的第一条 assistant 回复。

## 0.0.26 (2026-03-08)
- 修复中英文润色“刷新页面后表格重新挤成一团”：`service/src/modules/academic/academic.service.ts` 在学术流式阶段检测到稳定的三列表 `修改前原文片段 | 修改后片段 | 修改原因与解释` 后，会优先把该稳定版本持久化到聊天记录，避免刷新后又回退成学术后端最终汇总的大段文本。
- 修复重新生成/编辑后后续聊天记录仍然残留：`chat/src/views/chat/chatBase.vue` 与 `chat/src/views/chat/components/Message/Text/index.vue` 在触发编辑或重生前，先删除当前回复之后的持久化分支消息并同步裁剪本地列表，只保留被编辑用户消息及其即将重写的回复，不再让后续旧对话继续显示。
- 修复中英文润色“生成时表格正常、生成完成后跳一下变拥挤”：`chat/src/views/chat/chatBase.vue` 为润色任务新增稳定三列表快照，一旦流式阶段已经出现正确的 `修改前原文片段 | 修改后片段 | 修改原因与解释` 表格，完成态将直接沿用该快照，不再被学术后端最终汇总文本覆盖，避免第三列解释内容在结束时重新挤成大段。
- 修复重新生成/编辑覆盖错误回复的问题：`chat/src/views/chat/chatBase.vue` 与 `chat/src/views/chat/components/Message/Text/index.vue` 统一改为只覆盖“被编辑用户消息后的第一条 assistant 回复”，不再误选后续回复导致下面聊天记录整体消失。
- 修复重新生成/编辑未跟随当前模型：`chat/src/views/chat/chatBase.vue` 通过 `provide` 暴露当前会话选中模型信息，`chat/src/views/chat/components/Message/Text/index.vue` 在点击重新生成/编辑时显式携带当前模型、模型名、模型类型与头像，确保前端切换模型后后端即时同步使用。

## 0.0.25 (2026-03-08)
- 回退中英文润色结果展示为稳定三列表现：`service/src/modules/academic/academic.service.ts` 移除展示层把 `修改原因与解释` 强拆成 `修改原因 | 修改解释` 的后处理，恢复为学术后端原生三列表格输出，避免生成完成后最终表格列宽失衡、解释内容挤成大段难以阅读。

## 0.0.24 (2026-03-08)
- 修复学术模型切换不同步：`service/src/modules/academic/academic.service.ts` 取消学术链路对 `deepseek-v3.2` 的硬编码静默回退，显式选模时优先按 `model` 与 `modelName` 解析已启用模型；当前端已选择模型但后端无法解析时，直接返回清晰错误而不是偷偷改用默认模型。
- 增加模型切换本地即时生效：`chat/src/views/chat/components/Header/index.vue` 在用户切换模型时先本地更新当前会话 `modelInfo` 并持久化，再异步回写服务端，避免“刚切换模型马上发送学术请求仍带旧模型”的竞态。
- 恢复中英文润色四列表头展示但不再冒险修改学术提示词主体：`service/src/modules/academic/academic.service.ts` 新增润色 Markdown 表格后处理，把稳定输出的三列表 `修改前原文片段 | 修改后片段 | 修改原因与解释` 自动拆成四列表 `修改前原文片段 | 修改后片段 | 修改原因 | 修改解释`，并对原因列做短标签提炼、对解释列做单项说明，降低整段说明挤进同一列的问题。
- 收紧聊天端类型检查范围：`chat/tsconfig.json` 显式限定 `include` 到真实源码文件，并为 `vue-tsc` 打开 `allowJs` 兼容虚拟 `*.vue.js` 伴生文件，避免类型检查误报不存在的 JavaScript 文件。

## 0.0.23 (2026-03-08)
- 修复 `中文润色` 与 `英文润色` 点击后返回“学术后端未返回可展示内容”：`academic-4.0/core_functional.py` 回退这两个按钮的表格提示词到已验证可用的三列表头 `修改前原文片段 | 修改后片段 | 修改原因与解释`，保留“小句/短片段、一行一个局部修改”的粒度约束，避免四列表头提示词导致学术后端产出被打空。

## 0.0.22 (2026-03-08)
- 调整中英文润色表格结构：`academic-4.0/core_functional.py` 将润色结果表头从 `修改前原文片段 | 修改后片段 | 修改原因与解释` 改为 `修改前原文片段 | 修改后片段 | 修改原因 | 修改解释`，并要求“原因”只写简短标签、“解释”只解释单一改动，避免两者混写在同一单元格。
- 移除 `AIWebQuickDeploy/start.sh`：轻量部署包不再内置自动部署脚本，统一改为“人工宝塔 Node 项目部署”模型，避免部署包误导出额外 PM2/用户归属逻辑。
- 修正轻量部署包启动命令：`build.sh` 生成的 `AIWebQuickDeploy/package.json` 现在将 `pnpm start` 与 `pnpm start:daemon` 统一改为 `node ./dist/main.js`，删除对 `bash ./start.sh` 的隐式依赖，解决宝塔环境中删除 `start.sh` 后 `pnpm start` 直接失败的问题。
- 更新宝塔部署说明：`AIWebQuickDeploy/README.md` 与 `docs/DEPLOYMENT.md` 删除 `start.sh` 相关文案，只保留 `dist/main.js` 的人工部署路径。

## 0.0.21 (2026-03-07)
- 调整轻量部署说明为宝塔优先：`AIWebQuickDeploy/README.md` 与 `docs/DEPLOYMENT.md` 现在以“宝塔 Node 项目部署”作为主路径，明确 `AIWebQuickDeploy` 的启动文件应为 `dist/main.js`、运行目录为部署包根目录，`start.sh` 仅保留为命令行兜底方式，不再作为文档中的默认部署入口。
- 优化中英文润色表格粒度：`academic-4.0/core_functional.py` 中的 `中文润色` 与 `英文润色` 提示词改为强制按“小句/短片段”输出 Markdown 表格，列名统一为 `修改前原文片段 | 修改后片段 | 修改原因与解释`，并明确要求“一行只描述一个局部修改、单元格尽量简短”，减少一整段文本被塞进单个表格单元格的情况。
- 调整部署文档为用户无关写法：`docs/DEPLOYMENT.md` 不再绑定 `root/www` 这类特定系统用户，改为要求部署者自行选择并始终使用同一个业务用户，避免文档层误导出交叉启动。
- 修复轻量部署包复用旧 PM2 进程导致环境变量不刷新的问题：`build.sh` 在生成 `AIWebQuickDeploy/package.json` 时将 `pnpm start` 与 `pnpm start:daemon` 统一改为调用 `bash ./start.sh`，确保每次部署都先删除旧的 `Lens` 进程，再基于最新 `.env` 与 `pm2.conf.json` 重新创建进程，不再因为 `restartProcessId` 沿用旧的 `ADMIN_SERVE_ROOT`。
- 清理聊天前端高频调试噪声：移除 `chat/src/App.vue`、`chat/src/utils/request/index.ts`、`chat/src/store/modules/global/index.ts`、`chat/src/views/chat/chatBase.vue`、`chat/src/views/chat/components/Footer/index.vue`、`chat/src/views/chat/components/Message/Text/index.vue`、`chat/src/components/common/ImageViewer/index.vue` 中的生产路径 `console.log` 调试输出，减少前端控制台垃圾和运行时噪声。
- 修复后台自定义入口与后台前端打包基路径脱节的问题：`admin/vite.config.ts` 生产构建改为相对资源路径，`admin/src/router/index.ts` 生产环境按当前访问路径自适应 `hash` 路由基座，避免后台入口改为 `/alice3306` 后 HTML 仍引用 `/admin/*` 资源、路由仍回跳旧前缀。
- 修复旧 `/admin` 地址在自定义后台入口启用后被聊天前台 SPA 误吞的问题：`service/src/modules/spa/spa.controller.ts` 现在会同时保留对当前后台入口和遗留 `/admin` 的排除，避免旧后台地址误返回前台页面。

## 0.0.20 (2026-03-07)
- 修复后台自定义路径在生产部署中不生效：新增 `service/src/preload-env.ts`，并在 `service/src/main.ts` 中先加载 `.env` 再导入 `AppModule`，确保 `ADMIN_SERVE_ROOT` 等在模块初始化阶段就能读取到，避免后台路径始终回退到 `/admin`。
- 加固 PM2 运行时环境注入：`service/pm2.conf.json` 与 `AIWebQuickDeploy/pm2.conf.json` 新增 `env_file: ".env"`，确保通过 `pm2 start pm2.conf.json`、`AIWebQuickDeploy/start.sh`、宝塔 PM2 等方式启动时都能稳定读取部署目录下的 `.env`。

## 0.0.19 (2026-03-07)
- 修复前台初始化配置请求的域名参数问题：`chat/src/main.ts`、`chat/src/store/modules/auth/index.ts`、`chat/src/api/config.ts` 不再默认把站点域名拼进 `/config/queryFront` 查询串，避免生产站点层因 `domain=https://...` 或空 `domain` 触发额外拦截；前端默认改为直接请求 `/config/queryFront`。
- 加固前台域名同步逻辑：`service/src/modules/globalConfig/globalConfig.service.ts` 现在会规范化 `domain`，仅在拿到有效的 `scheme://host` 后才更新站点域名配置；空值或非法值会自动回退到反向代理请求头，不再把空域名写回数据库配置。

## 0.0.18 (2026-03-07)
- 新增学术服务 PM2 配置文件 `academic-4.0/ecosystem.config.cjs`，可直接供宝塔 PM2「配置文件」模式使用，统一以 `./venv/bin/python` 启动 `shared_utils/fastapi_stream_server.py`，降低学术服务长期运行配置门槛，避免在宝塔界面手工拼接 Python 启动参数。

## 0.0.17 (2026-03-07)
- 修复本地与服务器轻量部署脚本的 `pnpm` 可用性问题：`build.sh` 与 `AIWebQuickDeploy/start.sh` 不再假设 `corepack prepare` 后 `pnpm` 会自动出现在当前 shell 中，统一改为显式走 `corepack pnpm` 兜底，避免 `QUICK_DEPLOY_ONLY=1 ./build.sh` 和部署包 `./start.sh` 在未全局安装 `pnpm` 的环境下直接报 `pnpm: command not found`。
- 保持轻量部署链路可直接复用：当机器未全局安装 `pnpm` 时，部署脚本现在会在不污染现有环境的前提下继续完成依赖安装与启动，降低 `AIWebQuickDeploy` 上传后的一次部署失败概率。

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
- 修复部署包纯打包模式依赖错误：`build.sh` 在 `QUICK_DEPLOY_ONLY=1` 下不再强制要求 `pm2`，本地/构建机可直接生成 `AIWebQuickDeploy` 包，无需预装进程守护工具。
- 修复学术服务日志权限崩溃：`academic-4.0/shared_utils/fastapi_stream_server.py` 的学术日志初始化改为自动尝试 `ACADEMIC_LOG_FILE -> PM2_HOME/logs -> /tmp/lens-academic/academic.log`，即使项目目录日志文件不可写也不会导致 `lens-academic` 启动失败。
- 增强轻量部署防误用提示：`AIWebQuickDeploy/start.sh` 现在会在 root 运行时显式警告 PM2 用户分裂风险，部署文档同步要求统一使用同一业务用户启动。
- 恢复 AIWebQuickDeploy 轻量部署包链路：`build.sh` 现在会自动把 `service dist` 与 `admin/chat dist` 同步到 `AIWebQuickDeploy/`，并新增 `QUICK_DEPLOY_ONLY=1` 只打包不启动模式。
- 新增 `AIWebQuickDeploy/start.sh` 与配套说明文档，目标服务器可直接安装运行时依赖并用 PM2 启动 `Lens`。
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
- 修复验收脚本默认账号与环境兼容性：`admin_write_smoke_test`、`full_smoke_test`、`e2e_acceptance` 默认改为 `super/[本地测试凭据已脱敏]`，支持在不同工作目录正确定位 `.env` 与样例文件。
- 修复 `e2e_acceptance` 退出码问题：当步骤失败/校验失败/插件失败时返回非 0，避免“失败却显示通过”。
- 新增生产验收脚本 `service/scripts/prod_gate_suite.mjs`：覆盖登录、后台、积分、安全、性能及数据库落库核验，输出可上线判定与阻断项。
- 为长耗时脚本补充可控参数：`full_smoke_test` 与 `e2e_acceptance` 支持 `*_CORE_ONLY` / `*_PLUGIN_LIMIT`，用于稳定复测与回归。

## 0.0.1 (2026-02-04)
- 初始化版本

- 2026-03-11: 修复刷新后普通聊天消息被误隐藏；收紧学术润色表格快照提取，避免刷新后第三列内容挤在一起。

## 2026-07-15 三件套命名与职责统一

- 已将本目录三件套统一为 `AGENTS.md`、`STATUS.md`、`CHANGELOG.md`。
- 职责固定为：`AGENTS.md` 保存少改的长期规则；`STATUS.md` 保存当前状态并在每次交接时覆盖更新；`CHANGELOG.md` 只追加已确认事实。
- 本次仅调整本地项目文档名称、职责说明和相互引用；未修改业务代码、线上服务、生产配置或业务数据。

## 2026-08-31 AcademicGPT 前端重构续进

- 研究入口、能力面板、消息状态和滚动到底部完成首轮键盘可达性收口：补充 `focus-visible`、`aria-pressed`、`role=status`/`aria-live` 与 Enter/Space 操作；契约脚本同步增加静态断言。
- 导入资料区域、研究输入框和能力面板说明改为从 `zh-CN / zh-TW / en-US / ja-JP / ko-KR` locale 读取，避免新增界面继续混用硬编码中文。
- 390×844 移动视口只读复核确认研究入口、任务列表、研究输入框和能力设置入口真实渲染；临时浏览器标签、视口和 Vite 服务已恢复/关闭。
- 尝试运行本地 Academic 回归套件未形成通过结论：共享 Chromium 可执行文件存在，但当前 Playwright 版本缺少对应 `chromium_headless_shell`；同时本地 Vite API 代理目标未解析为有效 URL，后端请求不可用。未下载浏览器、未安装依赖、未修改服务器或线上数据。
- 本轮通过 `npm run verify:research-contract`、`vue-tsc --noEmit -p tsconfig.json`、`vite build --mode=production` 和 `git diff --check`；构建仍仅有既有 chat store 动静态导入 warning。
- 修复本地 Vite API 代理读取错误：`chat/vite.config.ts` 现在优先使用实际存在的 `VITE_GLOB_API_URL`，并提供旧变量及 `127.0.0.1:9520` 兜底；生产请求契约、后端端点和部署路径未改变。
- 进一步收敛 Vite 配置职责：`VITE_GLOB_API_URL` 只作为客户端 API 前缀，proxy target 会去除末尾 `/api`，显式 `VITE_APP_API_BASE_URL` 优先；避免开发代理把带路径的客户端 URL 当作 origin。
- AppList 入口已隔离后，移除 Footer 挂载时对 `/app/list` 的无必要请求；保留旧选择状态与兼容分支，避免扩大删除范围。
- 使用仅本机 mock API 的浏览器闭环确认研究首页、中文润色学术流、结果落地、刷新恢复、文献综述通用 chat 入口均可运行，且主界面不出现 AppList；该结果不替代真实后端回归。
- 完成后端编译回归：`service` 的 TypeScript no-emit 检查与 Nest build 均成功；`verify_research_contract.mjs` 新增对 Academic controller 四个路由的静态一致性断言，防止前端契约常量与后端路由漂移。
- 收口未登录初始化噪声：Footer 仅在已有登录态时预加载 Academic 能力列表，未登录用户不会因能力列表请求触发无意义 401；任务入口仍保留按需加载能力数据的路径。
- 2026-08-31：`MemberCenter.vue` 对签到接口返回值增加数组与字段归一化，异常配置不会再让非核心签到视图触发 `map/some` 类型错误；未改变签到接口、计费或用户权益语义。契约验证、类型检查、生产构建与 diff 校验均通过。
- 2026-08-31：扩展 `service/playwright/academic_regression.spec.cjs`，增加上传论文随学术请求提交、会员能力编排添加步骤并提交工作流两条浏览器回归场景；脚本通过 `node --check`，实际执行仍等待可用的匹配 Playwright headless shell。
- 2026-08-31：实际尝试运行 4 条 Academic 浏览器回归时，Playwright 仍寻找不存在的 `chromium_headless_shell-1169`，因此 4 条均未启动浏览器；已删除生成的 `service/test-results` 临时错误记录并关闭本地 Vite 服务，未下载浏览器或安装依赖。
- 2026-08-31：回归入口已与当前 AcademicGPT UI 对齐，不再依赖已移除的“学术模式切换”按钮，改由研究任务和能力选择进入 Academic 模式；4 条场景可被正确发现。
- 2026-08-31：研究本地状态迁移增加类型边界，隐藏回复索引只接受合法群组/回复 ID，异常旧 `chatStorage` 不会污染刷新恢复；契约验证、类型检查与 diff 校验通过。
- 2026-08-31：研究状态迁移进一步将活动会话、群组键和回复索引归一化为正整数，重复/非法 ID 丢弃；正常历史会话兼容不变。
- 2026-08-31：移除公网用户端对 99AI 应用市场的全部挂载与调用：Footer 不再请求 `/app/*` 列表、不再提供 `@应用` 搜索和应用选择；chatBase 不再加载 AppList/AppTips、不再提供应用配置弹窗，空会话统一进入 AcademicGPT 研究首页。历史 `appId` 仍仅透传给兼容请求。
- 2026-08-31：依据 Lens 删除门槛，旧 99AI 用户端源码及 API/store 未物理删除，保留为回滚资产且不进入当前构建入口；待真实后端联调、计费/分享、部署回滚和观察周期完成后再删除。
- 2026-08-31：Playwright 配置与策略守卫固定使用共享 Chromium 可执行文件；本地 mock AcademicGPT 浏览器回归 4/4 通过，覆盖编辑覆盖、润色刷新、论文上传和会员工作流；测试服务已停止，临时测试产物已清理，未触碰固定 Chromium。
- 2026-08-31：最终本地门禁 `verify:research-contract`、`vue-tsc --noEmit`、Vite production build 与 `git diff --check` 全部通过；生产构建仅保留既有 chat store 动静态导入 warning。真实 9520/Redis/academic-4.0 E2E 尚未完成。
- 2026-08-31：继续收口用户端旧状态：删除活动前端中的 `showAppListComponent` 状态与切换动作；重新构建产物未命中 `/app/list`、应用广场/市场或 `AppList` 字符串。旧组件/API/store 仍保留在源码树中但无挂载入口，等待删除门槛完成。
- 2026-08-31：当前工作树最终固定 Chromium 浏览器回归 4/4 通过（编辑覆盖、润色刷新、论文上传、会员工作流）；Vite 已停止，9002 无监听，未残留 Playwright Chromium 进程或 `service/test-results`。
- 2026-08-31：在 `service` 目录执行 `npm run build:test`（Nest webpack）复核通过；本次未启动后端、未连接 Redis/MySQL、未修改线上状态。
- 2026-08-31：在本机使用 `INIT_DB_ON_BOOT=false` 启动 `service/dist/main`，Redis 与 MySQL 连接成功，Academic controller 四个路由均完成注册；只读 `/api/config/queryFront` 返回 200，未携带登录态访问 `/api/auth/getInfo`、`/api/academic/core-function-list` 与 `/api/academic/plugin-list` 均按预期返回 401。启动流程因本机 Redis 缺少 JWT_SECRET 自动写入了生成的本地密钥；未调用业务写入、支付、学术生成或线上接口。测试后已停止服务并清理临时响应文件。
- 2026-08-31：仅以 `EXISTS/TTL` 复核本机 `JWT_SECRET` 状态（存在、永久 TTL），未读取密钥内容；该本地状态未主动删除，留待用户决定是否恢复本机 Redis 基线。
- 2026-08-31：新增 `service/scripts/academic_real_gate.mjs` 与 `test:academic-real-gate`，建立真实 Academic 认证预检门禁；脚本仅接受外部短期 Bearer token，默认限制本机目标，只读验证登录态、前台配置和 Academic 能力列表，禁止生成、上传、计费和业务写入，缺少 token 时安全返回退出码 2 且不泄露凭据。
- 2026-08-31：使用假 token 对本机真实 service 执行 `academic_real_gate.mjs` 失败路径验证：前台配置返回 200，登录态与两个 Academic 能力列表返回 401，脚本退出码为 1 且输出仅含状态摘要；服务已停止，未调用生成、上传或业务写入接口。
- 2026-08-31：为避免旧应用货架意外进入活动 store，移除 `chat/src/store/modules/index.ts` 对 `app-cat-store` 的导出；回滚 AppList 直接引用自身模块，`verify:research-contract`、Vue 类型检查和生产 Vite 构建均通过，构建产物旧应用字符串扫描干净。
- 2026-08-31：活动 store 收口后用固定共享 Chromium 重跑 Academic mock 回归，权限允许的实际执行 4/4 通过（19.8 秒）；清理了测试服务、监听端口、`service/test-results`、本轮残留 Chromium 进程和已确认空的临时 profile，未触碰固定 Chromium 本体。
- 2026-08-31：扩展 `verify_research_contract.mjs` 的活动入口扫描，覆盖 chat 主入口、Header、Footer、AcademicPanel、研究首页、侧栏和活动 store，静态禁止旧应用 API、`useAppCatStore`、AppList/AppTips 引用；回滚目录继续保留但不纳入活动白名单。
- 2026-08-31：回归新增研究入口对论文速读、LaTeX 翻译的插件选择与请求契约覆盖；按需加载、Max 权限和中英文显示断言修正后，完整固定 Chromium mock 回归 5/5 通过（23.3 秒），测试服务与产物已清理。
- 2026-08-31：只读复核本机 academic-4.0 运行条件：系统 `/opt/homebrew/bin/python3.12` 可用，现有 `academic-4.0/venv` 为 Python 3.11.14；FastAPI、Uvicorn、Pydantic、Requests、OpenAI 均可导入，38000 端口无监听。未启动、重建或安装依赖，真实学术生成链路仍未验收。
- 2026-08-31：在隔离 `/tmp` 存储根、去除非法 `NO_PROXY` 条目且不触碰项目结果目录的条件下启动 academic-4.0，真实读取 `/academic/core-function-list` 返回 200/6 项，`/academic/plugin-list` 返回 200/28 项，包含论文速读、PDF 总结/深度理解、LaTeX 翻译/润色等能力；未调用生成、上传、计费或线上接口。服务已停止，38000 无监听，隔离临时文件已清理。
- 2026-08-31：在同一隔离环境完成 academic-4.0 文件契约回归：上传仓库内 `main.py` 返回 200/1 个文件，随后 `/academic/file` 返回 200、内容长度 300 字节；未使用账号、未调用模型、未触碰项目真实存储或线上接口。服务已停止，隔离目录已清理。
- 2026-08-31：最新前端门禁复核通过：`verify:research-contract`、`type-check`、Vite production build 与 `git diff --check` 均成功；生成的 `chat/dist` 产物未命中 `/app/list`、应用广场/市场、`AppList` 或 `AppTips`，保留用于部署契约验证。
- 2026-08-31：新增 `service/scripts/academic_engine_contract_gate.mjs` 及 `test:academic-engine-contract`，将 academic-4.0 能力列表、隔离上传和文件读取回归固化为自动门禁；脚本会隔离存储根、清除非法代理环境、自动停止进程并清理临时目录。本轮回归通过，未调用模型或业务写入。
- 2026-08-31：修正 `long_chat_pressure.spec.cjs` 原统计不存在的 `.workspace-entry` 导致的假通过，改为检查 AcademicGPT 实际 `.workspace-record`；新增 1000 条研究消息窗口化/连续加载/输入交互 mock 场景，固定共享 Chromium 完整 6/6 通过（28.2 秒），测试服务与 `service/test-results` 已清理。
- 2026-08-31：`verify_research_contract.mjs` 新增长会话选择器静态护栏，要求压力测试使用 `.workspace-record` 并禁止 `.workspace-entry`，防止窗口化验收再次假通过；契约门禁通过。
- 2026-08-31：补齐 AcademicGPT 活动 Footer 的五语言文案（展开/收起、拖拽导入、上传、发送/停止、推理、网络搜索及无障碍标签），移除对应硬编码 UI 文案；locale JSON、类型检查、契约验证和生产构建均通过。
- 2026-08-31：活动 AcademicGPT 输入区的登录、附件上传失败、文件/图片类型与大小限制、数量上限及模型能力提示统一接入 `zh-CN / zh-TW / en-US / ja-JP / ko-KR` locale；参数化文件名、数量和大小由 i18n 插值渲染，不再新增硬编码中文边界提示。
- 2026-08-31：`npm run type-check`、`npm run verify:research-contract`、直接 `vite build --mode=production` 与 `git diff --check` 通过；`npm run build` 的包装格式步骤因 Corepack 尝试联网检查 pnpm 且无 TTY 中止，非代码编译错误，已用离线 Vite 构建完成产物复核。
- 2026-08-31：修复 `chat/package.json` 的构建依赖链：`build` 改用 `npm run format`，`format` 改用项目已安装的本地 `prettier`，不再调用 `pnpm dlx` 触发联网解析；保留显式格式化命令的写入语义，未对历史未格式化文件做无关全仓重排。
- 2026-08-31：补齐 `build-only` 脚本并执行 `npm run build-check`，并行类型检查与 Vite 生产构建通过；随后 `verify:research-contract` 与 `git diff --check` 通过，仍仅有既有 chat store 动静态导入 warning。
- 2026-08-31：ChatBase 外层“生成中请稍后再试”提示纳入五语言 `lens.footer.busyRetry`，活动用户端新增提示不再直接写死中文；locale JSON、类型检查、契约验证和生产构建均通过。
- 2026-08-31：进一步将 `chat` 的 `build` 改为只调用 `build-only`，格式化改为显式 `npm run format`；实际执行 `npm run build`、`npm run build-check`、契约验证和 diff 校验通过，构建不再隐式改写源码。
- 2026-08-31：修复流式请求中断与多字节尾块边界：`chatBase.vue` 固定保存本次请求的 `AbortSignal`，主动停止只保留已接收内容并显示“已停止”，不再误报失败或同步错误内容；`fetchStream` 在结束时 flush `TextDecoder`，避免跨 chunk 字符丢失。契约护栏、类型检查和生产构建通过。
- 2026-08-31：流式尾块回调异常与普通分片统一隔离，展示层回调抛错不会把已成功读取的响应伪装成网络失败；契约验证、类型检查和生产构建复核通过。
- 2026-08-31：研究契约验证新增“流式中间结果主动中止”生命周期断言，确认 reducer 进入 `aborted` 且已完成结果不会被中止覆盖。
- 2026-08-31：Academic Playwright 回归选择器同步支持本地化发送按钮（`发送`/`Send`），修复旧 aria-label 导致的测试假失败；固定共享 Chromium 实际执行 6/6 通过（28.3 秒），覆盖编辑截断、润色刷新、论文上传、插件任务、会员工作流和 1000 条消息窗口化。测试服务、监听端口与 `service/test-results` 已清理。
- 2026-08-31：研究结果区的来源/附件摘要、联网搜索、深度思考、空结果与文件结果提示统一接入五语言 locale；契约验证、类型检查、生产构建和 locale JSON 解析通过。
- 2026-08-31：将流式文本读取抽为 `chat/src/domain/research/textStream.ts` 纯领域辅助，统一处理跨 chunk UTF-8、尾块 flush 与展示回调异常隔离；`fetch.ts` 收敛为请求错误包装，契约验证、类型检查、生产构建和 `git diff --check` 复核通过。
- 2026-08-31：强化旧 99AI 页面隔离门禁：`verify_research_contract.mjs` 新增根路由与 `chat.vue` 可达入口断言，确保只进入 `chatBase.vue`，不允许 `Welcome`、`AiBot`、`PresetHints`、`AppList` 或 `AppTips` 重新成为用户入口；契约验证与类型检查通过。
- 2026-08-31：AcademicGPT 主区的服务不可用、请求失败、请求 ID、重试、错误关闭、历史消息加载及回复覆盖失败提示统一接入 `zh-CN / zh-TW / en-US / ja-JP / ko-KR` locale；契约验证、类型检查、生产构建和 `git diff --check` 通过。
- 2026-08-31：请求失败 toast 的请求 ID 后缀改为 locale 插值，异常路径不再重新引入硬编码中文；契约验证、类型检查和 `git diff --check` 复核通过。
- 2026-08-31：契约门禁新增本地状态 Academic-only 断言，锁定 `academicMode: true` 的默认与恢复值，防止旧缓存让新用户端回退到通用 99AI 聊天请求；历史 `appId` 仍仅兼容透传。
- 2026-08-31：新增固定共享 Chromium 浏览器回归，实际验证默认研究会话渲染 AcademicGPT 工作区、发送请求命中 `/academic/chat-process` 的 `function=chat`、不命中 `/chatgpt/chat-process` 且不显示应用广场/市场；用例 1/1 通过，测试服务与 `service/test-results` 已清理。
- 2026-08-31：完整 Academic 浏览器回归扩展并实际执行 7/7 通过，覆盖默认 Academic 请求路由、编辑截断、润色刷新、论文上传、论文速读/LaTeX 任务绑定、会员工作流与 1000 条长会话窗口化；Vite 服务、监听端口和 `service/test-results` 已清理。
- 2026-08-31：流式 UTF-8 回调异常隔离测试改为捕获预期日志并断言非空分片回调次数，契约门禁输出恢复为干净通过结果；运行时错误隔离行为未改变。
- 2026-08-31：在流式测试收口后再次执行 `npm run build-only`，Vite production build 通过，仅保留既有 chat store 动静态导入 warning。
- 2026-08-31：整体门禁复核通过：`chat` 的 `npm run build-check`、`verify:research-contract`、`service` 的 `npm run build:test` 与 `git diff --check` 均成功；本轮未启动服务、未访问线上环境。
- 2026-08-31：Footer 移除 Academic 模式双向开关语义，改为只读 AcademicGPT 状态；store 保留带兼容参数的启用方法，明确旧调用方不会重新打开通用 99AI 模式；构建检查与契约验证通过。
- 2026-08-31：最新 `chat/dist` 产物级扫描未命中应用广场/应用市场、`AppList`、`AppTips`、`/app/list` 或 `@应用`；`chat/dist/index.html` 与 `service/public/chat` 均存在，部署输出契约保持不变。
- 2026-08-31：Academic 契约门禁新增兼容 API 静态检查，覆盖认证、会话组/历史、上传、余额、订单和分享模块的既有路径；确认移除 99AI 用户界面未丢失账号、文件、计费或分享 API 入口；契约验证、类型检查和 diff 校验通过。
- 2026-08-31：消息结果区的下载失败、文件地址、复制、图片资料、图像结果、可交付结果和下一步提示统一接入 `zh-CN / zh-TW / en-US / ja-JP / ko-KR` locale；`build-check`、契约验证和 diff 校验通过。
- 2026-08-31：会员中心移除登录/升级流程残留的调试 `console.log`，并用契约门禁锁定不再回写调试状态；不改变会员、支付或签到逻辑；`build-check`、契约验证和 diff 校验通过。
- 2026-08-31：会员中心签到、额度、会员状态和卡密兑换文案统一接入 `lens.member` 五语言 locale；未改变签到、计费、支付或权益判断。`npm run verify:research-contract` 与 `npm run build-check` 通过，构建仍仅保留既有 chat store 动静态导入 warning。
- 2026-08-31：会员中心签到成功、登录要求和登出提示也改为五语言 locale；复核 `chat/dist` 未包含 `AppList`、`AppTips`、应用市场或 `/app/list` 活动入口。旧 99AI 文件未物理删除，继续等待真实后端与灰度删除门槛。
- 2026-08-31：按固定 Chromium runner 重跑 Academic 回归，7 个用例均在浏览器启动前因 `Target page, context or browser has been closed` 失败；策略门禁通过但未形成产品结论。Vite 与 9002 监听已停止；失败用例的 `error-context.md` 诊断证据保留，未执行递归清理。
- 2026-08-31：对固定共享 Chromium 执行最小 headless dump-dom 探针，进程退出码 134 且无输出；确认浏览器运行时本身当前不可用。未下载、替换或修改共享 Chromium，空探针文件已清理。
- 2026-08-31：Playwright runner 与 global setup 增加只读 headless 运行预检；当前固定 Chromium 在预检阶段明确返回 `signal:SIGABRT`，runner 会提前停止而不产生 7 个重复失败用例。策略扫描、脚本语法检查通过，未使用本机 Chrome 替代。
- 2026-08-31：Header、模型选择器和研究侧栏的活动用户文案继续接入五语言 locale，覆盖外部链接、模型切换、空状态和未命名项目；`verify:research-contract`、`build-check` 与 `git diff --check` 通过。
- 2026-08-31：消息结果区编辑、取消、复制、删除、重新生成和朗读按钮，以及复制成功提示改为复用 locale；未改变消息操作或请求契约，契约验证和生产构建通过。
- 2026-08-31：ChatBase 登录成功与支付成功提示改为复用既有 locale；未改变认证、支付或会话请求契约，契约验证、类型检查和生产构建通过。
- 2026-08-31：Footer 拖放上传的图片/文档能力不匹配提示改为五语言参数化文案，并移除不再使用的硬编码 reason 字段；未改变上传契约，验证与生产构建通过。
- 2026-08-31：收紧 ChatBase Academic 路由：无历史 `appId` 的会话即使旧缓存状态异常也强制走 AcademicGPT，仅带旧 `appId` 的历史会话保留通用请求兼容分支；契约验证、类型检查与生产构建通过。
- 2026-08-31：`useAppId` 归一化为正整数，防止旧数据中的字符串 `"0"` 误触发通用 99AI 分支；重建 `chat/dist` 后 AppList、AppTips、应用市场、`/app/list`、`@应用` 扫描均干净。
- 2026-08-31：AcademicGPT 输入区拖放上传的图片、文档及混合能力不匹配提示继续接入五语言参数化 locale，移除未使用的硬编码 reason 字段；未改变上传或计费语义，契约验证和生产构建通过。
- 2026-08-31：恢复并隔离分享用户链路：新增 `chat/src/components/SharedHtmlView.vue`，`App.vue` 对 `?shareCode=` 做 8 位字母数字校验并调用既有 `/share/:shareCode`；分享模式不挂载聊天路由、登录初始化、缓存清理或可配置统计脚本，不提供编辑、删除或重新生成操作，iframe 禁止脚本、表单、弹窗并使用 `no-referrer`。`chat/src/api/share.ts` 将创建/读取响应收敛为显式类型契约，五语言分享状态已补齐。`verify:research-contract`、locale JSON 解析、`npm run build-check`、生产产物旧应用入口扫描和 `git diff --check` 通过；未启动服务、未写数据库、未访问线上环境，真实账号分享闭环仍待验收。
- 2026-08-31：为 AcademicGPT assistant 结果区补充“分享研究结果”入口：复用 `/share/create`，把已渲染结果封装成最小只读 HTML 文档，复制后端返回链接，并提供创建中/成功/复制失败/失败五语言反馈。mock 回归新增创建请求断言；类型检查、契约验证、生产构建和 diff 校验通过。未写数据库、未访问线上环境，真实账号分享仍待验收。
- 2026-08-31：分享创建请求在前端增加最小 HTML 白名单清洗，移除脚本、嵌入/表单/样式、事件属性和不安全 URL，仅保留安全内容；后端既有清洗未改变，分享结果形成前后端双层防护。`verify:research-contract`、Vue 类型检查、生产构建、旧入口扫描和 diff 校验通过。
- 2026-08-31：将分享 HTML 清洗、URL 白名单和只读文档生成抽离到 `chat/src/domain/research/share.ts`，消息展示组件只负责调用领域函数；研究契约门禁新增无 DOM fallback 安全断言，类型检查、生产构建和 diff 校验通过。
- 2026-08-31：分享回归新增 assistant 结果按钮场景，断言 `/share/create` 请求包含只读 `<article>` 结果且不触发通用聊天请求；Node 语法、契约门禁、Vue 类型检查、生产构建和 diff 校验通过。实际 Playwright 仍在固定 Chromium headless 预检 `SIGABRT` 阶段提前停止。
- 2026-08-31：为分享只读路径新增 `service/playwright/academic_regression.spec.cjs` mock 回归：覆盖有效/非法分享码，验证 `/share/:shareCode` 读取、父页面不挂载聊天壳/输入框/编辑操作、iframe 仅 `allow-same-origin`。用例已通过 Node 语法和研究契约静态验证；实际运行因固定共享 Chromium headless 预检 `signal:SIGABRT` 提前停止，未下载、替换浏览器或生成新的重复失败产物。
- 2026-08-31：只读复核本地 Lens 9520 与 38000 端口当前均无监听；旧 99AI 用户端源码仍仅作为回滚资产保留，当前构建入口和活动 UI 未引用。未启动服务、未修改业务文件、未触碰线上环境。
- 2026-08-31：改进 `academic_engine_contract_gate.mjs` 的环境阻塞诊断：当沙箱禁止绑定本机回环端口时，输出 `local_port_permission_denied` 并以退出码 2 表示环境阻塞，不再伪装成学术契约失败；本次复核确认原因为 `listen EPERM`，未启动服务或写入业务数据。
- 2026-09-01：新增 AcademicGPT 发布候选门禁 `chat/scripts/verify_academic_release_candidate.mjs` 与 `npm run verify:release-candidate` / `release-check`：验证 `chat/dist` 的静态资源引用、12 项兼容契约、旧 99AI UI/API 零残留、敏感标记和 source map 禁止项；支持 `--mirror` 对同步目录逐文件校验并允许旧哈希资源保留。当前候选 182 个文件、6,785,728 字节，门禁通过。
- 2026-09-01：发布门禁发现 `index.html` 的 Safari mask icon 指向不存在的 `icon/safari-pinned-tab.svg`，已修正为实际产物 `./safari-pinned-tab.svg`；重新生产构建和发布门禁通过。
- 2026-09-01：`build.sh` 已在 chat 构建、同步 `service/public/chat`、打包 `AIWebQuickDeploy/public/chat` 三个阶段接入发布门禁，确保错误候选或不一致镜像在启动服务前失败。本轮只读确认现有 `service/public/chat` 尚未同步最新候选，未覆盖本地镜像、未部署或启动服务。
- 2026-09-01：新增受限静态发布器 `service/scripts/sync_static_release.mjs`，仅允许 `public/chat` 与 `.release-backups/chat-latest`，同步前保留唯一完整备份，先复制资源、最后原子切换 `index.html`；回滚同样最后恢复入口，且不删除旧哈希资源。`build.sh` 不再删除整个 `service/public/chat`，`service` 新增 `rollback:chat-static` 命令。
- 2026-09-01：在隔离 `/tmp` 完成静态发布与回滚演练：旧镜像 198 文件、新候选 182 文件，切换后候选镜像门禁通过，回滚后旧 index SHA-256 `6941ccaf21f74b716f2a211e99ffd776a76b96d55824efed038f0999ea76696c` 精确恢复，无 staging 残留；临时目录已清理，未触碰线上。
- 2026-09-01：新增 `service/scripts/static_release_contract_gate.mjs` 与 `test:static-release-contract`，自动验证静态同步/回滚、旧哈希资源保留、路径作用域和临时 staging 清理；`build.sh` 在同步 chat 镜像前强制运行该门禁。本轮测试通过，临时夹具自动清理。
- 2026-09-01：扩展 `academic_real_gate.mjs` 为授权账号 10 步只读门禁，增加会话/历史、余额/会员、模型、公开套餐和可选既有分享读取，并加入远端 HTTPS、显式授权、URL 凭据/片段拒绝、重定向拒绝和 1–30 秒超时边界；不调用生成、上传、订单、创建会话或分享创建。
- 2026-09-01：新增 `academic_real_gate_contract.mjs` 与 `test:academic-real-gate-contract`，离线验证 10 项读取、Bearer 头、仅两个无副作用 POST、六类写入端点零调用、远端 HTTP 和非法分享码请求前拒绝；测试通过且未输出 token。`build.sh` 已在 chat 静态同步前执行该安全契约，本轮未使用真实账号或访问线上。
- 2026-09-01：新增未自动执行的 `academic_controlled_write_gate.mjs` / `test:academic-controlled-write`，要求短期 token subject 与指定测试用户一致、指定模型、明确 charged/free 计费预期和确认口令；默认只创建临时会话、执行一次最小 Academic 请求、验证计费方向并删除会话，明确不调用订单、支付、套餐、卡密、数据库或全量删除。
- 2026-09-01：上传与分享创建设为默认关闭的独立可选写入，因后端暂无用户侧删除接口，开启时要求额外残留确认且只输出引用指纹。新增 `academic_controlled_write_gate_contract.mjs`，离线验证默认零残留、残留确认、成功/失败/计费不符时 cleanup、可选上传/分享和高风险端点零调用；测试与 service 构建通过，`build.sh` 已接入该契约。本轮未注入真实 token、未生成、未上传、未分享、未扣费。
- 2026-09-01：新增非破坏性的旧 99AI 删除就绪门禁 `service/scripts/verify_legacy_removal_ready.mjs` 与 `test:legacy-removal-gate`，核对回滚资产、活动源码/构建产物零引用、候选/部署入口哈希、真实验收证据和 24 小时观察期；当前执行明确因缺少 `.legacy-removal-evidence.json` 与部署镜像参数返回阻塞，`canDelete:false`，未删除任何旧文件。
- 2026-09-01：使用仓库内 `service/public/chat` 作为同步镜像再次执行删除就绪门禁，明确阻塞于缺少删除证据文件及镜像入口哈希不一致；未覆盖本地镜像、未部署、未删除旧 99AI 文件。
- 2026-09-01：本轮复核执行 `chat` `npm run release-check`、`service` Nest 编译、真实认证契约、受控写入契约、静态发布契约和旧前端删除门禁契约，全部通过；`chat/dist`、`service/public/chat`、`AIWebQuickDeploy/public/chat` 入口 SHA-256 均为 `99a1d4013c563f8ad93bac25019c649f3de58c4fbfaeeae060333f7ee46a4ef0`，两个镜像逐文件发布候选门禁通过。
- 2026-09-01：本轮尝试使用 Codex in-app Browser 访问本地 `http://127.0.0.1:9003/`，被浏览器安全策略拒绝；未改用原始 CDP、本机 Chrome 或其他绕过路径，因此没有新增浏览器运行验收结论。9003 仍由 PID 95857 的本地 Python 静态服务器占用，终止信号和受控权限申请均被环境拒绝。
- 2026-09-01：删除 Playwright 自动生成且无审计价值的 `service/test-results/.last-run.json`；保留失败预检的 `error-context.md` 诊断证据。未删除固定共享 Chromium、回滚资产、业务文件或线上数据。
- 2026-09-01：再次运行 `service` 的 `test:academic-engine-contract`，结果为 `local_port_permission_denied`（`listen EPERM: operation not permitted 127.0.0.1`）；门禁同时确认未调用业务写入、学术生成、外部模型或项目真实存储。未采用绕过浏览器/端口权限的方式。
- 2026-09-01：增强旧 99AI 删除就绪门禁：`verify_legacy_removal_ready.mjs` 对部署镜像逐文件比较候选包哈希，覆盖入口之外的资源漂移；契约测试先制造 `index.js` 漂移并确认被阻断，再恢复后通过。脚本继续固定 `canDelete:false`，未删除任何旧源码或回滚资产。
- 2026-09-01：删除证据门禁新增候选文件清单 SHA-256；真实证据需同时绑定入口哈希和全量清单哈希，避免仅入口未变但资源漂移时误判。当前清单哈希为 `84404c59595152617c2287b8500795bfbdf3ed73c4ee38cc725e795ace5d6fab`，契约测试通过，未执行删除。
- 2026-09-01：最终复核 `chat` `npm run release-check`、`service` `npm run build:test`、`test:legacy-removal-gate`、`test:static-release-contract` 和 `git diff --check` 均通过；QuickDeploy 镜像删除就绪检查确认 182 个候选文件与 120 个活动源码文件均完成检查，仅缺 `.legacy-removal-evidence.json`。9003 仍由本地 PID 95857 占用，固定共享 Chromium 未被修改。
- 2026-09-01：本轮复核确认本地未预置短期 Academic E2E token 或目标地址；`test:academic-engine-contract` 再次因本机回环端口 `listen EPERM` 阻塞且无业务副作用。真实认证契约、受控写入契约、静态发布契约及 `service/public/chat`、`AIWebQuickDeploy/public/chat` 两个镜像逐文件发布候选校验全部通过。
- 2026-09-01：审计 `chatBase.vue` 路由边界，确认新会话/无历史 `appId` 只调用 `/academic/chat-process`，只有历史正 `appId` 会保留 `/chatgpt/chat-process` 兼容路径；契约门禁已覆盖该条件，本轮未修改业务路由。
- 2026-09-01：本轮复核确认公网用户端当前入口不再使用 99AI 聊天页面：新会话和无历史 `appId` 固定进入 AcademicGPT 工作区并调用 `/academic/chat-process`，旧 `/chatgpt/chat-process` 仅保留给历史正 `appId` 兼容分支。`chat` `release-check`、`service` 编译、真实读取/受控写入/静态发布/删除契约均通过；隔离 `academic-4.0` 运行门禁实际通过（核心 6、插件 28、隔离上传与读取均通过，零业务副作用）。旧 99AI 组件/API/store 尚未物理删除，删除就绪门禁仍因缺少 `.legacy-removal-evidence.json` 安全拒绝；未访问真实账号、未部署线上。
- 2026-09-01：按三件套职责收敛 `STATUS.md` 为当前快照，移除其中已过期的历史阻塞描述；历史验证记录继续保留在 `CHANGELOG.md`，未修改业务代码、线上资源或回滚资产。
- 2026-09-01：线上只读复核 `HEAD https://lens.yutoai.net/` 返回 HTTP 200，`Last-Modified` 为 2026-06-16；当前 AcademicGPT 候选尚未被证明部署，未执行线上写操作。
- 2026-09-01：类型边界收口后重新构建并通过 `chat` 发布检查；候选 182 个文件、6,786,180 字节，入口 SHA-256 为 `fc39b51ede8ac343b8c372bfdee3d9448dede6af15ed34e1afe3b8e3bb1a8143`，清单 SHA-256 为 `eb4d410d6c5d33fb96bebc4928bfe6343e60fdbf1b49783b8ecc2aadaf35ae19`。使用受控发布器同步 `service/public/chat` 与 `AIWebQuickDeploy/public/chat` 后，两个镜像逐文件校验通过；旧 99AI 删除门禁仍仅缺 `.legacy-removal-evidence.json`。
- 2026-09-01：导出统一 `AcademicEntity` 类型并将 `AcademicPanel.vue` 的学术能力对象参数改为显式类型；`vue-tsc`、研究契约、完整 release-check、Nest 编译、受控写入契约和静态发布契约均通过，未改变运行时请求或权限语义。
- 2026-09-01：修正 Academic 会员权限层对 `Date` 到期时间的解析，并将工作流/权限函数收敛到 `AcademicEntity`、`AcademicBalance` 类型；类型检查、研究契约、完整 release-check、Nest 编译、真实读取/受控写入/静态发布契约均通过。最终候选 182 个文件、6,786,223 字节，入口 SHA-256 为 `eafc9f4501839777a7928703d79cfd0aadfbb3e5fcb3543cc798114414b3fc01`，两个本地发布镜像逐文件校验通过；删除门禁仍因缺少 `.legacy-removal-evidence.json` 拒绝删除。
- 2026-09-01：研究契约新增 Academic 会员权限矩阵断言，覆盖未来 `Date`、日期字符串、完整时间、过期会员、无到期时间和免费用户基础能力白名单；相关 4 个文件通过 Prettier、类型检查、研究契约与完整 release-check。候选与两个本地镜像哈希保持一致，未执行线上写入或旧源码删除。
- 2026-09-01：固定共享 Chromium 预检通过，`academic_regression.spec.cjs` 浏览器回归 10/10 通过，覆盖 Academic 路由、只读分享、编辑截断、润色刷新、论文上传、论文速读/LaTeX、会员工作流和长会话窗口化；测试用 Vite 已停止，Playwright 自动生成的 `service/test-results/.last-run.json` 已清理。该结果仍不替代真实账号联调、线上灰度和观察期证据。
- 2026-09-01：用户明确将产品边界改为“彻底废弃 99AI 前端、只保留 99AI 后端”。Lens 桌面端移除右侧常驻能力栏，Academic 能力改为顶部“研究工具”按需抽屉；中央研究任务区恢复完整宽度，主壳样式从 `prism-shell` 更名为 `academic-workspace-shell`。
- 2026-09-01：物理删除 9 个旧用户端文件：AppList、AppTips、Welcome、appStore API/store、通用 plugin API/侧栏、AiBot 与 PresetHints；同时移除通用插件列表请求、store 状态、选择动作、`usingPluginId` 请求字段和启动时自动清空浏览器存储的遗留行为。Academic 插件、工作流、账号、历史会话、文件、计费、订单与分享后端契约继续保留。
- 2026-09-01：旧 UI 删除门禁改为验证目标文件必须不存在，并增加 `--source-only` 本地清理模式；9 个目标文件、116 个活动源码文件及 182 个生产候选文件扫描通过。Vue 类型检查、研究契约、Vite production build、发布候选门禁和删除门禁契约通过；移除会将普通请求异常原样显示为底部红条的 `app-boot-error` 调试脚本后，最终候选为 6,779,648 字节，入口 SHA-256 为 `a9512951ceb3f617f6f83ce5eabd6c1838c322167f03c182df97cee83f5efd06`，清单 SHA-256 为 `43096d268a1c86d378b54f6a3bc2f6b0d4b078ea69c3d0365fa09ef2b2de53c4`。
- 2026-09-01：Academic Playwright 回归更新为显式打开/关闭研究工具抽屉，不再依赖旧三栏常驻选择器；固定共享 Chromium 完整回归 10/10 通过（54.1 秒）。本地 dev 前端保留在 `http://127.0.0.1:9002/` 供查看，未启动后端、未访问真实账号、未部署线上。
- 2026-09-01：针对“仍像普通聊天页、不是专业学术 GPT”的反馈完成 UI 大幅重构：Lens 使用独立品牌壳和学术蓝灰设计系统，首屏改为研究资料主入口、阅读/写作/研究链路任务分类与深海军蓝 Academic Pipeline；侧栏改为研究项目语义，顶部栏不再重复项目名。桌面端和 390×844 移动端应用内浏览器均完成视觉复核，无横向溢出。
- 2026-09-01：修复通用 `useScroll` 挂载时无条件滚到底部导致空研究首页 Hero 被截断的问题；滚动策略由 `chatBase` 根据首页/历史会话状态决定，空首页稳定保持 `scrollTop=0`，历史消息首次加载仍沿用页面层滚底逻辑。
- 2026-09-01：专业学术工作台重构后通过 `vue-tsc --noEmit`、研究契约、Vite production build、发布候选门禁、旧前端源码/产物删除门禁及固定共享 Chromium Academic 回归 10/10。最终候选 182 个文件、6,788,068 字节，入口 SHA-256 为 `09475370f0e75291c6545880a837d7aebacb8417c0cf592dc133b322f2c03f44`，清单 SHA-256 为 `a0e7ca67c3bb1e8ac8bea7d03ba50a046366bca508b4667a68b6d0d4ee3bd964`；未部署线上、未调用真实生成/上传/分享/计费。
- 2026-09-01：按用户要求进一步对齐 `gpt_academic` 稳定 Gradio 工作台结构：空研究页改为左侧对话输出、右侧输入/基础功能/函数插件、底部统一输入器；普通顶栏移除无效的旧侧栏开关和“当前研究项目”聊天壳，改为 `GPT Academic · Lens`，并补回独立登录/账号入口，不恢复旧 99AI 导航。
- 2026-09-01：新工作台恢复“开始文献综述”P0 入口，基础功能覆盖论文总结、PDF 深读、Arxiv 摘要、文献综述、英文润色、LaTeX 翻译和代码解释；新增界面文案全部接入五语言 locale。固定 Chromium 浏览器回归最终 10/10 通过，登录、默认 Academic 请求零 99AI 回退、上传、润色、工作流、长会话和只读分享保持稳定。
- 2026-09-01：最终 `vue-tsc`、研究契约、Vite production build、发布候选门禁和旧前端源码/产物移除门禁通过；`chat/dist` 为 182 个文件、6,774,955 字节，入口 SHA-256 `9cdae025c3f693737fbf7441a84921abd35dcfa9b7f2cdced9bdef3d8716f862`，清单 SHA-256 `2994d31df698dfcbc61a80012c54fba66f49d4ed843b6f735431645270fd43f6`，旧 UI 零残留。应用内浏览器已真实复核 Academic 首页、账号入口、文献综述入口及旧侧栏按钮为零；未部署线上，未触发真实生成、上传、分享或计费。
- 2026-09-01：继续清理旧 99AI 用户端残留：删除不再挂载的 `sider/index.vue`、`sider/List.vue`、`sider/ListItem.vue`，移除 `siderCollapsed` 布局状态及 260px 常驻占位；历史研究项目、搜索、置顶、重命名、删除和新建能力迁移到顶栏“你的项目”按需抽屉。固定 Chromium Academic 回归 10/10 通过，研究契约、类型检查、生产构建、发布候选和旧 UI 零残留门禁通过。最新候选 182 个文件、6,782,491 字节，入口 SHA-256 `08c2131a70d2446cff8386f58ed7b2adbc631d10b9b97a94069cea3ccd9448a7`；未部署线上。
- 2026-09-01：登录弹窗完成 AcademicGPT 视觉收口：移除 `prism-login`/“欢迎使用 YutoAI”旧品牌标记，改用 `academic-login` 学术蓝灰主题，并新增五语言 `lens.login.title/subtitle` 文案；研究契约同步增加登录旧标记零残留断言。`vue-tsc --noEmit`、`verify_research_contract.mjs`、Vite production build、发布候选门禁及固定共享 Chromium Academic 回归 10/10 全部通过；最新候选 182 个文件、6,783,138 字节，入口 SHA-256 `3af0039cc612b5ce5afddca4ff7c56833c8436e96be45b868733aeb4aac5463e`。未部署线上、未访问真实账号、未触发生成/上传/分享/计费。
- 2026-09-01：补齐登录品牌无障碍文本，将 logo `alt` 从 `YutoAI` 改为 `Lens AcademicGPT`；重新执行 Vite production build 与发布候选门禁通过，候选 182 个文件、6,783,153 字节，入口 SHA-256 `578b64d9d68a405b82910aae0bcc021788761ac275726c977468bfed08a2942f`。未改变认证请求契约，未部署线上。
- 2026-09-01：只读核验 `https://lens.yutoai.net/` 仍加载旧线上资源 `js/index-d5cf264c.js`，其中可检出 `AppList`、`应用广场` 与 `prism-shell`，确认公网尚未切换到 AcademicGPT 候选；未执行任何线上写操作。
- 2026-09-01：使用受控静态发布器将入口 SHA-256 为 `578b64d9d68a405b82910aae0bcc021788761ac275726c977468bfed08a2942f` 的最新 AcademicGPT 候选同步到 `service/public/chat` 与 `AIWebQuickDeploy/public/chat`；两个本地镜像逐文件发布候选校验均通过，静态发布/回滚契约确认旧哈希资源保留、路径守卫有效且无 staging 残留。仅更新本地部署镜像，未修改服务器。
- 2026-09-01：通过固定共享 Chromium 对本地 9002 做桌面与 390×844 移动端真实渲染复核：AcademicGPT 工作台、学术任务区、统一输入器及登录弹窗均正常，登录品牌与无障碍文本均为 `Lens AcademicGPT`，未发现横向溢出。浏览器进程及本轮 Playwright CLI 快照/日志/截图均已清理，固定 Chromium 本体未触碰。
- 2026-09-01：依据老师和学生的核心使用场景，首屏基础功能新增“比较多篇论文”“整理研究笔记”“生成教学材料”三类 AcademicGPT chat 任务；全部使用现有 `/academic/chat-process` 对话契约，不引入 99AI 应用市场或通用插件货架。五语言文案、领域任务配置、首页 featured 清单、研究契约和 Playwright 回归均已补齐。
- 2026-09-01：新增三类研究任务的固定共享 Chromium 回归通过，完整 `academic_regression.spec.cjs` 为 11/11；同时 `vue-tsc --noEmit`、locale JSON、研究契约、Vite production build、NestJS `build:test`、静态发布/回滚契约和两个本地部署镜像逐文件候选校验均通过。最新候选 182 个文件、6,788,902 字节，入口 SHA-256 `102c5494d02a11de0cda98b322421dc3e194c751e793a4ced66ae405325db361`。未部署线上。
- 2026-09-01：修正首页 featured 任务清单遗漏，将 Arxiv 摘要和代码解释恢复，与比较论文、研究笔记、教学材料等共 10 项研究任务完整呈现；基础功能区增加独立滚动约束，避免窄屏被底部输入器遮挡。研究契约、类型检查、locale JSON 与 Academic 固定 Chromium 回归 11/11 均通过。
- 2026-09-01：重新执行 `chat` `release-check`、受控静态同步、两个本地镜像逐文件校验、NestJS 编译、静态发布/回滚契约和旧 UI 源码门禁均通过。最新候选 182 个文件、6,788,984 字节，入口 SHA-256 `77b47aa5fb65aa4448ba790261bf98f6968fd78bbdf3adae82069aa546d3d5bc`，清单 SHA-256 `2d5a8156c5e5c2fe62728b2808299d260d5d4779cb1206fd45ef6eba90e5b9b7`；未部署线上，旧 UI 删除门禁仍按真实账号与观察期缺失保持 `canDelete:false`。
- 2026-09-01：临时从 `service/public/chat` 启动本地 9003 静态服务，HTTP 200 回查成功，实际加载 `index-625bc049.js` 并检出“比较多篇论文”“整理研究笔记”“生成教学材料”文案；验证后已停止服务，9003 无监听，未触碰线上。
- 2026-09-01：补充 `docs/DEPLOYMENT.md` 的 AcademicGPT 前台发布闸门，要求候选/两个镜像逐文件校验、线上根入口哈希回查、Academic 任务 smoke check 和受控回滚；明确禁止从旧服务器目录或历史压缩包复制 `public/chat`。仅更新本地文档，未执行线上写操作。
- 2026-09-01：完成度审计：本地候选与两个部署镜像逐文件一致；`academic_real_gate.mjs` 因缺少获授权的 `LENS_ACADEMIC_E2E_TOKEN` 以退出码 2 安全阻塞；旧 UI 删除门禁（含 `service/public/chat`）因缺少 `.legacy-removal-evidence.json` 保持 `canDelete:false`；线上只读资源仍检出 `AppList`、`应用广场`、`prism-shell`。未执行线上写操作。
- 2026-09-01：用户明确纠正产品命名边界：产品名固定为 `Lens`，归属 `YutoAI`；“学术 GPT”只描述用途和交互范式，不作为产品品牌。活动页头、首屏、登录、分享和五语言状态文案已统一为 Lens / by YutoAI，`AGENTS.md` 同步固化该长期规则。
- 2026-09-01：删除旧 99AI 风格的桌面/移动双设置壳，重建单一 Lens 自适应设置中心；物理删除 `MobileSettingsDialog.vue` 及 `mobileSettingsDialog` / `mobileInitialTab` 状态与全部移动分支调用。账户、会员、使用必读和协议内容继续复用现有后端契约。
- 2026-09-01：本轮 `./node_modules/.bin/vue-tsc --noEmit`、研究契约、Vite production build 和 `git diff --check` 通过；应用内浏览器实际复核本地 9002 显示 `Lens by YutoAI` 与 `Lens · 就绪`，未出现 99AI 或 AcademicGPT 产品品牌。未部署线上；旧前端删除门禁仍因缺少部署/观察证据保持 `canDelete:false`。
- 2026-09-01：将输入器六处匿名拖拽模板回调收敛为显式 `DragEvent` 处理函数，消除严格类型错误；重新执行 `vue-tsc --noEmit`、研究契约、生产构建、受控写入契约、旧 UI 删除契约、静态发布/回滚契约和 `git diff --check` 均通过。
- 2026-09-01：最新 Lens 候选为 178 个文件、6,752,564 字节，入口 SHA-256 `46f1b6bae018bb342c3cc7a396ab1f3a8d7fe90943c2bc3bad822f25c010211f`，`legacyUiIncluded:false`；受控同步到 `service/public/chat` 与 `AIWebQuickDeploy/public/chat` 后两个本地镜像逐文件一致，各自唯一最新回滚备份有效。未执行线上部署。
- 2026-09-01：清理 `.playwright-cli/` 中 2 个无审计价值的日志/页面快照残留并删除空目录；固定共享 Chromium 未修改。应用内浏览器临时桌面视口已恢复默认，9002 Lens 页面作为用户可见交付标签保留。
- 2026-09-01：完成活动前端依赖图审计并删除 10 个零引用旧文件：全局公告 API、旧 BadWords/CloseButton/Identity/PhoneIdentity/微信登录/数据管理组件、appStore 遗留类型文件和旧 users store；同步移除无调用的身份弹窗状态。审计结果为 140 个源码文件、114 个可达文件、0 个未使用的活动 UI/API/store 文件，未触碰认证、会员、会话、文件、计费、订单或分享契约。
- 2026-09-01：旧 UI 删除门禁扩展为 22 个已移除用户端文件，source-only 扫描通过；完整门禁仅缺线上发布与观察证据文件，保持 `canDelete:false`，未伪造删除完成。
- 2026-09-01：应用内浏览器完成 Lens 公开桌面和 390×844 移动回归：页面无横向溢出、无 99AI/AcademicGPT 产品品牌；登录弹窗正常。补齐关闭按钮五语言 `aria-label` 并在实际 DOM 验证可被读屏定位。最新候选 178 个文件、6,749,920 字节，入口 SHA-256 `af6ade41b2a014b5075ef3ca85f84e480f1defc152ba33411477ad8b9ad92809`；两个本地部署镜像逐文件一致。未部署线上。
- 2026-09-01：本地 NestJS 根路由只读健康检查返回 HTTP 200；`academic_engine_contract_gate.mjs` 实际通过，确认 academic-4.0 6 项核心能力、28 项插件能力、隔离上传与读取可用，且零业务写入、零生成、零外部模型调用、零项目存储触碰。真实账号只读门禁与受控写入门禁契约均通过，但本机未注入 `LENS_ACADEMIC_E2E_TOKEN`，未执行真实账号请求。
- 2026-09-04：再次固化 Lens 品牌边界：HTML `application-name` 改为 `Lens`，运行时 SEO/JSON-LD 固定区分 `Lens` 产品与 `YutoAI` 发布方，不再允许后端通用 `siteName` 或欢迎文案覆盖产品身份与描述；繁体工作台品牌与开发态应用日志统一为 `Lens by YutoAI`。活动源码、生产候选和两个本地部署镜像均未检出 `AcademicGPT`、`GPT Academic`、`学术 GPT` 或 `99AI` 产品品牌标记。
- 2026-09-04：品牌修正后 `vue-tsc --noEmit`、研究契约、Vite production build、发布候选门禁、两个本地镜像逐文件校验和 `git diff --check` 通过。最新候选为 178 个文件、6,749,707 字节，入口 SHA-256 `70767721e5488f1c10a0c3862b6e1fc1c14dcb4507da91f958f535d1aa5374d0`，`legacyUiIncluded:false`；同步时清理旧哈希产物并保留独立正式协议文件，未部署线上。
- 2026-09-04：本地 Lens 前端已重新启动在 `http://127.0.0.1:9002/`，只读 HTML 回查确认标题以 Lens 为主语、`application-name` 为 Lens、站点归属为 `Lens by YutoAI`；本地 `9520/38000` 当前未启动。
- 2026-09-04：清理 `/private/tmp` 中 9 月 1 日遗留的空 Academic 隔离测试目录与测试根标记；未触碰固定共享 Chromium、源码、正式协议、日志、凭据或回滚资产。
- 2026-09-04：重新启动本地 NestJS 与 academic-4.0 后完成真实账号只读门禁：登录态、前台配置、27 个会话、历史消息、余额、模型、1 个公开套餐、6 项核心能力和 26 项前台插件全部通过；套餐列表与详情均返回 HTTP 200 和计费选项。token 仅存在于单一测试进程，未打印、未落盘，未调用写入、生成、上传或分享创建。
- 2026-09-04：登录后真实浏览器回归发现“使用必读”正在展示后端遗留 `YutoLens` 文案和默认管理员/预览账号密码。新增前后端双重公开公告安全边界：疑似凭据公告一律回退为 Lens 安全使用说明，安全自定义公告继续保留，旧品牌别名统一为 Lens；后端 `/config/queryFront` 与 `/config/notice` 复核均为 HTTP 200，危险凭据行与遗留品牌不可见。未修改数据库原始配置。
- 2026-09-04：公开公告安全策略新增 7 项单元测试并全部通过；发布候选门禁新增已知默认凭据文案阻断。NestJS webpack 编译、Vue 类型检查、研究契约、Vite production build、真实只读门禁、受控写入契约、静态发布/回滚契约和旧 UI source-only 删除门禁通过。
- 2026-09-04：完成登录后桌面与 `390×844` 移动回归，账户安全、升级方案、结构化使用必读和 500 轮历史研究会话均正常，无横向溢出；未触发改密、购买、上传或生成。临时移动视口已恢复并关闭测试标签，未下载 Playwright 依赖或触碰固定共享 Chromium。
- 2026-09-04：更新开发文档为 Lens 正确架构：Lens 学术研究前端、99AI/NestJS 后端能力层与 academic-4.0 学术执行层，不再把整个产品描述为 99AI 通用聊天平台。
- 2026-09-04：最新 Lens 候选为 178 个文件、6,750,194 字节，入口 SHA-256 `82296e85fc7dc8a50414237df414b48da03b6476c0e6f535f7240c7b6e63affc`，清单 SHA-256 `66d1d58b007ed68e26c480967a39e122b5e8b76821cab785a1a5671d84dee1c9`，`legacyUiIncluded:false`；`service/public/chat` 与 `AIWebQuickDeploy/public/chat` 两个本地镜像逐文件一致。未部署线上。
- 2026-09-04：公网只读复核 `https://lens.yutoai.net/` 返回 HTTP 200、入口资源仍为 `index-d5cf264c.js`、`Last-Modified` 为 2026-06-16；线上包仍检出 `AppList`、应用广场与 `prism-shell`，未检出当前 `Lens by YutoAI` 品牌，确认公网尚未切换。本轮未执行服务器、Cloudflare 或线上文件写入。
- 2026-09-04：使用真实本地账号完成 NestJS `http://127.0.0.1:9520/` 实际静态生产镜像浏览器验收：未登录首屏、登录后 27 个研究项目、历史研究、账户安全、套餐页、安全使用必读以及 `390×844` 移动工具抽屉均正常，标题与品牌保持 Lens / Lens by YutoAI；未触发改密、购买、签到、兑换、上传或生成，测试标签已关闭且临时视口已恢复。
- 2026-09-04：纠正“只换接口和样式、活动组件仍沿用 99AI chat 骨架”的问题：根路由从 `views/chat` 迁到独立 `views/workbench`，将 ChatBase/Header/Footer/Message/Workspace Home 分解并重命名为 Lens 研究工作区、工作台页头、研究输入器、研究记录和研究起始页；`views/chat` 目录不再存在于当前工作树。99AI/NestJS 的认证、会话、文件、计费、订单、分享和模型数据契约继续作为后端兼容层保留。
- 2026-09-04：移除活动前端的旧外链网页容器、页头外链分支及其全局状态，研究项目改为按需抽屉，桌面活动界面固定为中央研究任务/文档式记录与右侧能力面板；包身份同步改为 `lens-web`、作者为 YutoAI。类型检查、研究契约、Vite production build 与 `git diff --check` 通过；旧 UI 门禁扫描 103 个活动源码和 177 个候选文件，无违规项。浏览器已刷新本地 `9002` 并确认 Lens by YutoAI 工作台真实渲染；未部署线上。
- 2026-09-04：用户明确将 Lens 用户端技术栈改为 Gradio。新增 `academic-4.0/gradio_app.py`、`lens_ui/app.py` 与 `lens_ui/backend.py`，以 Gradio 3.50.2 构建左侧研究记录、右侧研究输入/资料上传/基础功能/函数插件的工作台；账号登录、能力列表、研究会话创建、文件上传和 Academic NDJSON 流分别对接现有 NestJS 接口，权限、扣费与持久化继续以后端为唯一真相源。
- 2026-09-04：本地 9002 的 Vue/Vite 进程已停止，Python/Uvicorn Gradio 进程接管同一地址并返回 HTTP 200；应用内浏览器确认页面由 Gradio 原生 Chatbot、Textbox、File、Radio、Dropdown 与 Button 组件组成，未登录提交会被“请先登录 Lens”门禁阻止，控制台无应用错误或警告。适配器 3 项单元测试、Python 编译检查与 `git diff --check` 通过；清理了已退役的 `chat/dist` 构建产物和 Python `__pycache__`，未部署线上。
- 2026-09-04：用户进一步明确最终架构为“Vue 替代 Gradio 页面层，但保持 gpt_academic/Gradio 的专业研究工作台布局”；停止并移除 9002 的 Gradio 用户端，删除 `gradio_app.py`、`lens_ui` 页面/适配层及对应测试，Uvicorn/FastAPI 重新固定为 38000 API-only。Vue 桌面布局调整为研究记录主区与右侧输入/学术工具操作区，移动端保留底部输入器；9002 Vue 开发服务已启动，应用内浏览器确认品牌为 Lens by YutoAI 且不再渲染 Gradio 页面。类型检查、研究契约、Vite production build、发布候选、旧 UI source-only 门禁和 `git diff --check` 均通过；最新候选 177 个文件、6,747,486 字节，入口 SHA-256 `fa44b8ab5550524d433f91dec722fdaff874ffe1c65fabeaaf317c5e966100df`，`legacyUiIncluded:false`。未部署线上。
- 2026-09-04：按 Apple 最新 Human Interface Guidelines 完成 Lens 视觉系统重构：以系统中性色、系统蓝、系统字体和语义层级替换旧企业蓝灰；Liquid Glass 仅用于顶部导航与研究输入功能层，研究内容保持标准材质；首页任务、研究记录、右侧能力区、发送操作和移动端导航统一间距、圆角、字体与 44px 核心触控目标，并补齐可见键盘焦点和 Reduce Motion。应用内浏览器在窄屏真实复核，移动导航不再拥挤且品牌保持 Lens by YutoAI。Vue 类型检查、Prettier、研究契约、Vite production build、NestJS 编译、公开公告 7 项测试、发布候选、旧 UI source-only 门禁、Playwright 策略门禁和 `git diff --check` 全部通过；最新候选 177 个文件、6,751,293 字节，入口 SHA-256 `6f203c8acf7ef3620f7e9f6103babde31c75944b266493e7fae1aa3aee5b2f2b`，`legacyUiIncluded:false`。未部署线上。
- 2026-09-04：首页按用户指令删除 `Lens · 就绪` 状态行与 `研究工作台` 眉题，同时清除对应空容器、样式及五语言未使用 `academicReady` 键。源码和生产构建均未再检出上述状态标记；Vue 类型检查、研究契约、Vite production build、发布候选门禁和 `git diff --check` 通过。最新候选 177 个文件、6,750,344 字节，入口 SHA-256 `7534cfb600b68497d30b37c6fdddfa11f74249eb986d4a1b30fef7f9cac4906b`；未部署线上。
- 2026-09-04：按首屏密度与手机自适应反馈收紧 Lens 首页：桌面能力区删除重复的常用能力/常用工具快捷区和冗余状态说明，默认仅保留当前任务、模式、两个选择器和按需更多设置；右栏宽度、间距与内边距同步收敛。移动首页改为双列标题优先任务网格并隐藏窄屏重复说明，起始操作改为等宽双列；研究契约新增防回归断言。桌面浏览器确认右栏默认内容一次完整可见；Vue 类型检查、Prettier、研究契约、Vite production build、发布候选门禁与 `git diff --check` 通过。最新候选 177 个文件、6,746,243 字节，入口 SHA-256 `00f1bafccbaacf2cf756c918dff133962a73d916a54c6910c7a981cb1d4b6bc0`，`legacyUiIncluded:false`；未部署线上。
- 2026-09-04：纠正此前只收紧右栏、未解决电脑端中间首页纵向溢出的误判。首页任务区重排为宽屏 `5×2` 完整网格，四个起始操作同排，卡片与标题层级整体收敛；正常电脑视口的空首页关闭纵向滚动，低高度窗口、移动端和历史对话继续保留必要滚动。研究契约新增宽屏五列防回归断言；本地桌面浏览器真实刷新确认 10 个任务、4 个起始操作与右侧操作区均在首屏完整可见且无末行空洞。Vue 类型检查、Prettier、研究契约、Vite production build、发布候选门禁和 `git diff --check` 通过；最新候选 177 个文件、6,746,895 字节，入口 SHA-256 `c5e057d62c1cbe0fcfc7c3d618ccbb338812650344b722301925015c67faa0b7`，未部署线上。
- 2026-09-05：根据“主页过于复杂、不像原本学术 GPT 工作台”的反馈，彻底移除首页十任务卡片、工作流模板、自定义流程入口和重复操作说明，物理删除对应 `starter.ts` 领域配置；研究起始页只保留研究意图、导入资料、直接提问和当前资料，基础能力、函数工具与工作流继续由右侧操作区统一承载。右侧能力区同步取消强制占满剩余高度，减少空边框与视觉噪音；研究契约新增旧任务网格和 starter 领域文件不得回归的断言。Vue 类型检查、研究契约、Vite production build、发布候选检查和 `git diff --check` 通过；最新候选 177 个文件、6,737,240 字节，入口 SHA-256 `daae0f76062df5edd0ace9865e1ef275c3aa08cb604210844f7789a893402337`，`legacyUiIncluded:false`。本地 9002 Vue 与 9520 NestJS 保持运行供用户查看，未启动 38000 学术执行服务，未部署线上。
- 2026-09-05：按用户要求整理 Lens 三件套：覆盖 `STATUS.md` 为当前快照，确认 `AGENTS.md` 固化代码质量与回复收尾规则，并记录本次交接事实；未修改业务代码、未执行测试、未进行线上或外部操作。
- 2026-09-05：针对“前端缺少学术专业感且平板适配不足”的反馈，将空首页改为左对齐的研究笔记式起始面板，保留资料导入与直接提问；ResearchWorkspace 在 768px 以下统一采用窄屏输入器与工具抽屉，避免平板被桌面双栏挤压。`vue-tsc --noEmit`、研究契约、Vite production build 与 `git diff --check` 通过；未部署线上。
- 2026-09-05：根据用户反馈将研究能力重新显式放回 Lens 首页：新增按套餐权限过滤的基础研究能力与学术工具目录，能力项可点击选中并聚焦输入器；保留研究笔记式布局和 768px 以下窄屏适配。`vue-tsc --noEmit`、研究契约、Vite production build 与 `git diff --check` 通过；未部署线上。
- 2026-09-05：修正研究服务未连接时首页能力目录为空的问题：增加本地化核心能力与学术工具降级目录，保证功能在首屏可见；服务恢复后继续以后台真实能力列表和套餐权限为准。刷新当前 Edge 标签页已确认目录显示，未执行线上写入。
- 2026-10-04：完成 Lens 研究工作台设计评审。确认当前实现的主要问题是首页与右侧能力面板重复、首屏决策密度过高、1280×720 桌面内容被 `overflow-y:hidden` 裁切、学术专业感缺少证据链结构、登录与权限禁用原因不够就地可见；Impeccable detector 发现 `ResearchWorkspace.vue:2636` 的 `width` 布局动画风险。未修改业务代码、未部署线上。
- 2026-10-04：完成第一轮信息架构修复：移除 `ResearchStart.vue` 首页能力目录、降级能力列表和重复选择逻辑；右侧 `CapabilityPanel` 统一使用“研究任务设置”标题并补齐五语言文案；删除桌面首页 `overflow-y:hidden` 特例并移除宽度布局过渡。`vue-tsc --noEmit`、研究契约、Vite production build 与 `git diff --check` 通过；本地桌面浏览器确认首页只保留研究入口，右侧能力面板可见，滚动容器为 `overflow:auto`。未部署线上。
- 2026-10-04：按用户要求将“敏感信息零泄漏”提升为 Lens 最高优先级规则，同步写入 `AGENTS.md` 长期规则、`STATUS.md` 当前交接规则和本记录；未写入任何 token、密码、cookie、session、用户数据或其他敏感原文。
- 2026-10-04：完成第二轮反馈与证据链视觉：`CapabilityPanel` 根据登录、服务和套餐状态显示就地说明，未登录时提供登录入口，套餐无能力时提供升级入口，并禁用不可配置选择器；研究结果元信息新增“证据链”分组，统一承载来源、联网搜索、附件和推理状态。五语言文案、`vue-tsc --noEmit`、研究契约、Vite production build、浏览器桌面渲染和 `git diff --check` 通过；未部署线上。
- 2026-10-04：补跑完整 `chat` `release-check`，`vue-tsc --noEmit`、Vite production build、研究契约和 Academic 发布候选门禁全部通过；候选 177 个文件、6,742,130 字节，入口 SHA-256 为 `8b1b803fc54fec8c55ecb0d427a9cf4292b66445a263e19d5c66fb2c7810c57e`，包含 12 项兼容契约且 `legacyUiIncluded:false`。未部署线上。

## 2026-10-04

- 根据用户反馈精修昼夜模式按钮：移除原有日/月图标库渲染，改用统一 1.7px 描边的月牙与太阳 SVG，保留 aria-label、title、主题切换状态和 44px 触控尺寸。
- 通过本地桌面与 390×844 移动视口截图复核；Impeccable detector 返回空结果，`vue-tsc --noEmit`、Prettier 与 `git diff --check` 通过。
- 登录态结果复核仍未完成：未读取或索取凭据；本地学术服务尝试启动但受本机端口绑定权限限制，未形成真实研究结果。

- 2026-10-04：再次核对浏览器交接状态，Lens 仍为游客态；已重新启动本地 Vite 9002 与 NestJS 9520，并将浏览器停在登录面板等待用户自行输入凭据。未读取、打印或记录任何凭据或浏览器隐私数据。

- 2026-10-04：连续复核当前浏览器交接页，仍为游客态登录面板；未读取或代填凭据。由于真实登录结果、研究记录和证据链必须在用户自行登录后才能验证，本阶段暂记为等待用户接管的阻塞。

- 2026-10-04：Chrome 扩展当前不可用，按既有 Lens 标签仅使用 Edge 备用会话进行可见页面检查；页面仍为游客态。已重新启动本地 Vite 9002 与 NestJS 9520，截图确认主页与右侧登录提示正常，标签保留供用户接管登录。未读取或输出任何凭据、Cookie、Token 或浏览器存储。

- 2026-10-04：再次读取当前 Edge Lens 标签，仍为游客态首页；可见“登录后加载研究能力”和禁用选择器，未出现研究记录或证据链。9002 与 9520 已监听，页面已保留供用户接管登录；未读取、代填或记录任何凭据及浏览器隐私数据。
- 2026-10-04：根据“与 ChatGPT 一样美观”的反馈完成昼夜模式图标最终收敛：采用标准线性月牙路径、均衡八向太阳光线、18px 光学尺寸和统一 1.9px 描边，移除实心月牙造成的视觉黑点；实机桌面截图确认浅色模式月牙清晰，Impeccable detector、`vue-tsc --noEmit` 与 Vite production build 通过。
- 2026-10-04：针对用户提出的 SSH 服务器信息泄露担忧，完成 Lens 本地工作树、完整 Git 历史与 `chat/dist` 发布候选的脱敏指纹审计；未发现真实 SSH 私钥、SSH 公钥或 SSH 登录串。命中的私钥文本仅属于发布门禁检测规则，`root@` 命中属于依赖锁文件包路径；GitHub 公网直连受当前 DNS/网络限制，未执行远端删除或历史改写，也未输出任何敏感原文。
### 2026-10-04 登录复核入口确认

- 游客态 Lens 首页可以打开密码登录面板，但当前前端没有注册入口；认证控制器也未暴露注册路由，因此没有可安全自建的本地测试账号。
- 本次未读取、代填或输出任何凭据，也未提交登录或注册请求。

### 2026-10-04 本地测试账号建立

- 按用户明确要求，仅在本机 Lens MySQL 数据库创建全新的最小权限 `viewer` 测试账号，并初始化零额度余额记录；未读取、覆盖或删除既有用户。
- 随机凭据只通过权限 600 的一次性命名管道交给本地登录页，管道已清理，凭据未落盘、未输出；登录提交仍等待服务协议与隐私政策的动作级确认。

### 2026-10-04 学术工作台视觉重构

- 根据用户反馈，将空首页从聊天式起始页改为研究简报结构：研究材料、研究问题、证据链三步协议成为首屏骨架；“直接提问”改为“建立研究问题”，移除聊天气泡图标语义。
- 主题切换按钮改为标准线性月牙/太阳 SVG，去除胶囊按钮背景；已登录账户入口改为紧凑图标入口。五语言文案、桌面与 390×844 移动视口均已复核，未部署线上。

### 2026-10-05 登录态复核前置验收

- 本地前端 9002 已恢复并完成游客态桌面与 390×844 移动端可见页面复核：研究材料、研究问题、证据链三步协议、右侧研究任务设置、输入区和移动端工具抽屉均正常，未发现横向溢出。
- 当前浏览器没有可用的已登录 Lens 会话；登录弹窗要求用户自行输入凭据并确认服务协议与隐私政策。未读取、代填或记录任何凭据、Cookie、Token 或浏览器存储，因此登录后的研究记录、来源/附件/推理证据链和权限面板仍未形成真实浏览器证据。

### 2026-10-05 登录态复核阻塞确认

- 连续三次复核均未发现可用的已登录 Lens 浏览器标签页，Chrome 扩展也未连接；已重新保留登录接管页。该阻塞来自缺少用户本人完成登录与协议确认，不是页面代码或视觉验收失败。

### 2026-10-05 新增本机登录验收账户

- 按用户明确要求，在本机数据库新增一个随机的最小权限 `viewer` 测试账户并初始化零额度记录；凭据仅在内存和权限 600 的临时文件中使用，临时文件已删除，未写入三件套、日志或回复。
- 登录页已填入该账户且登录按钮可用，但尚未勾选或提交《服务协议》《隐私政策》；等待用户对该法律确认动作作出明确授权。

### 2026-10-05 登录验收安全处置

- 用户明确允许勾选协议并提交本机登录；提交后未形成可验证的登录会话。定位过程中一张截图意外显示了部分测试邮箱标识，未显示密码、Token 或浏览器存储；已停止后续登录操作并删除临时凭据文件。
- 当前剩余风险为本机新增测试账户仍存在，等待用户明确决定是否删除；未执行线上操作、未读取用户账户或浏览器隐私数据。

### 2026-10-05 本地质量门禁复核

- 在等待测试账户处置确认期间重新运行 `vue-tsc --noEmit`、研究契约校验和 Vite production build，三项均通过；构建仅出现既有 Browserslist 数据过期提示，未修改业务代码。

### 2026-10-05 测试账户安全清理

- 按用户明确确认，在本机事务中删除本轮新增的最新 `lens-e2e` 测试账户及其零额度记录；删除后只读统计恢复到删除前的既有数量。
- 临时脚本、凭据文件和运行环境内存状态均已清理；未执行线上操作，登录态研究结果仍待下一次受控登录。

### 2026-10-05 受控登录重试结果

- 按用户确认重新创建一次临时 `viewer` 账户并初始化零额度记录；前端协议流程已提交，但本机 `/api/auth/login` 状态核对返回 400，未形成登录会话。
- 未读取或输出 Token、Cookie、用户数据或完整登录 DOM；自动审查拒绝了无有效读取方时的重复凭据传递，未绕过该限制。登录失败后已删除本轮账户及余额记录，临时凭据、一次性管道和运行环境状态均已清理。

### 2026-10-05 登录 400 根因收敛

- 只读核对确认 9520 运行目录为 Lens/service，本地 MySQL 与 Redis 端点均可达，前端 `/api/auth/login` 路径与 NestJS 全局 `/api` 前缀一致；现存 `lens-e2e` 记录的状态、角色、bcrypt 字段和余额关联均符合登录前置条件。
- 在本机单进程内存凭据、事务创建并自动删除的闭环测试中，随机 `viewer` 账号通过 `/api/auth/login` 返回 HTTP 200 和 token，证明后端认证契约正常；本次未输出 token、凭据或用户内容，测试账号及余额已删除。
- 再次进入浏览器登录时，自动审查在输入凭据并勾选服务协议的动作处要求当前时点的明确确认，未绕过；因此浏览器 400 尚未形成可安全复现的具体错误分类，下一次只在用户明确确认协议接受后继续。

### 2026-10-05 登录态视觉复核完成

- 用户明确确认后，在本机 9002 登录弹窗完成一次性随机 `viewer` 账号登录；登录弹窗消失、账户入口收敛为图标、研究简报与“研究任务设置”可见，研究库面板可打开，账户与权限面板可打开且未读取其敏感字段。
- 临时登录态在桌面与 `390×844` 移动视口复核：移动工具抽屉可打开，页面无横向溢出；已保存两张不含账号标识的本地视觉复核截图。未触发研究生成、文件上传、扣费或权限升级。
- 复核结束后删除临时账号及余额记录，刷新页面确认登录表单重新出现并恢复默认视口；凭据文件、浏览器运行时内存和临时日志均已清理。真实研究记录、来源/附件/推理证据链仍因测试账号无历史数据和额度而未验证。
- 只读比对数据库用户与 Redis 会话索引后，仅清理本轮临时账号唯一可定位的孤立 `tokens` 索引；另有 3 个更早遗留且无法证明归属的孤立索引未触碰，避免扩大不可逆清理范围。

### 2026-10-05 本地 Academic GPT service 真实链路复核

- 在本机隔离虚拟环境中启动 Academic runtime，并以本机回环地址运行；`/health` 返回 `ready`。未向公网绑定，也未改动固定共享 Chromium。
- 启动 Nest service 的本机回环实例和新的 Vite 预览实例；认证后的学术健康检查、能力列表和前端工作区初始化均通过。
- 使用唯一超级管理员测试账号在浏览器完成一次真实纯文本研究请求：选择“学术型代码解释”后，额度校验、Academic GPT 执行、流式结果回传和结果渲染均成功。测试提示为安全的通用学术问题，未使用用户资料、文件或敏感内容。
- 为验证扣费临时增加一次高级模型额度，链路完成后已恢复为原始零额度；未保留临时额度、凭据或会话材料。
- 继续收敛视觉：研究结果从聊天式圆角阴影卡片改为平面纸张、4px 直角与学术蓝顶线；首页标题间距收紧。`vue-tsc --noEmit`、Vite production build 和 `git diff --check` 通过；未部署线上。

### 2026-10-05 简洁 Apple 学术工作台方向收窄

- 根据用户对“复杂、难用、没有 YutoAI 气质”的反馈，停止继续扩展研究协议视觉，首页收敛为标题、可直接点击的学术能力、导入资料与开始输入四个明确区域。
- 复用现有 Academic capability store 与套餐过滤，不新增第二套请求或能力选择链路；点击首页能力会沿用右侧面板的选择状态并聚焦输入框。
- 顶部导航改为 YutoAI 深色玻璃层，输入器和右侧操作区使用受限玻璃材质，研究正文继续使用清晰实底；补充减少透明度时的实底降级。
- 本地 `vue-tsc --noEmit`、研究契约、Vite production build 与 `git diff --check` 通过；未部署线上。
- 本轮本地预览返回 HTTP 200；应用内浏览器的新增视觉截图动作被自动审查拦截，因此未把未验证的截图结果写成事实。

### 2026-10-05 更新 Lens 产品目标并推进能力直达反馈

- 将当前目标更新为“一眼可懂、可直接开始研究”的 YutoAI 学术工作台：首屏展示少量能力直达、资料导入和直接提问，完整配置继续由右侧操作区承载。
- 长期规则同步明确：首页能力直达必须复用现有 store 选择状态和调用链，不得复制第二套能力数据或请求逻辑。
- 首页能力入口新增当前选中反馈，并使用 `aria-pressed` 暴露状态；未改变权限过滤、研究请求或后端契约。
- `vue-tsc --noEmit`、研究契约、Vite production build 与 `git diff --check` 通过；未部署线上。

### 2026-10-05 Apple Glass 视觉再收敛与登录态复核

- 根据用户对视觉质量的反馈，将首页从米色纸张风格收敛为冷中性白玻璃基底，减轻边框重量，修正顶部品牌标记裁切，并保留学术蓝单一强调色；首屏继续展示六个能力入口。
- 真实登录态只读复核确认已有研究记录、研究输入、基础能力/更多工具和账户安全面板可见；来源、附件、推理证据链和移动端登录态未宣称完成。
- 一次受控页面状态回传意外包含本机测试账号标识；已停止后续读取、登出并删除临时截图，未输出密码、token、cookie、session 或浏览器存储。后续复核不得重复传递账号字段。
- `vue-tsc --noEmit`、研究契约与 `git diff --check` 通过；未部署线上。

### 2026-10-05 游客态研究数据隔离与移动端复核

- 发现并修复登出后旧研究记录仍可渲染的问题：工作区未登录初始化立即清空聊天状态并跳过会话请求，渲染层增加未登录保护。
- 脱敏浏览器复核确认游客态研究结果节点不可见；390×844 视口确认页面存在、登录入口存在且无横向溢出，视口已恢复默认。
- 上一轮受控状态回传中的本机测试账号标识按已暴露处置，已登出并清理临时材料；旧凭据未再次重试，未输出密码、token、cookie、session 或浏览器存储。
- `vue-tsc --noEmit`、研究契约与 `git diff --check` 通过；来源/附件/推理证据链和移动端登录态仍待新的安全登录前提。

- Academic real-gate 与 controlled-write 契约测试通过，确认远端地址约束、上传/分享残留确认、失败清理、扣费预期和 token 脱敏边界；engine contract gate 因本机回环端口权限被拒未通过，未触发业务写入或外部模型调用。

### 2026-10-05 游客态主题控件验收

- 发现游客态全局点击拦截误伤昼夜模式和语言控件，增加公开偏好控件白名单；不放行研究数据、账户和权限操作。
- 脱敏浏览器复核确认主题可从浅色切换到深色并恢复浅色，未弹出登录框。
- `vue-tsc --noEmit`、研究契约与 `git diff --check` 通过。

### 2026-10-05 学术配色与功能可见性第二轮收敛

- 根据用户对配色、细节和功能可见性的反馈，将 Lens 首页和研究设置区统一到纸白、墨色、低饱和学术蓝的视觉 token；移除首页重复内部眉题，降低标题尺寸与字距，能力入口改为无卡片研究清单行，并使用统一线性图标。
- 服务暂不可用时不再隐藏首页能力入口，仍展示六个可理解的能力直达项；现有 store、权限过滤和请求链路未改变。
- 本地隔离浏览器确认浅色、深色和 390×844 移动视口均可渲染，移动端无横向溢出；Impeccable detector、`vue-tsc --noEmit`、研究契约、Academic real-gate、controlled-write gate、Vite production build 与 `git diff --check` 通过。未部署线上。
- 浏览器标签盘点时发现一个与 Lens 无关的标签 URL 含敏感查询参数；已停止读取其他标签页，未打开、复制、提交或保存该内容，记录中不保留 URL、账号或参数原文。


### 2026-10-05 本地服务恢复与游客态复核

- 重新启动本机回环地址上的 Lens Vite、Nest 和 Academic 服务；只读健康检查确认前端端口可达，Academic `/health` 返回 `ready`，未执行线上操作。
- 游客态浏览器复核确认：研究记录 0 条、证据链 0 条、权限面板可见、选择器禁用、六个能力入口可见；这证明当前缺少的是安全登录会话，不是首页功能被隐藏。
- 390×844 视口复核确认页面宽度保持 390px、无横向溢出，视口已恢复默认；未读取或输出凭据、Cookie、Token、Storage 或用户内容。

### 2026-10-05 ChatGPT 式圆润控件与学术工作台质感收敛

- 根据用户要求保留 Lens 的研究记录、输入区和右侧研究任务设置三段信息架构，统一导航按钮、研究输入器、能力设置、研究结果卡片和移动端底部输入区的圆角规则；新增 `radius-card/panel/control/small` 语义 token，避免各组件继续各自猜测圆角。
- 研究内容仍使用纸白、墨青和低饱和学术蓝，卡片采用 18–20px 圆角与轻量层级阴影，控件保持 44px 触控高度；浅色、深色与 390×844 移动视口均已在隔离浏览器确认，未保存截图或敏感页面材料。
- `vue-tsc --noEmit`、研究契约、Academic real-gate、controlled-write gate、Vite production build 与 `git diff --check` 通过；未部署线上。

### 2026-10-05 窄屏输入区重叠修复与登录态证据复核

- 复现并修复 360px 以下手机输入区的按钮重叠：模型选择/上传保留在第一行，发送按钮在窄屏独立为第二行并占满宽度；390px 标准手机仍保持单行布局，桌面布局未改变。
- 受控登录态只读复核确认既有研究记录、能力选择、账户面板和手机研究工具抽屉可用；手机端 `body` 与文档宽度均为视口宽度且无横向溢出。
- 使用完全虚构且无敏感信息的本地文档验证附件入口：文件名进入研究请求卡片并随请求提交；因测试会话额度为零，服务安全返回额度不足，未生成来源/附件/推理成功结果。虚构请求、结果和本地 fixture 已清理。
- 本轮发现一个测试脚本默认凭据字段误进入本地工具输出，已按已暴露处置；未复制、未重试、未写入文件或第三方，记录不保留原文。`vue-tsc --noEmit`、研究契约、Academic real-gate、controlled-write gate、Vite production build 与 `git diff --check` 通过。

### 2026-10-05 首屏标题与尺寸层级收敛

- 删除首屏宣传式标题和长描述，将“选择一个能力开始”提升为唯一主标题，保留简短操作提示，能力列表直接承接输入区。
- 收紧桌面与手机首屏的标题字号、描述行高、能力行高度、图标尺寸、分组间距和底部操作区留白；移除无用的旧分组样式，未改变能力选择、导入或研究请求链路。
- 隔离浏览器确认桌面和 390×844 手机首屏均能渲染，标题、能力列表和输入区无重叠；未部署线上。

### 2026-10-05 删除宣传式首屏文案

- 按用户明确要求删除工作台各语言资源中的“研究工作，从证据开始”及其长描述，首屏统一使用“选择一个能力开始”，保留简短操作提示。
- 操作区按钮恢复为 44px 触控高度；浏览器 HMR 截图确认游客态标题、六个能力入口和研究任务设置保持清晰且无重叠。
- 本轮完成 locale JSON 解析与 `git diff --check`；完整类型检查和生产构建因依赖目录需联网重建而未重跑，未部署线上。

### 2026-10-05 学术绿主题与按钮规格定稿

- 按用户确认保留学术绿，撤回临时冷蓝色相，浅色和深色主题恢复原墨青绿 token。
- 统一研究库、登录、导入、建立研究问题和发送按钮为 44px 高、10px 圆角；浏览器实测宽高与弧度一致，未改变按钮行为。
- `vue-tsc --noEmit` 与 Vite production build 已通过，构建仅提示 Browserslist 数据过期；未部署线上。

### 2026-10-05 登录态移动端与证据节点复核

- 受控浏览器登录态确认研究记录可加载，基础能力和更多工具两个选择器均已启用；当前历史结果未渲染来源、附件或推理证据节点，未将其误报为完整证据链。
- 390×844 视口下文档宽度保持 390px、无横向溢出；研究工具面板宽 358px、内部无溢出，关闭入口可用；视口已恢复默认。
- `verify_research_contract.mjs`、`academic_real_gate_contract.mjs` 与 `academic_controlled_write_gate_contract.mjs` 均通过；未读取凭据、Cookie、Storage 或用户正文，未部署线上。

### 2026-10-05 登录态隐私与移动面板收敛

- 顶部账户按钮改用固定的“研究偏好与账户”无障碍名称，避免账号标识进入 DOM 复核结果；未改变账户设置入口行为。
- 移动端研究设置标题与关闭控件保持同一行，390×844 面板宽 358px、无横向溢出，两个模式按钮为 44px 触控高度；本轮受控浏览器标签已关闭。
- `vue-tsc --noEmit`、Vite production build、研究契约、Academic real-gate、controlled-write gate 与 `git diff --check` 均通过；当前历史研究结果仍未包含来源、附件或推理节点，未宣称证据链完成。
- 本轮一次受控 DOM 快照回传了测试账号标识，已按已暴露处置；未复制、未重试、未写入三件套或第三方，后续只读取布尔状态与尺寸，不再输出账号标识。

### 2026-10-05 学术绿主色与 ChatGPT 式按钮基线

- 按用户要求把低饱和学术绿设为 Lens 主操作色，蓝青收敛为辅助信息色；浅色/深色主题新增 `academic-accent` 语义 token，并让旧 `academic-blue` 变量指向同一主色，避免已有组件出现两套动作色。
- 按钮规格固定为 44px 最小高度、10px `--radius-button` 圆角；研究发送按钮改用语义圆角 token，移除源码中的 `rounded-full` 视觉歧义，未改变交互和请求链路。
- `vue-tsc --noEmit`、Vite production build、研究契约、Academic real-gate、controlled-write gate 与 `git diff --check` 均通过；构建仅提示 Browserslist 数据过期，未部署线上。
- 本轮只读取脱敏尺寸/状态元数据；浏览器标签已关闭，未保存页面文本、截图、账号标识或其他敏感材料。

### 2026-10-05 回归脚本凭据边界收敛

- 发现 `academic_regression.spec.cjs` 将默认登录字段和 JWT 形态 fixture 值写入源码；已删除默认值，测试现在必须从进程环境获得登录字段，路由响应改用明确的非凭据会话标识。
- 未读取、复制、重试或外传旧值；其他疑似命中仅做文件名盘点，未扩大读取范围。`git diff --check` 通过。

### 2026-10-05 聚合构建命令复核

- `chat` 的 `build-check` 聚合脚本改为顺序执行 `type-check` 与 `build-only`，移除对本地缺失 `run-p` 命令的依赖；本轮 `npm run build-check` 已通过，未安装新依赖或修改锁文件。

### 2026-10-05 本地一次性额度与真实 Academic 结果复核

- 按用户明确授权，给唯一超级管理员临时增加 1 次基础模型额度；使用已有本地登录态选择“学术型代码解释”并提交最小研究问题，真实 Academic 链路完成额度校验、流式执行和结果渲染。
- 请求完成后将额度恢复到加额前的零值，并通过数据库复核恢复成功；未保留临时凭据、token、测试文件或外部发布状态。
- 本次结果未开启联网、文件上传或深度推理附加能力，因此来源、附件、推理节点仍未完成真实样本复核；本地研究结果记录保留在测试账号中供视觉确认。

### 2026-10-05 历史来源证据标签修复

- 历史研究记录的来源摘要和“证据链”来源数量改为以 `parseAcademicSources` 的有效公开来源为真相；只有联网搜索正在进行且暂时没有来源时才显示进行中状态。
- 保留已有来源 URL 的凭据、内网地址和本机地址过滤；未改变附件下载、推理展示、请求链路或后端数据。
- `vue-tsc --noEmit`、研究契约、Vite production build 与 `git diff --check` 均通过；真实登录结果仍缺少可用的来源/附件/推理样本，未将静态验证误报为真实证据链完成。

### 2026-10-06 顶部品牌与发送区视觉收敛

- 按用户反馈将 YutoGPT 项目 `logo.svg` 作为 Lens 顶部品牌标记的本地静态资产；左上角保留 Lens 单行字标，移除重复的“YutoAI · 学术研究工作台”可见副标题，浏览器标题继续保留学术工作台语义。
- 发送区移除额外的“输入区”标题分隔，工具按钮改为透明底与统一边框状态；发送和停止操作统一为 44px 触控尺寸、学术绿方形按钮，保留原有无障碍名称、禁用态和提交链路。
- `vue-tsc --noEmit`、研究契约、Vite production build、Impeccable detector 与 `git diff --check` 通过；构建仅提示 Browserslist 数据过期，未部署线上。

### 2026-10-06 首页分隔线与发送区对齐精修

- 按用户反馈删除首页“点击功能，输入问题即可开始。”及五语言对应文案键；移除首页标题下方、底部操作区和右侧任务设置之间的整宽/整高灰色分隔线，改用留白与背景层级建立信息分组。
- 登录后输入区的选项行与发送行改为明确的两层布局，发送按钮不再与 132px 最小宽度规则冲突；新增 40px 控件高度与 12px 按钮圆角令牌，工作台按钮统一沿用该规格，未改变登录、上传、保存项目和研究提交链路。
- `npm run build-check`、`npm run verify:research-contract` 与 `git diff --check` 通过；本地 Vite 页面截图确认首页标题、能力入口、输入区和任务设置无重叠。本轮未启动 Academic 服务、未执行登录或上传、未部署线上。

### 2026-10-06 登录态最终验收环境复核

- 重新启动本地 Academic runtime 做登录态复核；进程内部进入等待连接状态，但从当前受控工具沙箱访问 38000 回环端口仍不可达，未把“服务已可用”写成事实；随后已停止进程。
- 固定共享 Chromium 的 Playwright headless 预检以 SIGABRT 终止，学术回归 fixture 未进入测试阶段；未安装新浏览器、未读取 Cookie/Storage/凭据或用户正文，也未改动固定 Chromium。
- `npm run verify:release-candidate` 通过：发布候选 178 个文件、legacy UI 未包含、12 项兼容契约完整；此前本轮 `npm run build-check`、研究契约与 `git diff --check` 已通过。
- 真实登录态的来源、附件、推理证据链以及移动端登录态仍未完成可复核验证；本轮关闭浏览器并清理临时 fixture 脚本与日志，未部署线上。

### 2026-10-06 登录态零泄漏处置

- 本地服务恢复后，受控浏览器确实进入已有登录态；但无障碍读取意外同时返回账号标识和历史研究正文，随即停止后续页面读取并关闭标签。
- 停止本地服务时调试输出出现账号/指纹类标记；未复制、未重试、未写入文件或第三方，均按已暴露处理。后续不再读取该登录态，登录态证据链改由用户手动接管或脱敏 fixture 完成。
- 本轮未上传资料、未提交研究请求、未修改账户、未部署线上；相关进程与浏览器已关闭。

### 2026-10-06 隔离登录态与最终视觉验收补强

- 在固定共享 Chromium 上新增三项只使用虚构字段和本地 API route fixture 的回归：登录历史证据链（公开来源过滤、附件、推理元信息、刷新恢复、权限选择器）、390/360/320px 移动布局（抽屉、发送与上传控件不重叠）以及游客态历史隔离；3 项全部通过。
- 生成并检查浅色、深色、390px 和权限抽屉截图，确认研究内容、证据链、输入区和右侧设置层级清晰；截图与 Playwright `test-results` 已清理。
- `npm run build-check`、研究契约、发布候选、Academic real-gate、controlled-write、static-release 与 `git diff --check` 均通过；构建只提示既有 Browserslist 数据过期。真实账号数据仍未继续读取，未上传、未提交研究请求、未部署线上。

### 2026-10-06 隔离资料上传验收

- 新增当前工作台的上传 fixture 回归：使用虚构 PDF，确认上传完成后文件元数据随 Academic 请求的 `fileUrl` 提交，未停留在界面状态；测试通过。
- 与证据链、游客隔离、移动布局验收合计四项隔离测试全部通过；本轮只使用本地路由和虚构字段，未读取真实登录态、浏览器隐私数据或用户正文。
- 测试结束后已关闭 Vite、清理 `test-results` 与临时截图目录，9003/9520/38000 均无残留监听。

### 2026-10-06 桌面与移动端右侧布局精修

- 按用户反馈重排桌面右侧工具栏：输入区与研究任务设置形成明确分组，工具栏宽度、内边距、分隔线和滚动区域统一，输入控制带在桌面端收敛为单行布局，减少空洞和下坠感。
- 统一研究输入区按钮基线：模型、上传、发送/停止操作沿用同一套 40px 高度、12px 圆角、边框和状态色；360px 以下移动端保留方形发送按钮，不再拉伸为整行，避免与模型和上传控件失去节奏。
- 移动端研究工具抽屉增加独立安全边界，首页窄屏留出可滚动空间，避免能力列表与底部输入区产生视觉遮挡；未改变登录、能力选择、上传或研究提交链路。
- `vue-tsc --noEmit`、Vite production build、Impeccable detector 与 `git diff --check` 通过；本地预览仍保留在 9003，未部署线上。

### 2026-10-06 移除研究设置上方分隔线

- 按用户要求移除桌面右侧输入区与“研究任务设置”之间的灰色下边线，保留内边距和背景层级作为分组依据；未改变控件、登录、上传或研究提交行为。
- `git diff --check` 通过，9003 本地预览继续热更新，未部署线上。

### 2026-10-06 首屏重点与按钮系统评估

- 视觉复核确认首屏重点此前被服务状态提示、低对比能力入口和底部输入区分散；移动端服务提示压缩为紧凑信息块，能力入口改为带连续分隔节奏的研究清单行，标题与能力选择更早进入视线。
- 头部研究工具按钮补齐与其他主控件一致的边框、圆角和主色规则；未改变能力选择、登录、上传或研究提交行为。
- `vue-tsc --noEmit`、研究契约、Impeccable detector 与 `git diff --check` 通过；未部署线上。

### 2026-10-06 移除右侧重复登录提示

- 删除游客态右侧“登录后加载研究能力”说明和重复登录按钮，顶部账户入口继续承担登录动作；服务不可用和无可用能力状态仍保留必要反馈。
- 未改变能力选择、权限判断、上传、保存或研究提交链路；`vue-tsc --noEmit`、研究契约和 `git diff --check` 通过。

### 2026-10-06 移除当前任务分隔线

- 按用户反馈移除研究任务设置中“当前任务”摘要下方的灰色分隔线，保留原有间距、能力选择和权限逻辑。
- HMR 页面确认该区域 `border-bottom` 为 0；未改变其他布局或业务链路。

### 2026-10-06 全局视觉与响应式审计收敛

- 完成 Lens 工作台颜色、按钮、排版和响应式的源码级审计并做最小结构修正：旧全局蓝色回退令牌统一指向学术绿语义，深色流程进度、运行态和记录卡片移除旧蓝色/黑色硬编码，保持状态语义和深色对比度。
- 首页能力入口移除贯穿式灰色下划线，改为轻量圆角单元；移动端研究输入的能力标签改为单行横向滚动，避免在窄屏挤压上传与发送操作。
- 顶部研究设置入口与工作区 `md` 断点同步；手机端保留主题与语言图标入口，并将语言控件收窄为图标级宽度，避免功能被隐藏或按钮重叠。
- 右侧面板移除与顶部重复的服务不可用提示；选择器与文本区焦点统一使用学术绿焦点环；桌面工具栏改用 `clamp` 保证窄桌面仍有足够的控件宽度。
- `vue-tsc --noEmit`、Vite production build 与 `git diff --check` 通过；生产构建仅提示既有 Browserslist 数据过期，未安装依赖、未部署线上。因浏览器安全审查拒绝读取可能带登录态的完整页面树，本轮不宣称真实账号视觉验收已完成。

### 2026-10-06 语言切换控件去边框

- 顶部语言切换按钮去除常态与悬停灰色描边，沿用既有尺寸和圆角；保留悬停背景、全局键盘焦点与语言切换行为。
- 移除父级强制背景覆盖，使悬停反馈正常生效；Vue 类型检查和 `git diff --check` 通过，未部署线上、未读取登录态页面。

### 2026-10-06 登录弹窗字体与品牌标记精修

- 登录弹窗用 YutoGPT SVG 标记与 Lens 字标替换原来的字母占位 Logo，并沿用浅色/深色主题的品牌滤镜。
- 登录标题、说明、字段标签、协议文字、登录方式切换、关闭按钮和协议弹窗标题改用语义主题色，修复浅色模式下白色文字对比度不足的问题；主登录按钮和验证码按钮统一使用学术绿与 `--radius-button`。
- 保留登录、验证码、协议查看和关闭逻辑；`vue-tsc --noEmit` 与 `git diff --check` 通过，未部署线上、未读取登录态页面。

### 2026-10-06 删除登录弹窗重复文案

- 删除登录弹窗中重复的品牌标题和宣传式副标题，仅保留 Logo 品牌识别与本地化“登录”标题。
- 五语言资源同步移除未使用的登录标题/副标题键；未改变认证、验证码、协议查看或关闭行为。

### 2026-10-06 收敛为单能力研究入口

- 移除 `CapabilityPanel` 的能力编排模式切换、步骤构建器、步骤参数、上下移动和删除控件，右侧设置只保留基础能力、更多工具和必要的补充要求。
- 新研究请求固定走单能力路径；store、历史编排结果解析与历史结果展示仍保留，保证旧数据和后端接口兼容，不再向用户暴露多能力编排入口。
- 删除对应面板的废弃工作流样式与选择逻辑；`vue-tsc --noEmit`、`git diff --check` 通过，未部署线上。

### 2026-10-06 研究记录与全局控件协调

- 将顶部入口、研究记录抽屉、搜索、新建、空状态和列表标题统一改为“研究记录”，同步英文、日文、韩文、简体中文和繁体中文。
- 游客态登录按钮改为学术绿主按钮，登录后账户入口继续保持图标控件，避免两种状态都使用同样的弱边框。
- 桌面发送按钮与输入区控件收敛为 36px，手机端保留 40px 触控尺寸；昼夜 SVG 增加 0.5px 光学居中修正。
- 首页能力入口继续限制为最多 3 个基础能力和 3 个更多工具，完整能力列表仍由右侧单能力设置承载，避免首屏继续堆功能。

### 2026-10-06 学术能力收敛与研究捷径

- 新增 `academicCapabilityCatalog.ts`，集中维护首页能力优先级与研究捷径，避免 `ResearchStart` 和右侧能力面板各自维护一套排序规则。
- 首页能力按研究优先级展示：优先呈现英文/中文润色、参考文献转 BibTeX、中英互译、学术型代码解释，以及 PDF 深度理解、PDF/Word 批量总结；论文速读和 Arxiv 仅作为可用时的降级入口。完整能力仍保留在右侧高级选择器，未删除后端函数。
- 新增三条研究捷径：整理研究笔记、比较多篇论文、生成教学材料。点击后直接把结构化任务填入现有研究输入框，继续使用当前资料、权限、研究记录和单能力提交链路；不新增工作流编排或第二套请求协议。
- 右侧“更多工具”默认收敛为常用资料理解与写作工具；展开高级设置后才显示低频的 Arxiv/LaTeX 变体。后端函数、套餐权限和已有历史选择均保留，当前选择的低频工具仍会被置于选项首位，避免历史记录失效。
- `vue-tsc --noEmit`、`npm run verify:research-contract`、Vite production build 与 `git diff --check` 通过；构建仅提示既有 Browserslist 数据过期，未安装依赖、未部署线上。

### 2026-10-06 第一版证据卡片

- 新增 `ResearchRecord/EvidenceCards.vue`，在研究结果中将已确认的公开来源与本轮上传资料整理成紧凑来源卡片；公开来源提供安全过滤后的外链，上传资料只显示安全文件名。
- 卡片明确标注“可打开来源”或“待核验原文与页码”，不生成不存在的页码、摘录或引用；现有来源展开列表、文件下载和研究记录链路保留。
- 五语言补齐证据卡片文案；`vue-tsc --noEmit`、JSON 解析、Vite production build、研究契约与 `git diff --check` 通过。未读取真实登录态、未上传资料、未部署线上。

### 2026-10-06 更新目标并完成证据卡片保存闭环

- 将 Lens 当前目标更新为“研究结果可追溯、可复核、可回到研究记录”，要求界面明确区分来源、资料、结论和待核验信息，禁止伪造页码、原文和引用。
- 新增 `domain/research/evidence.ts`：登录用户可以在当前研究记录中保存或取消保存证据卡片；存储按账号与研究记录隔离，并使用加密本地存储，保存内容只含标题、公开来源去查询参数后的链接、媒体类型和文件名，不保存原文、token、cookie 或附件路径。
- 未登录或账号/研究记录 ID 不可确认时不展示保存按钮；历史卡片重新渲染时会恢复保存状态。后端数据结构未改动，未执行线上写入。
- `vue-tsc --noEmit`、`npm run verify:research-contract`、Vite production build 与 `git diff --check` 通过；构建仅提示既有 Browserslist 数据过期。
- 隔离 Playwright 回归本轮未进入测试阶段：`pnpm` 在无 TTY 环境尝试依赖状态检查时因禁止自动移除 modules 目录而中止；未设置强制重装选项、未安装新依赖、未读取浏览器数据。前端类型检查、研究契约和生产构建仍已通过。

### 2026-10-06 证据卡片存储边界与目标快照收敛
- 证据卡片本地持久化新增失败隔离：浏览器存储被禁用、数据损坏或写入失败时按空结果处理，不阻断研究结果渲染，也不向外暴露存储异常。
- 重写 `STATUS.md` 为当前快照：目标固定为研究结果可追溯、可复核、可回到研究记录；历史事实继续保留在本文件，未把猜测写入状态。
- 未新增依赖、未读取浏览器隐私数据、未执行服务器或线上写入。

### 2026-10-06 本地验收端口阻塞确认
- 9003 前端仍在监听，但 9520 Nest 与 38000 Academic 未监听。
- 直接启动 Academic 时，运行时明确返回本地监听权限错误；改用 `127.0.0.1` 仍被当前执行沙箱拒绝。Nest 代码构建通过，但同样无法在当前沙箱创建监听端口。
- 未通过修改前端状态或伪造健康结果绕过；已清理本轮临时缓存与探测日志，未安装新依赖、未读取浏览器隐私数据、未写入服务器或线上环境。

### 2026-10-06 发送区绿色层级收敛
- 移除发送/停止按钮对分散式工具类背景的依赖，改由 `ResearchComposer` 统一控制背景、文字、边框、阴影、悬停、按下和键盘焦点状态。
- 输入容器加入极轻的学术绿边界与混合背景，让主操作色与发送区材质形成连续层级；桌面 36px、手机 40px 控件尺寸及布局保持不变。
- Vue 类型检查、研究契约、Vite production build 和 `git diff --check` 通过；未部署线上。

### 2026-10-06 桌面右栏底部留白修正

- 桌面工具栏取消随整页拉伸，按内容高度布局并限制在可用高度内；溢出时整栏滚动，研究任务设置不再使用 flex 增长填充。
- 移除输入器底部与栏内 gap 的重复间距，以及贯穿式左边框；合并重复的设置容器样式，移动端不变。
- Vue 类型检查、研究契约、生产构建通过；未读取既有登录态页面，尚未完成本轮浏览器视觉验收，未部署线上。

### 2026-10-06 桌面右栏整体空间分配

- 根据用户继续反馈，桌面右栏调整为先选研究能力、再输入问题并发送的 DOM 与键盘顺序；可用高度分配给研究输入区，替代上一轮仅收短右栏的方案。
- ResearchComposer 增加仅由桌面调用方启用的 fillAvailableSpace 布局模式；该模式使用栏内高度并滚动长文本，移动调用方继续按内容自动增高。
- 桌面输入区至少保留 260px；高级设置、附件或短视口超出高度时整栏滚动。认证、上传、发送与停止逻辑未变。
- Vue 类型检查、研究契约、生产构建通过；尚未完成浏览器视觉复核，未读取既有登录态、未新增依赖、未部署线上。

### 2026-10-06 恢复可见本地预览

- 初检 9002 与 9003 均未监听；通过获批的本机执行重新启动现有 Vite，仅监听 127.0.0.1:9003，未安装依赖或改动业务代码。
- 浏览器 HTML 请求首页返回 HTTP 200；ResearchWorkspace 与 ResearchComposer 组件请求均返回 200。
- 系统 Edge 打开本地首页命令成功；Codex 内置预览打开请求返回 queued。不将打开命令等同于视觉验收，未读取浏览器登录态或存储。

### 2026-10-06 桌面输入区恢复紧凑与首页标题更新

- 按用户反馈删除 fillAvailableSpace 模式及配套样式，撤除桌面输入区强制伸展和 260px 下限；恢复已有按内容自动增高与展开逻辑，移动端调用保持原样。
- 桌面右栏随内容布局并保留溢出滚动；移除栏背景玻璃层，设置与输入区边缘对齐，组间距收敛为 12px。
- 首页主标题改为学术GPT，英文、日文、韩文、繁体中文同步；产品品牌和浏览器标题仍保留 Lens。
- Vue 类型检查、研究契约、生产构建、五语言 JSON 解析和差异检查通过。9003 首页与两个修改组件的 HTTP 请求返回 200；未读取登录态，未宣称完成视觉验收，未部署线上。

### 2026-10-06 研究入口移入桌面右栏

- 提取 ResearchShortcuts 组件，复用现有研究捷径目录及“设置提示词、聚焦输入框”的行为，不复制数据或新增请求链路。
- 桌面空首页右栏按研究入口、任务设置、紧凑输入器的顺序布局，左侧移除三项重复入口；移动端继续在起始页能力列表下方显示同一组件。已有研究结果时不新增起始入口。
- 删除 ResearchStart 的旧入口渲染、点击逻辑和相关样式；新增组件保留既有卡片样式及可见键盘焦点。
- Vue 类型检查、研究契约、生产构建与 git diff --check 通过；9003 首页和三个相关组件请求返回 200。未读取登录态，未安装依赖，未部署线上；浏览器视觉复核未完成。

### 2026-10-07 恢复后台本地预览

- 初检 9003、9520、38000 均未监听；重新启动现有 Vite，仅监听 127.0.0.1:9003，以独立后台进程运行，标准输入输出均不落盘。
- 首页浏览器 HTML 请求返回 HTTP 200；Edge 打开命令成功，Codex 预览打开请求为 queued。未读取浏览器登录态或存储，未修改业务代码、安装依赖或启动后端。

### 2026-10-07 修复首页图标回退问号

- 首页能力与研究入口使用的右箭头未包含在本地图标集合，触发 SvgIcon 的圆圈问号回退；补齐右箭头、笔记、论文比较和教学材料图标，证据来源链接改用已有 links-line 图标。
- 验证研究起始页、研究入口、证据卡片和能力目录的静态图标均已本地打包；对比 Git 基线确认旧图标数据、另一图标集合与回退行为保持不变。
- Vue 类型检查、研究契约、生产构建通过；未新增依赖、未读取浏览器隐私数据、未部署线上。浏览器视觉复核仍待确认。

### 2026-10-07 工作台深度精修与顶部导航统一

- 按用户最新要求保留能力箭头，但仅在精细指针悬停时显示；首页能力和研究入口复用同一样式，默认、选中和触屏均不常驻，不加圆圈。
- 顶栏移到工作台横向布局外，贯穿全宽；桌面左右内容起点对齐，紧凑断点改为 1024px，平板使用单主区和可展开任务设置。首页卡片使用完整换行说明，统一控件圆角、图标、标题字号和间距。
- 顶部顺序改为研究记录、研究工具（紧凑布局）、主题、语言、账户；研究工具改为次级操作，登录保留主绿色。语言增加地球图标，选项改为原生按钮，支持键盘选择；五语言能力说明复用已有映射。
- 首页选择能力、空白研究和研究捷径在保留 store 状态更新后关闭自动弹出的紧凑设置，直接聚焦输入；顶部主动设置路径保留。选择框改用关联标签，自定义指令增加名称，高级设置增加展开状态。
- 发送区的全局重复背景、边框和阴影覆盖移除，由 ResearchComposer 统一管理；附件加载指示使用学术色，脉冲名称与实际行为一致。未改认证、权限、上传、计费、研究请求与结果契约。
- Vue 类型检查、研究契约、生产构建、git diff --check 通过；12 组隔离验收覆盖 320–1440px、中英文和明暗主题，顶部控件至少 44px、无重叠/横向溢出，悬停箭头、键盘焦点、语言切换、合成能力选择、入口输入聚焦及主动设置通过。
- 所有 API 在新测试上下文中拦截，只使用合成状态；未读取真实登录态、浏览器存储或账号数据，未新增依赖、未写入线上。真实研究提交未据此宣称完成。
- 收尾关闭隔离浏览器，清理本轮临时脚本、构建/契约日志和 17 张中间截图；只保留两张无账号数据的桌面/手机最终复核截图。既有混合工作树仍为 34 项改动，未提交或丢弃其他工作。

### 2026-10-07 刷新页面启动骨架对齐

- 将 index.html 的旧三栏、YutoAI 文字及“你的项目”加载占位替换为 Lens 工作台骨架；复用正式 SVG，统一系统字体、学术色、圆角、64px 顶栏和 1024px 紧凑断点，不展示虚假的业务数据。
- 在应用脚本加载前只解析公开 theme 偏好并设置根主题，异常安全回退；深色首屏无需先闪白，页面边缘不再保留浏览器默认 margin。移除启动页 Google Fonts 外部请求，采用轻量透明度脉冲并尊重减少动态效果。
- 固定 Chromium 的 5 组新隔离上下文延迟主脚本测试通过：桌面、手机、320px 小屏、深色桌面与深色手机均无溢出；品牌图标正常，骨架在挂载后移除，再次刷新恢复正常，减少动态效果下无动画。
- 研究契约、生产构建、git diff --check 通过；机械设计扫描的纸白色提示按既定配色保留，隐藏 SEO 语义内容的字号提示不扩大到业务页面。未改研究请求/认证/数据契约、未读取现有登录态、未新增依赖或部署线上。
- 隔离测试浏览器已关闭；临时脚本、构建日志和 3 张中间截图已清理，保留 2 张无账号数据的桌面/手机启动页复核截图；工作树仍包含 35 项累积变更。

### 2026-10-07 研究捷径标题改为特色功能

- 将研究捷径区“研究入口”标题改为“特色功能”，简体、繁体、英文、日文、韩文同步；桌面、手机和无障碍区名称共用既有 starterTitle，未新增重复文案或修改功能。
- 五语言 JSON 与标题存在性检查、git diff --check 通过；未产生新的测试文件、依赖或线上写入。

### 2026-10-07 登录品牌区精简为 SVG Logo

- 复核“特色功能”五语言标题已生效；登录品牌区删除可见 Lens 文字及其专用排版样式，复用既有 SVG，并保留图片 Lens 替代文本与登录操作标题。
- 390px 手机与 1440px 桌面新隔离上下文检查通过：特色标题一致、SVG 正常加载、品牌区无可见文字、弹窗不越出视口。全部 API 拦截，不读取真实登录态或存储，测试浏览器已关闭。
- Vue 类型检查与生产构建通过，临时构建日志已删除；未新增依赖或部署线上。

### 2026-10-07 桌面发送区常驻与两栏空间收敛

- 复现原右栏整栏滚动问题：1280×720 与 1280×600 窗口的发送按钮超出可视区域。将右栏拆为独立的配置滚动区与发送区，移除外栏滚动；高级配置和附件增多时，发送按钮仍完整可见。
- 基础能力和更多工具在桌面并排，高级设置按钮移至标题行；移除桌面重复的能力摘要和发送区能力标签，保留手机能力提示与已有选择状态。窄输入区工具按钮使用图标、既有提示和无障碍名称，保留 44px 控件目标；认证、权限、模型、上传、计费和研究执行逻辑未改。
- 收紧桌面特色功能、首页标题和能力卡片间距，矮屏特色功能说明收起但保留 title；顶部研究记录降低边框强调，导航间距与内容边缘统一。启动骨架同步栏宽、卡片高度和并排设置占位，手机结构保留。
- Vue 类型检查、研究契约、生产构建、git diff --check 与布局机械扫描通过；11 组全新隔离上下文覆盖 320–1440px、中英文和明暗主题，已测桌面常规状态左右区域无滚动，正常/高级设置/长输入的发送按钮均在视口内，顶部控件至少 44px 且无重叠或横向溢出。
- 补充 1024×600、1280×600 矮屏检查：展开长输入与添加 6 份合成附件后发送按钮仍可见，附件内部滚动且高度受限，模型菜单位于视口内；390px 手机选择能力、输入聚焦和任务设置开关通过。
- 测试全程使用合成状态并拦截 API，未读取真实登录态、浏览器隐私数据或真实研究资料，未安装依赖、启动后端或部署线上。临时测试脚本、构建日志与中间截图已清理，仅保留两张无账号数据的最终桌面/手机截图；隔离浏览器已关闭，工作树仍有 35 项此前累计改动。

### 2026-10-07 紧凑操作面板、隔离登录复核与本地开发服务恢复

- 按用户最新视觉反馈，首页撤销操作固定到底部的方案；左侧入口紧接能力列表，右侧特色功能、设置与发送集中到随内容收束的操作面板。桌面纸白背景统一，学术绿色只覆盖紧凑面板；发送框不强制放大，手机结构保留。
- 首页空状态容器改为按剩余空间分配，服务提示与首页共同计算高度，避免提示和满高内容相加造成额外滚动；刷新骨架同步紧凑面板结构。
- 现有隔离登录验收取消对真实凭据的依赖，只有已安装全量拦截的验收页面使用虚构表单值；补齐合成 Academic 健康响应，移除已删除重复游客提示的旧定位断言。没有修改生产认证或权限逻辑。
- 四项隔离验收通过：研究历史的来源/附件/推理刷新保持、公开来源过滤内网地址、资料随 Academic 请求提交、手机权限面板和控件不重叠、游客不显示历史且选择器禁用。补充登录后的 1440×900、1280×720、1280×600 高级设置展开/收起检查，发送按钮完整可见、外栏不滚动。
- 类型检查、生产构建、研究契约、差异检查与布局扫描通过。最终紧凑首页在 1440×900、1280×720、1280×600 游客状态左右区域无滚动；390px 手机无横向溢出且发送按钮可见。视觉仍需用户确认，不把测试通过等同于用户满意或真实模型结果准确。
- 按用户明确要求启动本地 Nest watch 开发进程与 Academic API，复用现有 Vite；9003、9520、38000 均返回 HTTP 200，Academic 健康状态 ready。通过标准 dotenv 解析器只在内存确认数据库、缓存和 Academic 目标为本地资源，未输出字段原文；Nest 跳过数据库结构初始化，服务仅在本地监听。Edge 打开命令成功，Codex 内置预览 queued，未读取浏览器现场。
- 未安装依赖、读取真实登录态或部署线上。临时脚本、构建日志、中间截图及运行器产物已清理；保留无账号首页和合成登录结果复核截图，隔离浏览器残留为 0。开发服务按用户要求保持运行，工作树仍含 35 项累计变更，未提交或丢弃此前工作。

### 2026-10-07 首页整体对齐与右栏学术绿恢复

- 按用户整体排版和保留专业绿色的要求，桌面工作台与顶栏统一居中、最大宽度 1280px，右栏宽度 360–416px 自适应；删除重复水平内边距，两栏标题与首行卡片对齐。右栏恢复既有浅学术绿，只保留一层随内容收束的面板，主操作继续深绿。
- 统一特色卡片、配置与输入区的空间节奏；矮屏减少组间距，避免英文说明引起额外滚动。高级设置继续仅在配置区滚动，发送按钮常驻可见；手机既有单栏和底部发送结构保持。刷新骨架同步栏宽、绿色容器和间距。
- 10 组全新隔离上下文通过：320–1920px、中英文、明暗主题、普通/选中能力/高级设置及紧凑设置开关。已测状态发送完整可见、无横向溢出；桌面常规状态左右区域无滚动。截图复核覆盖桌面、笔记本、手机与深色。
- 四项既有隔离登录回归在最新布局通过，覆盖历史证据刷新、内网来源过滤、资料请求、手机权限与游客隔离；Vue 类型检查、研究契约、生产构建及差异检查通过。没有修改生产认证、上传、权限、计费或研究执行契约；全部 API 拦截，不读取真实登录态或浏览器存储，真实模型准确性仍未验证。
- 本地 9003 与 9520 首页返回 HTTP 200，38000 Academic 健康接口 ready；开发服务继续运行。隔离浏览器残留为 0；临时脚本、测试运行器产物与中间截图清理，保留最新首页和合成登录复核截图。既有 35 项混合改动未提交或丢弃，未新增依赖或部署线上；最终视觉待用户确认。

### 2026-10-07 桌面入口列表化与操作区减重

- 根据用户对桌面端的否定反馈，左侧能力由六张独立卡片改为一组纸白能力列表，保持既有内容、权限筛选、选择状态和点击链路；右侧特色功能移除嵌套白卡，保留浅学术绿和悬停反馈，主操作继续深绿。
- 工作区与顶栏增加适当空间，按普通屏幕/笔记本/矮屏统一纵向密度；修正 600px 矮屏和英文 720px 视口的配置区额外滚动，发送区仍独立可见。刷新骨架同步桌面列表与紧凑节奏。手机布局和配色未修改，不引入未经确认的黄色方案。
- 10 组隔离布局复核通过，覆盖 320–1920px、桌面/平板/手机、中英文和明暗主题；已测状态无横向溢出、发送按钮完整可见，桌面常规状态左右区域无需滚动。四项既有全拦截登录回归通过，覆盖历史证据刷新、附件提交、手机权限和游客隔离。
- Vue 类型检查、研究契约、生产构建、差异检查与布局扫描通过；生产认证、权限、上传、计费、研究请求未修改。没有安装依赖、读取真实登录态或部署线上。临时脚本、测试产物和中间截图清理，保留最新复核截图；本地开发服务继续运行，最终视觉仍需用户确认。

### 2026-10-07 桌面留白继续收敛与最新验收边界

- 用户继续否定桌面视觉后，删除能力列表的大白框，顶栏与工作台最大宽度由 1280px 收窄至 1120px，右栏上限由 416px 调至 400px；仅在桌面断点加强能力文字层级。手机浅学术绿及既有单栏未改，启动骨架同步宽度与无外框列表。
- 最新 Vue 类型检查、研究契约、生产构建、差异检查与布局扫描通过。启动最新浏览器复核时，自动审批因额度限制无法完成审核，调用没有执行；这不是不安全判定，不绕过审核。最新改动尚无浏览器验收证据，此前截图与通过结果只证明此前版本。
- 源码与现有四项测试复核确认：证据卡片已有按账号/记录保存和取消保存实现，但测试未覆盖保存状态刷新恢复、账号/记录隔离或全部套餐层级。继续保留这些未验收项，不把历史来源刷新测试当成证据卡片持久化证明。
- 临时脚本、运行器结果及本轮中间截图已清理；没有执行线上操作、安装依赖或读取浏览器隐私。工作树保留既有混合改动。最终视觉与登录研究目标仍未完成。

### 2026-10-07 撤回用户否定的桌面改版

- 用户反馈桌面越改越差后，仅撤回本轮展示实验：恢复 1280px 工作区/顶栏、两列能力卡片、360–416px 右栏、特色功能白卡和此前纵向间距；保留学术绿及独立发送区。手机断点、配色和所有业务链路未改，启动骨架同步恢复。
- 撤回后 Vue 类型检查、研究契约、生产构建、差异检查和布局扫描通过；没有对整个混合工作树执行还原。最新浏览器复核仍受自动审批额度限制，本轮未执行该调用，不把旧截图或历史通过结果写成当前视觉验收。
- 状态快照同步为恢复后的双栏方案，最终视觉、证据卡片持久化/隔离和完整权限层级仍待验收。没有新增依赖、上线操作或敏感读取；本轮临时产物已清理，保留 35 项累积改动与 5 个未跟踪文件。

### 2026-10-07 证据保存闭环与研究记录刷新修复

- 为既有全拦截隔离 fixture 增加合成账号、套餐配置、按记录取历史和单次失败响应；新增来源/上传资料保存与取消保存、刷新恢复、记录/账号隔离、代表性套餐权限和失败重试测试。不读取浏览器存储，断言只观察合成页面状态；生成的下载结果和上传资料分开验证，精选首页不要求枚举全部能力。
- 隔离回归发现刷新后当前研究内容恢复但研究记录弹窗为空：初始化只读取当前消息，未重新加载记录列表。最小修复在既有初始化流程先调用 queryMyGroup，再读取当前消息；挂载与重试共用该路径，既有登录变化流程和接口保持不变，相关失败捕获不再输出异常原文。
- 最终 12 项隔离登录回归全部通过，包括成功/刷新/切换/取消保存、相同来源不跨账号或记录、加载失败后的恢复、五种代表性权限状态、原有历史证据/附件/手机/游客主路径。Vue 类型检查、研究契约、生产构建、测试语法和差异检查通过；不将合成验证等同于真实后端执行或计费准确性。
- 浏览器审批恢复后，当前双栏正式方案重新完成 7 组外观检查，发送按钮可见、顶栏无重叠、无横向溢出，桌面常规状态不滚动。9003/9520/38000 健康请求 HTTP 200，Academic ready；开发服务保留运行。
- 用户继续否定桌面视觉后生成 A 两列紧凑、B 三列入口两张 1440px 隔离对比稿，保留学术绿及全部入口，只注入测试页样式，没有替换正式页面；视觉方向与最终验收仍待用户反馈。没有安装依赖或部署线上。
- 本轮临时脚本、运行器结果、错误上下文及中间产物清理，隔离浏览器关闭，保留无真实数据的最新复核截图和对比稿。三件套状态/事实已同步，长期规则无变化；35 项混合改动及 5 个未跟踪文件继续保留。

### 2026-10-07 恢复旧桌面比例与连续学术绿操作栏

- 用户指出布局偏离旧设计、像左右拼成的图纸；依据保留的 lens-polish 桌面截图撤掉居中 1280px 页面限制和右栏的大圆角容器，恢复满宽顶栏、880px 主内容比例及连续铺至窗口底部的浅学术绿操作栏。常规桌面配置恢复纵向排列，矮屏保留紧凑两列配置；全部入口、权限、发送、记录、证据及手机样式未删改。启动骨架同步，未还原整个混合工作树。
- 类型检查、研究契约、生产构建和差异检查通过；12 项既有隔离登录回归及 7 组新布局检查通过，覆盖 1440/1280/1024px 桌面、600px 矮屏、390/320px 手机和深色。已测发送完整可见，无横向溢出，普通桌面主区及配置区不滚动，连续操作栏无滚动。所有页面使用全拦截合成数据，不读取真实登录态或浏览器存储。
- 当前方向已替换本地正式页面；A/B 对比稿未应用，作为用户已否定的临时设计产物清理。仍保留旧设计参考和最新安全截图；视觉须用户确认，不把布局通过等同于审美完成。没有安装依赖、服务器变更或部署线上，本地开发服务继续运行。
- 中文桌面、手机和深色截图以新上下文的 zh-CN 语言生成，预览检查通过。此前一轮通过语言按钮切换的截图尝试被登录浮层阻挡并超时，未计入通过结果，未据此推断真实账号问题。临时预览运行器和超时产物均已清理。

### 2026-10-07 输入按需展开、发送按钮比例与纵向布局

- 按用户要求，输入框展开按钮只在有实际内容且超过可见高度时显示；已展开时保留收起入口，清空后自动回到普通高度。删除重复的行数与像素限制，CSS 负责最大高度，组件按实际 scrollHeight/clientHeight 判断溢出；响应宽度变化，输入引用使用明确 DOM 类型，修复粘贴聚焦时的空引用边界。未改提交或上传协议。
- 发送/停止按钮的绿色视觉由 44px 收到 36px，图标 16px；透明边界保留 44px 可点击范围，视觉弧度沿用全局令牌。空会话桌面入口纵向居中，右侧输入区靠近窗口底部，保留连续学术绿；有研究结果时正文继续从左侧顶部展示。骨架同步，手机内容布局未重排。
- 新增输入交互回归，覆盖桌面、矮屏、390/320px 手机的短输入隐藏、溢出展开、展开/收起保留文本和清空隐藏；资料提交回归补充空首页切换为左侧结果及刷新恢复。首次新回归发现 CSS min() 限制无法用 parseFloat 读取，已改为实际渲染高度判断；最终 14 项隔离测试通过，其中 13 项交互/登录与 1 项涵盖 7 视口的布局检查。
- Vue 类型检查、研究契约、生产构建、测试语法、差异检查及布局扫描通过；当前布局已测桌面上下留白均衡、发送区底部距离 16–32px、发送可见、无横向溢出及普通桌面区域滚动。所有账号及研究内容为隔离合成数据，不将结果等同于真实模型与计费验证。
- 三件套已复核，长期规则无变化。临时运行器、构建日志、失败上下文已清理；保留最新安全截图及开发服务，35 项累计改动和 5 个未跟踪文件未提交或丢弃。最终视觉仍待用户确认，未安装依赖或部署线上。

### 2026-10-07 左侧研究入口精修、两项特色任务与用户纠正

- 左侧提问/导入动作移到能力入口之前；提问为绿色主按钮，能力卡片减为透明轻量入口，桌面内容宽度收敛到 680px，手机保留 44px 触控尺寸。用户明确认可此左侧方向，并两次澄清不应回撤；纠正此前误解后已恢复左侧新版。
- 追加“研究问题拆解”“文献综述”及五语言文案，复用既有 Academic 对话与 store 提示词。特色任务取消此前 core/plugin/workflow 选择，提问聚焦不再清空草稿；无新增接口、依赖或第二套状态。
- 初始右栏紧凑样式被用户否定，已恢复原有卡片尺寸、图标、单列排布和间距；既有三个入口顺序保持，两项新增任务追加在后。启动骨架同步当前左右结构，不更换学术绿配色。
- 本轮审批与本地工具恢复实际执行；撤回右栏紧凑方案前，16 项隔离回归中 15 项通过、1 项因 1024×768 配置区溢出失败。通过项含证据持久化、账号/记录隔离、失败重试、代表性套餐权限、历史来源/附件/推理、资料请求、手机权限、输入展开、游客语言/主题与五项特色任务；没有记录为完整通过。
- 左侧重新保留、右栏恢复后，四组最新隔离尺寸复核（1440×900、1280×600、390×844、320×740）均无横向溢出且发送可见。右栏配置区仍有桌面 76px、矮屏 152px 内部滚动，免滚动要求未完成，最终目标保持未完成。
- 最终类型检查、研究契约、生产构建和差异检查通过。9003、9520 首页与 38000 健康接口 HTTP 200，Academic ready；开发服务继续运行。全程只用合成账号和资料，不读取真实登录态或浏览器存储，不安装依赖或写入线上。
- 保留当前四张安全复核截图和脱敏验收摘要；清理本轮临时脚本、中间截图、构建日志与运行器产物。长期规则无变化，AGENTS.md 不改；35 项累计改动与 5 个未跟踪业务文件继续保留。

### 2026-10-07 保留左侧新版并协调右栏空间

- 按用户再次确认保留已认可的左侧新版，右侧保留浅学术绿与原有白色单列特色卡片。五个特色功能全部露出，未采用被否定的两列紧凑卡片，也未撤回左侧。
- 桌面空首页设置默认收起、按需展开，能力选择自动展开；本组件仅维护局部展示状态，选择仍由既有 store 管理。手机、抽屉和已有研究结果默认展开；权限提示独立保留。修正高级设置在整体收起后的按钮文案与 aria-expanded 状态，重新点击可直接展开高级内容。
- 桌面发送工具栏保持一行，短占位提示只在桌面空首页使用；矮屏说明采用单行省略且保留完整 title，卡片尺寸与原有图标/圆角保持。骨架同步折叠设置与发送高度，不改主题、认证、权限、上传、计费或 Academic 执行合同。
- 17 项全拦截合成回归全部通过，覆盖证据持久化/隔离/失败恢复、五种代表性套餐权限、来源/附件/推理、资料请求、手机权限、输入展开、游客语言与主题、草稿、五个特色任务和设置状态。高级设置整体收起后的补充回归1项通过。11组布局覆盖中英文、明暗、桌面/笔记本/600px矮屏/平板及320/390px手机；默认桌面空首页配置无滚动，发送可见，无横向溢出，触控目标至少44px。用户主动展开高级内容仍可在配置区滚动，发送区独立可见。
- 最新类型检查、生产构建、研究契约、测试语法与差异检查通过；设置与输入组件设计扫描无报告。三个本地服务HTTP200，Academic ready，服务继续运行；所有API拦截且只用合成账号/资料，不读浏览器存储，不把结果等同于真实模型/来源/计费或全部后端权限审计。
- 同步当前状态与确认事实，长期规则无变化。清理本轮运行器产物、失败上下文、中间溢出截图、被替代的当前截图和构建日志，保留最新四张安全截图/摘要、既有有参考价值的证据、正式构建与固定Chromium。35项累计混合改动及5个未跟踪业务文件保留，未提交、丢弃或上线。整体审美仍由用户确认。

### 2026-10-07 左右入口视觉统一

- 用户指出左侧非卡片而右侧卡片造成割裂；保持左侧代码不动，仅将右侧五个特色功能改为透明单列入口，去掉白色背景与图标底块，统一24px图标容器、16px图形和13px/500标题字重，悬停与键盘焦点显示同系轻高亮。学术绿、所有功能、说明及既有点击链路保留，手机共享同一入口风格，启动骨架同步。
- 当前样式11组隔离布局回归通过，覆盖中英文、明暗、桌面/笔记本/矮屏/平板和320/390px手机，发送可见、无横向溢出，默认桌面配置无内部滚动。类型检查、生产构建、差异检查和目标组件设计扫描通过；本轮只改CSS展示，无新API、依赖、业务状态或线上操作。此前17项业务隔离回归为上一轮结果，未冒充本轮重新执行。
- 最新四张合成截图覆盖更新，列表测试结果目录与构建日志清理。长期规则无变化，AGENTS.md不改；35项累计变更含5个未跟踪业务文件继续保留，最终审美由用户确认。

### 2026-10-07 本地测试账号落库与语言标识简化

- 按用户明确写库授权，在确认数据库和Redis均为本地后，事务更新既有唯一激活super测试账号的bcrypt密码哈希，未删除或新增其他用户、改额度或业务配置。通过9003的真实登录接口登录成功，登录后身份接口确认super，数据库哈希再次核验通过。准备的失败恢复未触发；临时登录会话成功退出，密码/hash/token只在内存处理，未写入文档、日志输出或临时文件。
- 删除语言按钮小地球SVG与对应无用样式；手机不再隐藏语言简称，桌面保留简称和下拉指示，手机保持44px点击范围。既有游客语言回归补充标识可见、SVG缺失与五种简称断言；桌面和手机五语言切换、主题切换与研究登录门槛全部通过。最新类型检查、生产构建、差异检查通过，未改变语言状态或API。
- 同步状态与确认事实，长期规则无变化，AGENTS.md不改。清理语言验证结果目录与构建日志，未安装新依赖或部署线上；35项累计混合改动含5个未跟踪业务文件保留。

### 2026-10-07 左侧特色任务与右侧常用能力分工

- 按用户明确要求将特色功能移到左侧提问/导入动作下方，保留标题、主次按钮和透明入口视觉；桌面六项特色任务两列展示，右侧浅学术绿操作区展示常用能力和任务设置。手机按特色任务、常用能力顺序纵向展示，发送区保持可用。未登录首页同样展示功能，使用动作仍经既有登录门槛。
- 新增“研究方案设计”及五语言标题、说明和提示，要求资料不足先提问，规划方法、样本/材料、分析验证、风险及进度，禁止编造数据、实验结果或文献。六项任务复用既有Academic默认对话和store提示，不新增API、业务状态或后端功能。
- 原样抽取ResearchStart的能力排序、权限过滤、游客展示、选择与聚焦逻辑到ResearchCapabilities，桌面右栏和手机主区复用单一实现；现有权限工具面板和结果展示不变。清理移动后无用右栏特色样式，并去掉三项文献综述重复语言键，保留原先生效值。启动骨架同步左右入口数量与密度。
- 18项完整隔离回归全部通过，覆盖既有证据/记录/权限/资料/手机/游客路径及六个特色任务、设置保留、未登录左右归属；11组布局覆盖中英文、明暗、1440/1280/1024/768/390/320px，发送可见、无横向溢出，默认桌面配置无内部滚动。当前桌面/600px矮屏/手机截图批量复核。类型检查、生产构建、研究契约、测试语法、五语言JSON、差异检查及组件设计扫描通过；不将合成结果等同于真实模型/来源/计费验证。
- 同步状态与确认事实，长期规则无变化。清理本轮测试结果目录与构建日志，保留最新安全截图/摘要、正式构建和开发服务；未安装依赖、修改数据库或上线。36项累计改动含6个未跟踪业务文件继续保留，整体审美待用户确认。


### 2026-10-07 入口对齐与悬停精修

- 按用户要求删除左侧“特色功能”可见标题，保留无障碍分类；特色任务和常用能力取消横向内容缩进、图标向左对齐，默认入口起点与各自上方标题一致。启动骨架同步默认对齐。
- 只读查看用户指定的学术GPT公开参考页，借鉴轻量图标和紧凑入口，保留Lens既有学术绿、纸白、左右布局及全部能力。左右入口用独立背景层承载悬停/焦点/选中高亮，两侧8px留白；去掉悬停边框和按下缩放/位移，保留只在精确指针悬停出现的箭头。右栏配置容器补足高亮绘制空间，原内容位置保持。
- 最新1项隔离回归覆盖11组中英文/明暗/桌面/矮屏/平板/手机全部通过，新增对齐、悬停不位移及真实Tab焦点检查；发送可见、无横向溢出、默认桌面配置无内部滚动、核心点击范围至少44px。验证初次直接focus无法代表键盘焦点，另一次手机hover自动滚动改变坐标，两处测试方法已分别改为真实Tab与先滚入可视区后比较。产品代码没有因此增加焦点或滚动补丁。
- Vue类型检查、生产构建、研究契约、测试语法和差异检查通过；已批量查看当前桌面/手机/左右悬停/深色安全截图。18项完整业务回归仍为上一轮确认事实，不作为本轮重新执行结果。9003前端HTML请求、9520首页、38000健康接口HTTP200；未修改数据库、认证、权限、Academic请求或线上状态，未下载新依赖。
- 状态与确认事实同步，长期规则无变化。清理本轮及被中断轮次的临时结果目录、失败上下文和构建日志，保留当前有效安全截图/摘要；临时参考页关闭，隔离Chromium进程数0，固定运行时保留。36项累计混合改动含6个未跟踪业务文件继续保留，整体审美由用户确认。

### 2026-10-07 左侧直接输入、紧凑能力配置与全界面审计

- 按用户确认将研究输入迁入左侧主区：首页标题/资料导入、输入、六个任务形成连续主路径；进入结果后仍在左侧正文下方输入。ResearchComposer 保持单一实例，以 Teleport 切换宿主，修复初次挂载目标尚未就绪的问题；启动骨架和契约检查同步，原草稿、附件、发送与流式状态沿用。
- 按用户补充意见将右栏宽度收至 304–320px，标题改为“能力设置”，移除并列“更多设置”；互斥的基础能力与工具合为一个按类别分组的“研究能力”选择器，默认学术对话。补充要求按需展开，单选适配复用原 store setter，不新增请求或权限真相源；输入与配置焦点层级减轻，保持键盘可见提示。
- 全面审计登录、账户、设置、记录、资料、证据、会员和付款：统一原生 dialog 与最小生命周期钩子，修复游客拦截后焦点恢复、研究记录菜单冒泡/重命名误选、退出取消拒绝处理和手机确认尺寸；滑块验证置于原生内层 dialog，补齐键盘操作、尺寸适配与卸载清理，判定算法保持。公共确认调用方及滑块调用方已枚举，相关主路径和取消/失败行为回归。
- 登录/账户/会员/付款补齐五语言、标签、autocomplete、触控尺寸、深色语义色和小屏重排，清除相关原始响应/异常输出；验证码改为复用现有倒计时，卸载清理计时器；套餐加载、失败重试、空套餐分别呈现。账户、价格、支付参数及协议同意合同未改；补齐五个本地缺失图标，保留共享图标解析器。
- 最新 22 项全拦截合成回归全部通过（4.3 分钟）；补充 1 项设置展开/输入焦点截图回归通过。涵盖 11 组响应式变体、证据/记录隔离和持久化、代表性权限、资料请求、手机/游客、六项任务、单选配置、原生弹窗焦点/Escape/嵌套确认、验证码倒计时及五语言账户/会员/付款、套餐失败恢复。最新桌面/矮屏/手机/深色、设置、付款、记录及展开配置截图已批量查看；不把合成结果等同于真实模型、联网来源、到账和全部后端权限验证。
- 类型检查、生产构建、研究契约、五语言结构、测试语法和差异检查通过。新增补充截图测试首次受沙箱运行预检及依赖路径限制未执行；使用已安装依赖与获准本地浏览器执行后通过，未安装软件或绕过站点验证。三个本地服务 HTTP 200，开发服务继续运行。
- 用户指定 ChatGPT 参考后读取其公开结构；公开 Chromium 页面遇站点验证，未取得像素尺寸、不绕过验证，不声称 1:1 测量完成。借鉴输入优先和低频配置按需展开，保留 Lens 学术绿与研究工作台分工。
- 状态覆盖同步、历史追加事实，AGENTS.md 已同步用户确认的输入/配置长期边界。清理本轮临时结果、失败上下文与构建日志，隔离浏览器关闭、固定 Chromium 进程数为 0，安全截图/摘要、业务源码、正式构建及固定运行时保留。50 项累计混合改动含 7 个未跟踪业务文件继续保留，未提交、丢弃、改库或上线。

### 2026-10-07 登录与聊天右栏能力保留、学术绿控件精修

- 用户指出登录后能力消失；确认 ResearchCapabilities 被“无聊天消息”条件隐藏，登录空首页 CapabilityPanel 又默认折叠。工作台移除常用能力的消息条件，登录后配置默认展开，游客保留登录边界；聊天、刷新与手机配置复用现有 store，不复制能力或请求。
- 保留左侧单一输入、六项任务、304–320px 学术绿右栏；补充要求入口采用同系绿色文字及展开指示，顶部与输入工具统一轻学术绿悬停，按钮字重/边框减轻。配置区辅助文案/placeholder 对比度补齐并明确禁用态，键盘焦点和 44px 点击范围保留，没有整体换色或增加依赖。
- 本轮 11 项受影响路径隔离回归通过：5 种套餐权限、历史证据/刷新、资料请求、游客语言/主题与登录门槛、六任务链路、11 组响应式、登录/发送/聊天中选择/刷新/矮屏/手机配置。新增聊天回归验证常用入口数量不减少、研究能力和补充入口可见、继续发送使用现有 basic/core_function 合同、手机选项及补充文本保留。中间请求断言误写 core 与重复打开已显示的手机面板，均修正为既有合同/实际状态后通过；未以失败结果宣称通过。
- 最新类型检查、生产构建、研究契约、测试语法和差异检查通过；批量查看桌面、矮屏、手机、深色及聊天侧栏/手机配置合成截图，发送可见、无横向溢出，默认桌面配置无内部滚动。三个本地服务 HTTP 200，保留运行；不将本轮合成验证等同于真实模型、联网来源或计费准确性，也不冒充重新执行上一轮完整 22 项。
- AGENTS.md 同步登录/聊天功能长期可见规则，STATUS.md 覆盖当前快照。清理本轮临时结果、失败上下文和构建日志，隔离浏览器关闭，固定 Chromium 进程数为 0；业务文件、正式构建与安全证据保留。50 项累计混合改动含 7 个未跟踪业务文件未提交或丢弃；无改库、安装或线上操作。

### 2026-10-07 底部导航、更多功能与输入旁补充要求

- 按用户要求移除顶部操作条，将品牌、研究记录、主题、语言、账户及手机功能入口移至底部工具栏；底栏独立占位并支持安全区，语言菜单改向上展开。沿用现有入口、认证与弹窗，不增加菜单状态；启动骨架同步。
- 五语言将“能力设置”改“更多功能”，移除可见“研究能力”标签，保留无障碍名称。右侧常用功能与选择器继续在登录/聊天/刷新后展示，低频工具分类按需展开；补充参数不再留在右栏。
- 新增独立 ResearchInstructions 业务组件置于输入框旁，复用原 academicPluginArgs/store setter；300 字限制和原清洗逻辑由旧面板原样迁移，无第二套状态/API。只有实际支持 advancedArgs 的工具启用独立输入，其他模式提示将要求写进问题；移除旧参数 props、计算属性和 textarea 样式。单一 ResearchComposer 在不同宿主移动时保留补充状态。
- 本轮 10 项不同的相关隔离测试通过：游客五语言/主题、11 组响应式、登录/聊天/刷新/手机与实际补充参数请求、5 种权限、历史来源证据/刷新、登录/记录/账户/嵌套确认键盘路径。原请求 basic/core_function 保持，补充内容以 plugin_kwargs.user_prompt 提交，无旧聊天/编排请求或未拦截外部请求。
- 首批 3 项通过；第二批 8 项中 7 项通过、英文 600px 矮屏任务溢出 1 项失败。保留完整文案与触控尺寸，收紧矮屏输入/标题/任务留白后该项的 11 组变体通过，新增桌面全部任务和发送位于底栏上方的断言。批量视觉检查与最后矮屏/手机确认完成，不把中间失败或历史完整 22 项当作本轮完整通过。
- 最新类型检查、生产构建、研究契约、测试语法、五语言键一致性及差异检查通过；三个本地服务 HTTP 200，保留运行。真实模型/来源/计费未在本轮验证，不声称 ChatGPT 像素复刻或绝对完美。
- 三件套同步用户新的长期布局规则和确认事实；临时结果、失败上下文与构建日志清理，固定 Chromium 进程数为 0，运行时、正式构建、业务源码及安全证据保留。51 项累计混合改动含 8 个未跟踪业务文件未提交/丢弃；无改库、安装或线上操作。

### 2026-10-07 聊天右栏滚动功能与特色任务，删除重复补充输入

- 用户明确本次针对聊天右侧，首页不用改。聊天“更多功能”改成紧凑滚动按钮列表，基础能力与函数工具直接合并展示，取消该状态下的下拉及工具分类筛选、重复常用能力区；下方“特色功能”复用六项任务。手机同一配置与任务入口，任务选择关闭面板并聚焦主输入。首页原入口与配置保留。
- 删除独立 ResearchInstructions 的实例、导入及废弃组件，补充要求直接从主输入提交；原 store 和后端字段保留兼容，未清理历史数据。列表复用既有互斥 setter、权限、名称和禁用工具过滤，无新请求、依赖或第二套状态。
- 本轮10项不同的隔离回归通过，覆盖五套餐权限在首页/聊天一致、历史证据/来源刷新、手机布局、游客首页、长功能列表滚动/跨分类/禁用工具/聊天刷新/手机任务/主输入请求，以及11组首页响应式。首批7项通过、2项旧测试适配失败；更新下拉选择器和自动打开面板判断后，另发现关闭按钮仍匹配旧名称，修正通过。一次批量截图检查后修复手机高亮圆角裁切，最后两项相关确认通过。新补充内容在main_input中，basic/core_function与plugin/plugin_name保持，无旧聊天/编排请求。
- 最新类型检查、生产构建、研究契约、测试语法和差异检查通过；桌面/手机/深色聊天截图确认，9003/9520/38000本地服务HTTP200并保留运行。仅合成数据全拦截，不冒充真实模型/来源/计费验收或本轮完整22项。
- 用户随后指出底部菜单只是机械移动、首页左右分区不合理。已提出首页统一研究起点、聊天保留功能区、导航融入相关区域的方向并询问具体布局；尚未收到该选择答复，首页结构和底栏本轮未改，整体设计目标未完成。
- 三件套同步新长期要求与已确认事实；清理四个本轮结果目录、失败上下文和构建日志，固定Chromium进程数0。保留业务源码/正式构建/安全证据/固定运行时，50项累计混合改动含7个未跟踪业务文件未提交或丢弃；无改库、安装、部署或服务重启。


### 2026-10-07 取消底栏、主题与语言上移、对话编辑统一

- 按用户最新要求取消整条底部菜单。桌面导航融入右栏：品牌在上方左侧、明暗模式在语言左侧且位于上方右侧，研究记录与账户在下方。手机和平板使用顶部导航，主题同样在语言左侧；语言菜单向下展开。复用既有入口与状态，启动骨架同步。
- 只读参考YutoGPT现有手机页头与内容/账户分工，未修改该项目。首次三件套工具输出范围过大、含无关内部状态，已停止全文展开及内容复制，未读取凭据文件、未执行外部传输；仅记录脱敏事实，工具历史不能用项目文件清理撤销。
- 左侧提问浅学术绿、回答透明纸面、编辑框语义表面统一，正文和表格明暗模式沿用既有变量。编辑取消/修改取消图标，视觉36px、点击44px、统一圆角与焦点；工具栏尺寸与颜色同步，不改编辑覆盖、历史截断、API或权限。矮屏聊天六任务两列，保留首页和聊天功能分工。
- 最新9项相关隔离回归通过（2.4分钟）：证据保存/取消/刷新与账号隔离、登录手机布局、游客语言/主题/门槛、11组布局、聊天滚动功能及请求、游客历史、四组多端明暗编辑取消/保存截断/重新生成/刷新、登录/记录/账户/嵌套确认。新增主题在语言左且同高、导航上下归属、无底栏断言；编辑取消无请求、保存覆盖参数保持。全拦截合成数据，无未拦截外部请求。
- 类型检查、生产构建、研究契约、测试语法、差异检查通过；查看最新桌面/手机/深色和编辑截图。三个本地服务最终HTTP200并保留运行；一次前端状态检查未成功，随后两种主机请求200且监听正常，无重启。未改库、安装、部署或提交，不将合成结果等同真实模型/来源/计费、全后端审计或绝对完美。
- 同步最新导航长期规则与当前快照；清理本轮三个临时测试目录和构建日志，关闭隔离浏览器，保留固定运行时、正式构建与安全证据。50项累计混合改动含7个未跟踪业务文件保留，历史大组件债务及真实链路验证仍未完成。


### 2026-10-08 控件、设置、手机输入与游客特色入口统一

- 研究记录入口悬停范围收至实际按钮，主题图标悬停保持透明边框；多语言与模型菜单统一纸面背景、圆角、轻阴影和学术绿选中态。模型与资料入口减轻边框，游客点击不再强制伪造键盘焦点；登录输入、验证码和全局表单去除紫色焦点，沿用语义学术绿与可见键盘提示。
- 登录协议勾选改为44px点击容器内居中16px原生控件，协议链接保持触控尺寸并在同一行中心对齐；账户和会员勾选复用同一原生样式。设置页改为紧凑导航与内容区，手机改为顶部横向标签和独立内容滚动；账户概览去除重复卡片，研究记录改轻量列表。原认证、账户、记录增删改、套餐和确认合同保留。
- 首页配置标题为“特色功能”，聊天仍为“更多功能”。游客首页默认展示PDF深度理解、PDF批量总结和Word批量总结三个公开入口，复用既有目录和五语言名称，逐项点击仍要求登录，不设置权限或发起研究请求；左侧六项任务保留。登录后的完整能力选择与聊天扁平列表不变。
- 首轮24项隔离回归23通过、1项新控件检查失败；集中修复登录局部边框与手机长占位裁切，六项确认中五项通过。失败色值取在160ms过渡初帧，测试改等待稳定后单项通过；菜单截图改等待淡入稳定，单项再次通过。24项不同路径均有通过证据，不作为最后单轮全通过。随后三个公开入口与受影响路径六项回归全部通过（1.8分钟），覆盖逐项登录门槛、桌面/矮屏、11组布局、手机模型/能力分工及聊天请求。
- 类型检查、生产构建、研究契约、测试语法及差异检查通过。全拦截合成API与新浏览器上下文，不读取真实浏览器隐私；仅只读参考YutoGPT必要界面源码，未修改该项目。无改库、安装、部署或提交，不将合成结果等同真实模型、联网来源、计费验证或绝对无瑕疵。

### 2026-10-08 手机模型入口按用户澄清迁入顶部菜单

- 用户澄清“上面”指手机顶部菜单，不是输入框上沿。模型选择移入WorkbenchHeader的紧凑顶部导航；手机/平板输入区不再显示重复模型，桌面保持原输入工具栏模型入口。手机配置从输入下方当前能力按钮进入，取消顶部重复配置按钮；平板仍有顶部配置入口。沿用同一模型组件、会话配置和切换请求，无新模型状态或API。
- 顶部模型按钮按剩余宽度截断，菜单在小屏限制宽度，保留完整名称与无障碍标签；明暗模式仍在语言左侧，记录、Logo和账户保留。输入组件的紧凑布局prop更名以准确表达其职责，唯一生产调用同步。
- 最新六项受影响路径隔离回归全部通过（2.7分钟），覆盖手机权限/发送、游客五语言/主题、六任务草稿与Academic链路、11组布局、聊天滚动能力和资料要求、四组明暗/协议/焦点/顶部模型选择。批量查看320px深色与390px模型菜单截图，顶部菜单、输入下方能力和菜单边界正常；实际模型服务质量仍不在本轮范围。
- 最新类型检查、构建、研究契约、测试语法与差异检查通过。9003首次状态检查未成功，随后127.0.0.1与localhost均HTTP200；9520和38000 HTTP200，服务保留运行、未重启。

- 最终游客特色入口与统一控件两项确认通过（39秒），验证顶部模型唯一、输入无重复模型和三个入口默认可见，更新安全截图与摘要。清理本轮7个临时测试结果目录和构建日志；51项累计改动含7个未跟踪业务文件保留，未提交或丢弃。
- 最终固定Chromium运行时进程数为0，固定本体永久保留。


### 2026-10-08 特色任务替换、侧栏分类搜索与桌面轻控件

- 用户指出旧PDF/Word入口并非特色。新增研究设计体检、审稿意见应答、文献检索策略三个特色任务及五语言名称、说明、任务提示，要求资料不足先提问、不得编造证据或声称未执行的工作已完成。游客点击沿用登录门槛；登录首页和聊天侧栏复用同一任务目录、ResearchShortcuts与Academic默认对话请求，左侧原六项任务保持，无新API、业务状态或依赖。
- 侧栏能力与特色任务去除名称前装饰图标，文字起点与标题一致，特色功能和更多功能标题共用左边线；悬停背景左右8px留白，箭头沿用仅悬停显示规则，不推动文字。登录首页把重复常用能力集中到更多功能，特色任务直接露出，避免矮屏滚动；游客仍公开显示常用能力。
- 登录更多功能增加全部/学术/编程分类下拉和按需展开搜索。分类依据既有能力名称/分组，搜索匹配显示名称与原选择值；现有权限过滤及互斥setter保持真相源。搜索清空/关闭恢复列表，Esc返回搜索按钮，无结果显示短提示；首页完整选择器与原高级配置保留兼容，聊天仍为可滚动列表。分类开关按共用DropdownMenu合同绑定，不修改公共菜单实现。
- 桌面模型文字与输入文字左对齐，模型与资料入口悬停保持透明，模型下拉/资料上传回调不变。复制、删除、编辑图形缩至16px，点击范围44px。手机顶部模型菜单和输入下方能力入口保持。
- 批量查看桌面/手机/深色、游客入口、悬停、分类及聊天截图。中间发现追加重复区块导致矮屏滚动、分类菜单缺少v-model，均修复；测试同步取消的旧入口定位、Academic默认function=chat合同，并恢复原六项任务误扩展的匹配断言。最终11项批次10通过、一项请求合同预期失败；后续三项中新交互与历史证据两项通过，原六任务经定位/断言修正后单项通过（47.6秒）。本轮13项不同受影响路径均有通过证据，不冒充最新单轮13项全通过。
- 覆盖五套餐权限、11组布局、游客逐项登录、协议/焦点/手机模型、分类搜索保持选择、桌面对齐/透明悬停/图形尺寸、新三任务请求、历史来源证据和原六任务草稿与发送。仅全拦截合成API和新上下文，不读取真实浏览器隐私；不等同真实模型、来源或计费验收。
- 最新类型检查、构建、研究契约、五语言键、测试语法与差异检查通过；9003/9520/38000本地服务HTTP200并保留运行。更新长期视觉/布局规则和源码/夹具最小输出安全要求，未改库、安装、部署、提交或丢弃累计业务改动。
- 最终稳定分类菜单与搜索截图确认单项通过（26.7秒），截图已批量检查。清理本轮8个临时结果目录和构建日志，固定Chromium运行时进程数0，固定本体保留；51项累计改动含7个未跟踪业务文件未提交或丢弃。


### 2026-10-08 语言/功能分类菜单配色及新对话右栏统一

- 语言与更多功能分类菜单从纸白改为侧栏语义表面色，浅灰绿/深绿灰随主题，边线减弱；共享menu-items-academic样式仅两个入口显式使用。保留选中、悬停、圆角、阴影和公共菜单行为，两项隔离回归通过（59.7秒），浅色/深色截图确认。
- 用户指出登录新对话的特色功能在上、更多功能在下且重现旧工具分类。确认空会话仍走旧选择器分支。登录空会话与已有消息、手机面板统一为上方更多功能列表、下方特色功能；移除旧能力下拉/工具分类模板、分组状态、无用props与样式，三个生产调用同步。筛选/搜索仅影响展示，原权限过滤、互斥setter、请求和特色任务保持，游客落地页与左侧结构保留。
- 首批六项隔离回归五项通过，一项新增标题预期误写英文文案；修正后又发现分类预期误写英文名称，测试改用既有语言键。最终七项回归全部通过（1.3分钟），本轮十二项不同受影响路径均有通过证据，不作为单轮十二项通过。覆盖五权限、原六任务、资料请求、游客入口、分类搜索、十一组布局、空会话刷新/发送与聊天/手机面板。批量查看桌面/矮屏/手机/深色和空会话截图。
- 类型检查、生产构建、研究契约和差异检查通过。研究契约删去废弃infoLabel传递断言，增加禁止旧列表分支/分组控件的布尔断言；异常输出改为本地临时日志再只报告状态。本轮仅合成验证，不等同真实模型、联网来源或计费验收；无安装、改库、外部上传或上线。
- AGENTS.md同步用户确认的登录新对话布局规则，STATUS.md覆盖当前快照，安全摘要追加当前证据且保留上轮记录。清理四个临时测试结果目录和三份日志，固定Chromium进程数0，固定本体、正式构建、业务源码与有效安全截图保留。51项累计改动含7个未跟踪业务文件未提交或丢弃。


### 2026-10-08 工作台全部搜索框统一

- 审核用户端Vue搜索输入，当前实际搜索框为功能搜索与研究记录搜索。新增局部共享ResearchSearchField统一语义淡灰绿背景、12px圆角、16px搜索/清空图形和单层细绿聚焦边，手机输入16px、清空点击44px。空内容隐藏清空按钮但保留位置，有内容清空后焦点留在输入；五语言添加清空搜索标签，沿用既有图标，无新依赖。
- 两处调用沿用原searchQuery/keyword与过滤真相源，原生输入属性和Escape事件转发到输入；不复制业务状态、权限、请求或资料处理。记录搜索入口迁至标题旁，在无结果时仍可见；Escape关闭搜索并恢复按钮焦点，记录弹窗保留。同步唯一旧列表入口，删除废弃props/事件、样式和未使用图标import。
- 扩展已有两项合成回归验证过滤/无结果、清空恢复列表、焦点与输入宽度稳定、Escape入口恢复和原记录重命名/弹窗/Academic发送；首次两项通过（54.8秒）。截图发现双层聚焦线，移除外圈后最终两项通过（53.1秒），覆盖桌面/矮屏/手机与明暗模式，批量截图复核。最后仅校准辅助文字色，按语义token计算浅色对比度4.84、深色8.10，最终构建通过，未追加浏览器轮次或声称截图已采样最后色值。
- 初次类型检查发现废弃SvgIcon import，删除后最终类型检查通过；生产构建、研究契约、五语言搜索键/JSON和差异检查通过。全部全拦截合成数据，不读取真实浏览器隐私；本轮未重跑上轮完整业务回归，不等同真实模型、来源或计费验证，无改库、安装、部署或提交。
- STATUS.md覆盖搜索框当前快照，CHANGELOG追加事实，AGENTS长期规则已复核且无变化。清理两份临时结果目录及两份日志，测试上下文关闭，固定Chromium进程数0，运行时本体、安全截图、摘要、正式构建与业务源码保留。52项累计改动含8个未跟踪业务文件未提交或丢弃。


### 2026-10-08 登录细节与游客桌面窄栏

- 用户指出协议换行、登录聚焦外圈及关闭按钮背景过重。协议链接/连接词改为同一行flex，320px字号适配，勾选同意、44px点击目标与协议原地址/入口保持。登录聚焦只保留语义细绿边，关闭及协议弹窗关闭去掉通用按钮类，16px图形/44px点击、悬停仅变文字色，无背景或缩放；手机输入16px并修正width class冲突，弹窗恢复两侧留白。认证、验证码、同意条件与API不改。
- 按用户最新要求，游客桌面右栏默认64px窄栏，可鼠标/键盘无登录展开/收起；复用现有Header、主题、语言、记录和账户，左侧六任务和输入保留，点击研究能力仍需登录。登录后自动显示完整功能栏，手机顶部导航保持。展开偏好为局部ref，认证变化重置，不读取或写入浏览器隐私存储；游客点击捕获只新增侧栏开关白名单，未扩大研究权限。启动骨架同步窄栏。
- 只读查看ChatGPT公开页面结构作为参考，未访问真实账号或取得登录像素尺寸，不声称1:1测量完成。首批六项回归五通过，一项发现窄栏语言菜单被裁切/遮挡，修正折叠栏overflow与层级；批量截图后补齐窄栏图标居中与手机弹窗留白。
- 最终三项确认两通过（52.9秒），一项新增五语言测试在弹窗渲染前读取链接失败；补可见与数量等待后单项通过（15秒）。六项不同受影响路径均有通过证据，不作为单轮六项全通过。覆盖桌面默认窄栏/键盘切换、三特色入口门槛、登录转换、五语言协议1440/390/320px同排及边界、语言菜单点击、登录细边/透明关闭、11组登录布局、手机顶部模型及Academic发送、记录/搜索/账户/嵌套确认。批量复核最终默认/展开和多端明暗登录合成截图。
- 类型检查、最终生产构建、研究契约、五语言JSON/开关标签与差异检查通过；仅全拦截合成数据，不读取真实浏览器隐私，不冒充模型、来源或计费验收，无安装、改库、部署、提交或丢弃业务改动。
- AGENTS同步用户新的游客桌面可折叠边界，STATUS覆盖快照，安全摘要追加证据。清理三份临时结果目录与两份日志，固定Chromium进程数0，固定本体、安全截图/摘要、正式构建、开发服务与业务源码保留。52项累计改动含8个未跟踪业务文件未提交或丢弃。


## 2026-10-08 — 线上维护公告与停服

- 用户明确授权后，仅对线上 Lens 执行停服与公告切换；保留应用源码、数据库和用户资料。
- 公告：10月10日正式上线，2023年永久用户原有永久、无限使用权益继续保留。
- 已独立复核首页、登录入口、API 入口均返回 503 公告且禁止缓存；Lens 应用停止、端口关闭、文件监视禁用、开机恢复项移除。
- 其他站点配置与业务监听保持不变；一份私有回滚备份已通过内容完整性校验。
- 本地开发服务未改动；没有设置未来自动恢复任务。


### 2026-10-08 游客与登录侧栏字体和排版统一

- 用户指出游客与登录侧栏排版不同。游客常规标题统一为更多功能，ResearchCapabilities新增显式sidebar展示变体，仅桌面游客启用；标题14px/600/20px、字距与左边线统一，常规名称13px/400、特色名称13px/500，同角色登录前后相同。游客常规列表改为44px单列、零行间距与同样有界滚动，矮屏不再切为另一套双列；特色任务仍复用同一组件。公共标题仅调整行高/字距，左侧六任务、默认窄栏、手机顶部导航、学术绿及登录/权限/Academic链路保留。
- 四项隔离回归全部通过（1.8分钟）。新增在1440×900、1280×600、1024×768登录前后比较计算字体、行尺寸、对齐、常规行距与特色列数，保留游客开关/键盘、三任务门槛及登录转换验证；相关测试还覆盖11组响应式/明暗布局、手机模型/能力分工、协议/聚焦及Academic发送。批量查看安全桌面、矮屏、手机与深色截图，未宣称套餐可用能力与游客预览数量相同。
- 类型检查、生产构建、研究契约、差异检查通过。仅全拦截合成API与新浏览器上下文，不读取真实隐私；未改库、安装、部署、提交或重启服务，不等同真实模型/联网来源/计费验收。三件套按职责更新，52项累计混合改动含8个未跟踪业务文件保留；清理本轮一份临时结果目录与两份日志，业务源码/正式构建/安全证据/固定运行时保留。
- 最终安全清理检查：固定Chromium运行时进程数0，本轮临时结果目录/日志无残留；运行时本体永久保留。

### 2026-10-08 — 维护公告品牌标题

- 根据用户要求，将线上维护公告顶部小标题从 Lens 改为 YutoAI；源站与公网显示均已复核，维护响应与应用停止状态保持不变。


### 2026-10-08 协议文字居中及个人设置去分隔线

- 用户指出协议文字相对登录按钮偏右。原实现居中的是勾选点击区加文字整组；改为左右对称44px网格轨道，协议文字自身与提交按钮中线一致。密码/验证码登录共用样式，勾选点击区、单行协议、协议原入口及同意状态保留，没有认证变更。
- 用户追加个人设置横线过多。个人信息/账户安全分组去掉分隔线和重复上内距，继续用28px间距区分；修改密码、手机绑定、实名认证、微信绑定标题去掉横线，输入和账户业务行为保持。
- 协议相关两项回归通过（50.9秒），五语言、1440/390/320px、两种登录方式的文字/按钮中心差不超过1px，同排、44px点击、边界及勾选切换通过；既有手机模型/能力分工、明暗聚焦、登录门槛与Academic发送通过。个人设置相关一项首次通过（30.2秒），验证无分隔线/间距、密码页进入返回及记录/搜索/账户/退出确认；320px截图处于淡入初帧，测试增加等待opacity=1后复核，产品无需额外修补。
- 类型检查、最新构建、研究契约及差异检查通过；仅全拦截合成API与新浏览器上下文，无真实隐私读取、改库、安装、部署、提交或服务重启。AGENTS既有一致性/安全规则已复核，无新长期规则，不改动。
- 个人设置最终确认通过（29.5秒），稳定320px深色截图及桌面/手机密码页已复核。清理本轮三份临时结果目录与两份日志；52项累计混合改动含8个未跟踪业务文件保留，业务源码/正式构建/安全截图摘要/开发服务和固定运行时保留。
- 最终清理检查：固定Chromium进程数0，本轮临时材料无残留；固定运行时本体永久保留。


### 2026-10-08 使用必读与升级套餐精修

- 升级套餐去掉外层嵌套框与分隔线，缩小名称/价格、统一44px购买按钮及分段月年选择；宽桌面三列、中等桌面两列、手机单列，签到/额度用间距分组，原数据、计价、权益、付款与兑换逻辑保留。
- 实际使用必读入口改为无框阅读/对照布局，去重复标题和装饰标签，克制标题/套餐名称/辅助说明尺度，手机纵向阅读；原权益、有效期、扣费及执行边界保留。验收发现旧协议预览并非当前入口，已移除误加文档适配、恢复旧预览行为并修正测试目标。
- 初次基线夹具无套餐导致失败，补齐合成套餐后通过；期间测试入口定位错误已纠正。最终八项回归通过，覆盖五档权限、失败重试/空态、付款确认、月年切换与价格恢复、44px按钮、真实说明入口字号及桌面/手机明暗边界。批量截图后集中调整套餐名称层级与学术绿细边，再做对应视觉确认；未将早期失败冒充最终通过。
- 类型检查、构建、研究契约通过；差异检查发现尾随空白后修正。仅合成API及新上下文，无真实隐私读取、改库、安装、上线、提交或服务重启，不等同真实支付/计费/模型验收。
- 最新敏感信息与服务器信息上下文禁令、封闭schema输出规则已同步到长期规则，当前约束写入状态快照。

- 最后套餐名称层级与卡片边线修正后，相关单项视觉回归通过，最终构建通过；桌面、窄屏手机和深色合成截图确认完成。
- 本轮临时结果目录与运行日志已清理，固定共享浏览器运行时保留；隔离测试浏览器进程为零。工作树仍有累计改动，未提交或丢弃。
- 收尾报告首次摘要读取出现解析异常，随即停止直接异常输出，改为封闭状态投影；未进行外部操作或传播异常内容。

### 2026-10-08 对照参考结构重新精修设置说明与套餐页

- 阅读YutoGPT本地设置与套餐组件结构，并查阅ChatGPT官方公开套餐结构；未修改参考项目业务源码。参考组件的隔离渲染尝试未成功，未把它记为真实视觉验收。
- 使用必读的三档套餐说明改为原生可展开条目，保留原权益、有效期、扣费和任务说明；补充键盘展开/收起回归。
- 套餐页统一名称、价格、按钮和额度行，清理无效占位高度；修正截图发现的旧布局类覆盖、按钮底色丢失与额度文字挤压。样式规则在组件内集中整理，没有增加业务分支、API或依赖。
- 最终8项相关回归通过；类型检查、最终构建、研究契约检查通过。截图复核桌面、手机和深色，增加额度行对齐、按钮底色和卡片密度验证。
- 测试全程使用隔离合成数据，不读取真实账号资料，不执行真实付款。真实模型、来源和计费没有新增验收结论。
- 本轮临时参考渲染器、无效参考截图、测量文件、临时测试结果及摘要已清理；保留最终合成截图和安全摘要，测试浏览器进程为零。长期规则未改变，AGENTS仅复核。


## 2026-10-08：模型菜单、侧栏与本地真实链路收口

- 收紧模型菜单内容及外框，恢复登录后折叠入口，侧栏为 280–304px；手机顶部统一学术绿，勾选控件跟随主题。未重排已认可的左侧首页。
- 新增 UI 审计辅助模块及模型宽度/登录折叠回归；更新与新设计冲突的侧栏断言。完整隔离回归 28 项通过。
- 前端类型、研究合同及构建通过；服务单元、学术引擎合同、真实门禁合同、受控写入合同、静态发布合同通过。
- 构建与自动格式化分离，独立格式化及依赖声明保留；服务构建通过。
- 新增并注册仅限本机的真实冒烟入口：登录、新建/重命名记录、合成问题提交、回复、刷新恢复、自建记录删除均通过。不读浏览器隐私存储，不输出凭据、用户内容或完整异常。
- 初次清理脚本对已删除记录误判，已修正并独立复查；最终完整冒烟清理通过。
- 独立 CLI 真实门禁未通过，专用凭据未配置。未完成全部资料/能力、真实来源与计费验收；未执行线上部署或运维。

## 2026-10-08：对话特色任务补齐与滚动可发现性

- 对话及历史会话右侧特色任务复用两组现有配置合并为九项，首页六项任务及三个侧栏入口的布局保持不变；未新增第二套请求或状态链路。
- 新增职责单一的列表滚动组件，在更多功能和特色列表提供细原生滚动条、下缘遮罩和五语言的向下查看提示；溢出时显示，滚到底后隐藏，支持点击继续查看，并在卸载时清理观察器。
- 修复新滚动边界内旧负边距造成的文字裁切，统一游客与登录后列表几何规则；提示使用内联 SVG，修复图标回退问题。
- 历史会话和游客一致性专项回归三项通过；九项入口、末项点击、真实滚动条几何与非透明颜色、提示消失等专项回归通过。
- 最新类型检查、研究调用合同检查与前端构建通过；静态合同只增加格式空白容忍度，不放宽结构要求。
- 排查并修复格式化后多语句点击表达式的编译问题。此前未通过的全量回归未作为完成证据；最新全量结果仍待确认。
- 已清理完成的任务临时测试目录、重复安全摘要和过期合成截图；保留正式源文件、当前合成视觉证据及固定 Chromium。未部署线上、未宣称运营验收完成。

- 本节最终复核：二十九项完整隔离回归全部通过，相关十项定向回归及最新类型、调用合同和构建检查通过。修正空会话与历史会话的测试前提，保留桌面矮屏外层不滚动的布局不变量；末项完整可见时不因底部留白继续显示滚动提示。前述未通过的中间回归不作为验收通过证据。
- 完成本轮临时测试产物清理，保留正式源文件、当前合成截图和封闭验收摘要。本轮前端修复完成，全部功能与真实运营验收继续推进。

## 2026-10-08 — 登录后特色入口和真实本地验证收口

- 已确认登录后的对话侧栏显示全部 9 项现有特色入口，空首页保留原先 6/3 分布。共用能力滚动区域具备细滚动条、底部渐隐和可点击的“向下查看更多功能”提示，到底后隐藏提示；现有 Academic 调用链未新增第二套状态或 API。
- 正式隔离前端报告记录 29 项通过。新增本地测试凭据提供器，使用 macOS Security API 非交互读取专用测试凭据，仅在受控管道和进程内处理；拒绝向终端/普通文件输出凭据，默认序列化和诊断脱敏，未改动 Keychain ACL。
- 凭据、独立答案与浏览器回调序列化契约 11 项通过。真实本地登录、新建/重命名研究记录、核验独立算术答案、刷新恢复和清理本轮记录六项通过；令牌仅在进程内用于授权请求。
- 修复验收脚本 Locator.evaluate 未显式传递期望答案的闭包错误。此前由该错误造成的失败不属于已确认业务故障；旧回显标记测试也不作为模型独立答案准确性证明。
- 既有真实只读门槛通过；本地目录识别到 6 项基础能力、26 项插件和 1 项模型条目。尚未证明全部能力执行、资料、来源、计费与运营稳定性，目标继续进行。
- 本次未部署、未安装依赖、未修改生产 Academic 链路；固定共享 Chromium 保留。工作树累计改动保留，未提交或丢弃。长期规则未变化，AGENTS.md 无需修改。
- 收尾确认本轮中间摘要残留和正式研究测试进程均为零；必要审计报告保留，差异空白检查通过。

## 2026-10-08 — 真实模型写链路与验收身份兼容

- 已确认本地服务公开身份不是写验收器原先假定的数字账号 ID。修正仅涉及受控写验收工具：保留 JWT 主体与预期账号 ID 检查，并要求公开身份及专用账号名称同时绑定；生产登录、权限、前端和 Academic 执行链路未修改。
- 新增身份合同覆盖旧数字身份、公开身份绑定、错误账号、错误 JWT 主体、缺少绑定、对象转换拒绝、无效数字身份拒绝和生成失败清理。本地验收契约 23 项通过；已枚举到受控写验收器无生产调用方。
- 3 个去重配置模型均完成真实最小学术请求与声明付费预期验证，确认额度减少。每轮只创建本轮记录，删除成功后独立查询确认记录不存在；未上传或分享。该结果不证明扣费公式、计费桶、退款或全部模型回答质量。
- 更正之前模型目录统计：1 项是外层目录条目，实际识别到 3 个去重模型。基础能力目录 6 项，插件目录 26 项；基础能力有 5 项完成已知类别匹配，另 1 项类别尚待确认，未把目录匹配写成执行通过。
- 正式报告保留前轮隔离前端 29 项结果，并追加本轮受控写矩阵。长期规则未变化，AGENTS.md 保持原规则；目标继续进行。
- 收尾确认三轮自有测试记录均无残留，三份中间摘要已并入正式报告后清理；固定共享 Chromium 保留。

## 2026-10-08：六项基础能力本地语义验收

- 新增本地六项基础能力的合成输入与独立语义判据，覆盖中文/英文润色、脑图、中英互译、参考文献转 Bib、代码解读；验收合同测试增至 33 项并全部通过。
- 从受控写入验收脚本抽取四个现有协议辅助函数，生产业务接口保持不变；新增可复用的本地基础能力验收运行器，沿用既有 Academic 调用链和前端流响应归一器。
- 六项本地 HTTP 调用的关键语义检查、受控写入、额度减少、测试研究记录删除和独立查询缺失均通过；未上传资料、未分享、未修改真实用户权限。
- 四个新增验收文件的语法检查及 Git 差异空白检查通过。六项封闭字段结果并入正式验收报告；七份临时摘要汇总后清理。
- 上述事实不等于全部学术结果准确、上游提供方传输已独立核实、脑图实际渲染已通过、所有插件与资料链路已通过，或已达到运营发布条件。目标继续保持 active。

## 2026-10-08：补齐脑图真实渲染验收并发现失败

- 新增隔离脑图渲染检查，复用已安装 Mermaid 与永久保留的 Chromium；只读取本轮合成页面的封闭布尔状态，拒绝链接、HTML、回调和配置指令，禁用系统凭据库，结束后关闭本轮进程组并清理临时配置。
- 新增四项安全合同测试；本地验收合同增至 37 项并全部通过。运行器支持显式选择单项基础能力，以避免无必要重复模型写入。
- 合成基准脑图实际 SVG 渲染通过；真实本地调用生成的脑图连续三次实际渲染失败。最后一次确认模块已加载、渲染已执行、未超时；错误分类器未识别语法错误，原因仍未确认。每次测试研究记录均删除并独立查询确认缺失。
- 正式验收报告已把脑图标记为新增渲染要求未通过，保留此前文本语义通过的较窄事实；不能继续将六项文本检查描述为六项完整能力验收通过。
- 资料上传仍未执行：通用上传与研究资料处理为不同链路，有效本地代理目标与文件清理合同仍待证明。不得依据默认目标为回环地址推断实际运行目标。
- 本轮隔离浏览器专属进程和临时配置复核为零；临时审计元数据及最后一份脑图封闭字段摘要已移除，永久 Chromium 未删除、移动或替换。长期规则与生产接口未修改，目标保持 active。

## 2026-10-08：修复多根脑图渲染并回归

- 定位生成脑图的多个顶层根节点导致 Mermaid 拒绝渲染。新增小范围生产恢复函数：只在对应错误发生时合并到统一父节点，保留原节点、相对层级及原始持久化内容，最多重试一次；正常图表和其他失败继续原路径。
- 已枚举生产单一渲染调用方，保留原参数、容器及返回结果；登录、Academic 请求、权限、计费、数据库及缓存接口未修改。
- 新增八项回归覆盖多根恢复、节点层级保留、历史正常图表、注释样式、CRLF/制表符、原参数转发、非目标错误及重试失败传播。验收合同共 45 项通过，前端类型检查和构建通过。
- 隔离 Chromium 中多根脑图、正常单根脑图和流程图实际 SVG 渲染全部通过；修复后的真实本地脑图调用通过文本关键语义与实际 SVG 渲染，测试研究记录删除并独立查询确认缺失，浏览器关闭及临时配置移除。
- 发现先前检查器 strict 配置与生产 loose 配置不同，已对齐后确认多根错误仍存在，再实施修复；不把检查器配置差异本身当生产缺陷。
- 有效代理经本地配置、当前进程的最小必要代理字段及监听关联，只返回封闭布尔状态，确认当前目标为本项目本地应用；未输出环境、地址、端口、PID、路径或任何凭据原文。该结果不等于资料存储目标或上游提供方传输已验证。
- 正式报告已更新脑图修复证据。资料、插件、完整登录消息页、权限、计费失败恢复与稳定性等运营验收仍待完成，目标保持 active。临时脑图摘要汇总后删除，正式构建和验收证据保留；长期规则未变。

## 2026-10-08：确认资料入口合同及配置接口真实访问权限

- 确认研究资料通过通用 multipart 文件接口和 dir 查询参数进入上传器，由 Academic 读取接口承接后续资料访问；不能用接口所在位置推断最终存储位置。
- 配置读取接口经控制器合同定位，真实本地请求确认匿名访问拒绝、专用测试账号允许；配置正文仅在受控内存中处理根响应状态，封闭输出不含任何配置字段、值、凭据、地址或运行元数据。
- 新增准确命名的配置访问验收助手和只读 CLI 选项，认证作用域保持不变，在模型选择与研究写入前返回；本轮未上传文件、未调用模型、未创建研究记录、未修改配置、账号或权限。
- 新增五项回归覆盖 HTTP/应用层拒绝、未知响应不算允许、封闭权限投影及非本地目标阻断。验收合同共 50 项通过，三项验收脚本语法检查通过。
- 按字段名称推断存储枚举的临时实现已移除，不保留未经证明的通用推断器。实际资料存储、文件命名、上传/读取/删除和清理合同仍未验证，未将其写成完成事实；下一步从实际目录分支验证。
- 正式验收报告及 STATUS 已同步；长期规则未变，无新增浏览器进程、上传文件或临时凭据制品，正式源码与证据保留。运营验收仍未完成，目标保持 active。

## 2026-10-09 — 特色入口与滚动提示局部复核

- 现有特色组件完整模式实测渲染 9 项；桌面、暗色背景和手机尺寸的隔离组件检查通过滚动条、提示点击、末项可达、到底隐藏和横向溢出检查。
- 测试最初漏发程序滚动对应的事件，已纠正测试方式；本轮没有修改生产样式或功能代码。
- 仅记录合成组件验收，不宣称完成真实登录页面或整个 Lens 运营验收。临时浏览器及其独立资料目录已关闭并清理，固定共享运行时未触碰。

## 2026-10-09 — 真实上传缺失文件错误修复

- 使用既有安全登录器与专用本地测试账号验证空 multipart 请求：游客被拒绝，登录后的缺失文件请求原先触发服务器错误。
- 在唯一 multipart 上传入口补上缺失文件校验，保持现有路由、权限、存储服务和正常文件委托不变；真实本地复核返回客户端校验错误，不再是服务器错误。
- 新增三项控制器回归，确认缺失与 null 文件不调用上传服务，正常资料/目录/账号及返回值原样委托。后端类型检查通过，本地合同 53 项通过，0 失败、0 跳过。
- 隔离上传原型参数顺序与真实控制器不一致且依赖未完整模拟，已删除；未将其结果作为存储安全证据。真实资料上传、读取与清理仍未完成。
- 一条临时脚本异常未经投影输出本地测试代码及已知项目路径，未含凭据、服务器连接信息或用户内容；停止相关外部操作，后续只返回封闭错误分类。没有宣称删除平台输出。
- 临时运行器已清理，正式回归保留，固定共享浏览器运行时未触碰。

## 2026-10-09 登录特色功能完整性与滚动可发现性

- 确认登录新对话的特色功能曾被研究结果存在条件限制为 3 项；移除三个登录侧栏调用位置的条件，统一显示完整 9 项，未改变首页游客布局或 Academic 请求链路。
- 更新旧回归中登录空会话仅显示 3 项的断言；未登录页面的展示断言保持原样。
- 三项隔离合成浏览器回归全部通过；确认完整列表、桌面/深色/手机滚动提示及末项可达性。工作台模板编译通过，本地预览提供三个完整列表绑定。
- 真实服务全面验收仍未完成，不据此宣称已经可运营。

## 2026-10-09 完整前端隔离验收未通过

- 完成两轮完整前端隔离合成回归：首轮 24 通过、15 失败；更新旧测试后最近一次 25 通过、14 失败，两轮均无跳过。
- 更新一个共用的登录特色功能数量断言及一个有重复入口的定位；收紧登录动作匹配以排除退出登录，并补齐常用中英文登录名称。生产界面与业务代码本轮未变。
- 八个游客检查中止场景定向回归仍全部失败。单场景只输出三个布尔的临时诊断确认游客分支及两个缺失条件均为真，诊断代码随后恢复；未据此认定产品或夹具的具体故障。
- 前端类型检查通过，零类型诊断。
- 受控源码检查确认上传主路径五个配置依赖、配置键值实体 schema，以及其配置访问闭包没有环境变量兜底；没有执行正向真实上传，实际存储与清理仍待证明。
- 记录一次本地生成命令语法错误造成的命令及路径回显；未输出凭据、服务器连接材料或用户内容。停止本轮相关文件链路外部复核，后续诊断使用外层输出捕获，不声明已删除平台历史。

## 2026-10-09：特色列表与滚动入口定向复核

- 确认登录侧栏三处入口均传入完整研究任务列表，当前列表为九项；共享滚动组件提供细滚动条及可点击底部提示。
- 两项定向测试先通过：历史证据链与权限面板、对话特色列表与滚动入口。另一个左侧快捷任务测试定位到选择器查错区域，限定左侧首页后重跑通过；本轮最终相关三项均通过，不代表全套通过。
- 确认完整套件中的八项前置检查属于真实登录路径，需要登录输入；它们没有注册合成页面夹具。此前页面登录标记缺失的解释不准确，已更正当前状态与验收摘要；保留真实登录前置限制。
- 本轮仅修正测试定位范围并同步记录，没有新增产品样式或依赖。临时测试产物已移除，固定共享 Chromium 未修改。

## 2026-10-09：完整前端回归与真实本地登录复核

- 三十一项定向回归通过。进一步发现此前八项测试使用局部 API 夹具，但未注册合成页面，因而依赖登录前置输入；补齐页面夹具并让局部路由 fallback 复用底层夹具，原登录前置限制保留。
- 最新完整前端回归三十九项：三十三通过、六未通过、零跳过、零收集错误。失败涉及菜单点击、旧研究工具/综述/论文总结/流程入口以及重复按钮定位；尚未宣称这些全部是产品缺陷或全部是过期测试。
- 全新隔离浏览器复用既有安全本地测试凭据入口，经真实登录表单进入工作台，九项特色任务可见；按表单提交按钮定位后通过。没有读取现有浏览器凭据，浏览器已关闭。
- 上传相关只读取证尚未取得可判定配置映射，没有执行正向上传，不以零匹配推断本地落盘。
- 本轮只修改测试夹具与验收记录，没有修改产品代码或新增依赖。目标保持进行中。

## 2026-10-09 登录态特色功能与滚动可发现性复核

- 核对现有实现：三个登录态特色任务调用分支均包含完整九项任务，复用能力滚动容器；本次没有修改生产代码。
- 临时回归运行器原测试行号已过期，首次运行无测试匹配；更新选择位置后，三项侧栏与左侧提问隔离浏览器回归全部通过，无失败或跳过。验证九项任务、桌面滚动反馈与末项到达，游客首页保持原有规则。
- 本次结果不替代全量回归，不代表真实服务、模型或计费已经验收完成。运行器临时目录已清理；累计业务改动保留，长期规则不变。

## 2026-10-09 剩余功能回归修复与真实本地上传验收

- 回归脚本改用当前内联能力按钮，展开已收起的侧栏，并只关闭实际存在的弹层；保留合成账号 UI 登录前提。润色段落、表格刷新恢复及重新生成断言继续验证。
- 论文与 LaTeX 测试通过当前更多功能切换插件，验证后端原始插件名；会员研究方案入口验证默认 Academic 请求与草稿传递。用户已移除的旧手工工作流界面没有恢复。
- 九项定向回归和完整三十九项前端隔离浏览器回归均全部通过，无失败或跳过；此前完整回归的六项失败已收口。
- 从现有代理配置确认实际本地后端，核验监听进程目录与存储开关。专用本地测试账号身份核验通过后，上传一份合成 PDF，落盘哈希及 HTTP 下载哈希均与原文件一致，当前测试文件及其独立目录已删除。
- 诊断阶段遗留的三份同内容合成资料只在随机验收命名空间内按大小和完整哈希精确清理，复查剩余匹配文件为零。没有删除业务文件，也没有修改线上配置或数据库。
- 前端研究合同与现有学术引擎合同脚本执行通过。没有新增生产代码或依赖。上传保存、下载验收不等同于所有插件与真实模型读取资料的语义验收，整体运营目标仍未完成。

## 2026-10-09 真实 PDF 语义与短时稳定性验收

- 本轮未修改生产代码。前轮三十九项前端回归通过的证据保持有效，但没有据此宣称真实资料链路通过。
- 首次手写 PDF 未通过现有解析器验证，其模型回答结果未作为产品缺陷根因证据。改用固定 Chromium 生成纯合成 PDF，并在上传前确认解析器可恢复仅存在于文档中的随机校验码。
- 有效 PDF 上传、落盘及 HTTP 下载哈希一致。专用本地测试身份通过现有写入门禁执行真实模型调用，计费检查与独立记录删除通过，回答仍未包含文档校验码，默认对话资料语义验收未通过，列为 P1 待查项。
- 源码投影确认默认对话、插件及工作流的文件输入分支不同；没有未经影响审计修改共享 handler，也没有恢复旧界面。
- 按现有目录 POST 与模型 GET 查询合同，十五轮共三十次本地只读请求全部成功，返回内容一致，无错误或慢响应；该证据仅覆盖短时读取。
- 测试上传文件与独立研究记录已删除，测试浏览器已关闭。Academic 链接工作区的精确残留核查仍待完成，不把上传文件删除等同于整个中间工作区清理。
- 运营目标继续保持未完成，下一步是链接工作区检查、默认附件正文传递的契约审计及修复验证。

## 2026-10-09

### 侧栏分组节奏与附件正文传递修复

- 桌面侧栏新增可用空间分配规则，调整“更多功能”和“特色功能”的垂直层级；空间不足时保留滚动，不改变左侧对话区和手机抽屉布局。
- 默认学术对话与基础能力在有附件时增加受限正文上下文读取，支持 PDF、DOCX、LaTeX 及常见文本类型；无附件、插件目录路由和工作流入口保持独立分支。
- 计费 token 统计使用实际发送给默认对话/基础能力的正文上下文，插件仍沿用用户问题作为计费输入。
- 学术聊天路径移除上游错误正文、异常堆栈和上传错误原文日志，避免附件内容进入日志。
- 前端类型检查、前端生产构建、服务端构建及二十五项本地学术语义/上传控制器/写入身份合同测试通过。
- 本轮页面回归因固定浏览器启动不可用未取得新页面结果；默认 PDF 真实语义修复尚未完成复测，运营验收仍未完成。

### 2026-10-09 附件上下文回归补充

- 将附件正文拼接提取为独立边界函数，新增两项单元回归：正文校验码保留、最多处理三份资料并跳过不可读来源，结果为 2 通过、0 失败。
- 重新尝试启动本地前后端时均遇到运行时权限错误，进程已停止；未把启动失败误判为业务回归结果。

### 2026-10-09 合同核验补充

- 在不启动本地服务的条件下完成 42 项学术语义、上传控制器、配置访问、图表恢复和写入身份合同测试，全部通过。
- 受控环境确认禁止本地 loopback 绑定；前后端启动失败属于运行环境限制，未被记录为业务功能通过。

### 2026-10-09 学术日志隐私边界与上下文上限

- 收紧 Academic 聊天、工作流、文件代理和上游请求日志：移除异常正文、堆栈、上游响应正文、基础地址、运行时身份和文件内容，只保留受控错误分类与布尔状态。
- 附件上下文新增联合字符上限回归，附件上下文单元测试增至 3 项并全部通过；服务端构建通过。
- 前端研究合同验证再次通过；本地 loopback 运行权限仍未恢复，真实服务和浏览器回归仍待执行。

### 2026-10-09 Academic 日志字段再次收紧

- 移除 Academic 日志事件中的请求标识、用户标识、模型运行标识和持续时间等运行元数据；响应流所需的 requestId 仍只保留在接口响应，不写入日志。
- 服务端构建与 42 项本地合同测试、3 项附件上下文测试再次通过。

### 2026-10-09 前端收口合同回归

- 前端类型检查、生产构建、研究合同和候选产物合同全部通过。
- 服务端本地验收合同回归共 53 项通过，附件上下文 3 项单元回归继续通过。
- 本轮没有启动服务、读取凭据或访问线上环境；真实浏览器、真实模型和资料语义证据仍按当前运行权限单独记录。

### 2026-10-09 服务构建与发布门禁复核

- 服务端生产构建、静态发布合同、Playwright 策略扫描和旧界面移除合同均通过。
- Academic engine contract 仍因当前环境禁止 loopback 监听而未通过；未触发业务写入、模型调用或项目存储。

### 2026-10-09 侧栏分组统一与套餐整页入口

- 桌面侧栏默认保持展开，游客与登录态共用同一信息架构、标题、行高和分组节奏；仅能力权限与登录动作不同，用户仍可手动折叠。
- 移除“更多功能”和“特色功能”之间的自动撑高空白，改为紧凑间距与低对比度分隔线。
- 统一游客与登录态“更多功能”标题的行高和顶部节奏，避免未登录侧栏产生额外空白。
- 新增 `/pricing` 整页套餐购买路由，复用既有套餐列表、计费周期、支付和权限链路；套餐页支持 Lens 品牌页头、主题切换、语言切换、返回工作台和移动端单列布局。
- 设置中的“升级套餐”、能力权限提示和积分不足跳转统一进入该整页入口，避免继续落入窄弹窗购买流程。
- 前端类型检查、生产构建通过；固定 Chromium 已打开静态 `/pricing` 并取得无登录态快照，真实套餐接口和支付未在静态预览中执行。
- 最新静态快照同时确认 `/` 游客侧栏默认展开，能力与特色入口连续呈现；临时预览页和浏览器会话已关闭。

### 2026-10-09 真实服务启动复核

- 受控本地 Academic 服务出现就绪信号并通过脱敏 HTTP 2xx 探测；核心真实门禁运行超时，未记录任何原始日志、凭据或用户内容。
- Vite 开发服务器在独立本地端口等待 35 秒仍未返回页面；已安全停止自有进程。静态候选构建与固定 Chromium 页面快照继续有效，运营验收保持未完成。

### 2026-10-09 桌面研究侧栏移至左侧

- 桌面 Lens 工作台将研究能力与研究记录侧栏放到对话主区左侧，保留折叠状态、滚动分组、移动端顶部菜单和既有能力调用链。
- 侧栏增加低对比度右侧分隔线，使左侧导航与中间学术对话形成清晰层级；未恢复卡片式大容器或新增交互。
- 侧栏宽度收敛为 `clamp(264px, 20vw, 288px)`，减少对学术对话主区的挤压。
- 前端生产构建、研究合同验证和 `git diff --check` 通过；当前运行环境仍无法启动本地服务，未取得新的浏览器视觉回归证据。


## 2026-10-09 套餐购买整页

- 新增 Lens `/pricing` 全页购买体验，保留现有套餐加载、订单、支付与登录状态链路。
- 购买页移除重复套餐标题，统一学术绿按钮、等高套餐卡片、月付/年付切换、加载骨架、登录门槛与手机单列布局。
- 固定 Chromium 完成桌面可见复核：套餐列表、周期切换、年度折扣与额度随切换更新并恢复月付。
- 本次仅记录脱敏验证状态；未写入凭据、Cookie、token、服务地址、用户内容或原始运行日志。


## 2026-10-09 手机与侧栏视觉修复

- 未登录手机首页隐藏“常用功能”，保留特色研究入口。
- 缩小手机顶部账户图标的视觉尺寸，保留可点击区域。
- 为模型选择器、发送区选项和侧栏能力行补齐一致的左右内边距与紧凑行高。
- 统一“更多功能／特色功能”的标题、悬停背景、箭头显隐与间距；未改变既有能力调用链。
- 验证：type-check、build-only、git diff --check、Impeccable detector 通过；移动快照已确认未登录不显示“常用功能”。

## 2026-10-10 特色任务降级合同与侧栏列表节奏

- 恢复九项特色任务共用的确定性 `build_local_draft`，覆盖研究设计体检、审稿意见应答、文献检索策略、整理研究笔记、比较多篇论文、生成教学材料、研究问题拆解、文献综述工作台和研究方案设计；9/9 输入与结果合同通过。
- 本地草稿明确标记为暂定建议或待补充，不生成来源、不声称完成研究；模型输出不合格时继续经过同一结果校验器，避免缺失函数导致错误帧。
- “更多功能”桌面列表可视高度提高并保留滚动提示，移动端采用独立较小上限；“特色功能”分组增加明确上间距，游客侧栏同步调整。
- 前端类型检查、生产构建、研究合同和候选产物合同通过。浏览器本地页面访问被用户权限拒绝，未进行绕过；本地服务无响应，真实模型与上传语义验收保持未完成。

## 2026-10-10 Academic 插件目录服务复核

- 定位到旧 Academic 进程仍占用默认本地服务端口，使用旧版本插件目录代码并返回 500；停止旧进程后以当前代码启动。
- 收敛插件目录请求的注册表读取，移除每次请求热重载；新进程的核心能力目录与插件目录均返回 200，目录计数为核心 6、插件 37，其中 Lens 特色任务 9 项。
- `academic_engine_contract_gate.mjs` 通过：服务就绪、核心/插件列表、隔离上传与文件读取均通过；未调用外部模型、未执行业务写入。
- Lens 网关在当前本地运行环境仍未形成可用监听，真实网关模型验收与线上部署不计为完成。

## 2026-10-10 Lens 网关只读真实门禁

- 使用本地受控测试身份在内存中完成只读门禁：登录态、配置、会话/历史、余额、模型、套餐、Academic 核心目录和插件目录均通过；只读门禁未调用写入、上传、生成或分享创建。
- 真实网关目录返回核心 6 项、插件 35 项；Academic 直连服务目录返回核心 6 项、插件 37 项，其中 Lens 特色任务 9 项。
- 用户已明确授权上线，但 Lens 项目当前没有可复用的安全服务器连接入口；未猜测目标、未读取其他项目凭据、未执行线上写入。
# 2026-10-09

## Lens 特色任务从提示词入口升级为真实 Academic 能力

- 新增 `academic-4.0/crazy_functions/Lens_Featured_Tasks.py`，注册九个 Lens 特色任务。每个任务都有独立的输入预处理、结构化检查、结果缺口标记和任务专用模型指令；模型不可用时返回本地可复核的任务框架，不伪造数据或来源。
- 新增 `academic-4.0/crazy_functions/lens_research_tasks.py` 作为纯任务合同层：限制输入长度和文件目录误用，审稿意见逐条覆盖、论文逐篇覆盖、研究设计六维覆盖、检索策略由程序生成布尔式；模型输出必须通过 JSON schema、状态和原文引文校验，失败只返回脱敏错误。
- `crazy_functional.py` 将九个任务注册为 Academic 插件；网关套餐访问规则同步前后端，保留现有权限边界。
- `ResearchShortcuts.vue` 不再调用 `setPrompt` 伪装能力，改为从 Academic 插件列表选择真实任务；“更多功能”过滤掉特色插件，避免重复入口。
- 网关对特色任务保留用户问题并合并受控附件文本上下文，避免把内部上传目录当作用户材料；其他文件型插件路径契约保持不变。
- 已验证：九任务输入合同、研究设计与检索输出合同、Python 编译、前端 `vue-tsc`、前端生产构建、Nest 服务构建、静态发布门禁和 `git diff --check` 通过。真实服务启动、真实模型推理、真实上传语义和全量运营验收仍未完成。
- 本地真实链路复核：Academic 服务启动成功，9 个特色插件均出现在插件列表；9 个直连请求全部返回 200、正常结束流且无错误帧。使用本地受控测试身份通过 Lens 网关登录，网关列表包含全部 9 项，9 个网关请求均完成流结束且无错误帧，返回框架默认 2xx/201。只使用合成材料，未输出凭据、正文或运行原文。
- 当前边界：本轮确认了服务可达、插件注册、登录、网关转发和流结束；尚未把“模型生成内容是否通过每个任务的 JSON/来源校验”与“上传资料经网关进入特色任务”计为完成，需单独复核。


## 2026-10-10 本地真实回归与发布门禁复核

- 重新执行前端 release-check：类型检查、生产构建、研究合同和候选产物合同通过。
- 重新执行服务端构建、Academic engine contract、静态发布合同、旧界面移除门禁和 53 项本地安全/语义/上传控制器合同，均通过。
- 真实本地核心 Academic 链路 6/6 通过：中文润色、英文润色、脑图、翻译、参考文献和代码解释均完成认证、计费、生成、研究记录创建与清理。
- Lens 真实本地烟测通过：登录、研究记录创建与改名、研究生成、刷新恢复、记录删除均成功，并确认请求走 Academic 路由。
- 真实特色任务的插件目录、流结束和离线结构化合同证据保持有效；9 项任务的真实模型语义与附件语义仍未宣称完成。
- 浏览器对本地页面的访问继续被用户权限拒绝，未使用替代浏览器、CDP 或其他方式绕过。
- 运营发布门禁因当前服务侧本地测试身份状态不匹配而阻塞；Lens 项目内仍未找到专用受控服务器连接入口，未执行线上写入、部署或重启。
- 更新 `STATUS.md` 为当前快照；固定共享 Chromium、业务文件和凭据未清理或修改。

## 2026-10-10 特色任务、资料链路与稳定性回归

- 使用项目现有受控本地测试身份完成 9 项 Lens 特色任务真实调用，9/9 返回正常、流结束且无错误帧；未输出模型正文或凭据。
- 使用合成 PDF 完成上传、下载哈希一致和带附件特色任务请求；模型未回显文档唯一编号，因此未把该结果记录为正文语义完成。
- 对本轮合成 PDF 做精确哈希清理，匹配到并删除 1 个候选文件；配置化 Academic 中间工作区未核查，不能扩展清理结论。固定共享 Chromium 未触碰。
- 使用同一受控身份完成 10 轮 Academic 健康、核心目录和插件目录只读探测，共 30 次请求全部成功。
- 使用受控身份运行本地 smoke（核心路径），进程以成功状态结束；本轮仅投影进程状态，不以此声称完整测试报告通过。发布门禁的超级测试身份仍与当前服务侧状态不匹配。
- 未执行线上部署、数据库变更、服务器写入或浏览器权限绕过。

## 2026-10-10 受控输出边界事件记录

- 一次本地测试脚本审计的工具输出包含测试脚本中的默认凭据字面量；发现后停止继续展开相关源码，没有复制、保存、上传或再次传播该值。
- 后续只使用项目凭据解析器在内存中处理，并将结果投影为认证布尔值；未新增临时凭据文件或外部操作。

## 2026-10-10 受控日志输出边界事件记录

- 一次本地 Academic 进程启动探测未重定向标准输出，工具结果包含内部运行路径与监听元数据；发现后立即停止该进程，并停止继续展开相关日志。
- 后续 Academic 启动必须将标准输出和错误流导向受控空 sink，仅返回就绪布尔值；未复制、保存或再次传播原始日志。


## 2026-10-10 特色任务 JSON 解析边界修复

- 先新增回归测试并确认旧解析器对“前置说明 + JSON + 尾注”失败，再实现受限 JSON 对象提取；数组、非对象和严格字段/来源校验仍保持拒绝。
- Python 单元测试 2/2、Python 编译和服务端构建通过。
- 真实特色任务请求仍需语义复核：当前探测出现受控错误或本地结构化草稿降级，未宣称 9 项真实模型结果完成。

## 2026-10-10

### 发布前真实特色任务复核与发布门禁

- 前端类型检查、生产构建、研究合同、候选产物合同、静态发布合同、服务端构建、Academic 编译和 53 项本地受控合同均通过。
- 核心 Academic 真实语义矩阵重新执行，6/6 通过；每项完成计费方向检查、临时研究记录创建与清理。
- 9 项 Lens 特色任务逐项执行本地真实请求，9/9 请求返回并完成临时研究记录清理；9/9 结果均触发明确的本地结构化草稿降级，尚无真实模型 JSON 结果通过完整结构与来源引用校验的证据。
- 线上连接只做受控只读探测，因连接材料未提供可确认登录用户/可用发布入口而安全停止；未猜测用户名，未复用其他项目凭据，未修改服务器、数据库、线上文件、进程或配置。
- 临时特色综合验收脚本已清理；固定共享 Chromium 保留。工作树仍存在任务开始前的混合修改和未跟踪验收文件，未执行整包发布。
- 回滚：本轮未产生线上写入；本地仅有构建产物和三件套记录变化，按 Git 工作树回滚即可。

## 2026-10-10 发布前收口复核

- Academic 使用项目虚拟环境启动后，服务与 Academic 健康检查通过；核心 Academic 真实语义矩阵 6/6 通过，计费、研究记录创建与清理均通过。
- 9 项特色任务逐项入口已确认存在，但真实模型请求在特色任务路径返回安全连接异常，未把本地草稿或非结构化输出计入通过，线上发布因此阻止。
- 移除特色任务本地草稿降级、服务端临时诊断标记和调试输出；保留用户可理解的安全失败消息。
- 前端类型检查、Vite 生产构建、Nest 构建、研究合同、候选产物合同、特色任务单元测试和 22 项本地安全/权限合同通过。
- 浏览器隔离回归已启动；基础研究记录与证据隔离用例通过，部分权限 fixture 用例失败，尚未形成完整视觉与权限回归证据。
- 未部署、未重启线上服务、未修改服务器/数据库/线上文件，固定共享 Chromium 未触碰。
- 回滚：本轮业务代码仍在本地工作树，未产生线上变更；删除本轮临时调试改动即可回到无诊断主路径，部署必须等待真实特色任务和发布入口阻塞解除。

### 2026-10-10 生产用户边界补充

- 用户明确告知线上 Lens 数据库已有真实用户；本轮仅同步此发布约束，未进行线上数据库读取或写入。
- 此前本地测试账号清理授权不扩大到生产；发布不得清空生产账号或使用本地数据库覆盖线上数据。
- 本轮未修改业务代码或线上环境。

# 2026-10-10 受控 SSH 入口复核

- 按 Lens 项目安全流程读取 `Lens/受控服务器入口文件`，受控解析器拒绝该文件，原因归类为缺少允许的登录用户字段；未建立 SSH，未输出、保存或展开服务器地址、账号、密钥或其他连接材料。
- 使用项目现有依赖直接复核，前端类型检查、生产构建、研究合同、候选产物合同、Nest 构建、Academic 合同、静态发布合同和本地安全/语义合同均通过；未重写锁文件或新增依赖。
- `pnpm` 安装阶段因现有锁文件的完整性策略拒绝 `xlsx@0.20.2` 缺少 integrity 字段；该问题未被绕过，也未修改锁文件。
- 线上未执行部署、重启、数据库变更或任何写入；回滚仍为无线上变更状态。

# 2026-10-10 SSH 只读目标复核

- 用户明确补充登录用户后，在受控内存中完成 Lens SSH 连接解析并执行只读检查；未修改 `受控服务器入口文件`，未输出或保存任何连接材料。
- 线上候选目录、前端入口、服务构建目录、备份目录和 PM2 可用性均确认存在；线上仅 Academic 进程在线，Lens 主服务当前不在线。
- 未执行线上重启、部署、数据库变更、缓存刷新或其他写入；发布仍等待本地 9 项特色任务真实语义门禁和干净候选包。

# 2026-10-10 线上主服务恢复

- 只读确认线上主服务此前不在线后，按项目既有 PM2 启动契约恢复已有服务进程；未替换静态候选、未改数据库、配置、Academic 进程或用户数据。
- 复核结果：主服务与 Academic 进程均在线，对应本地端口均可建立连接。
- 本次属于恢复既有运行状态，不代表新版本候选已发布；新版本仍需等待 9 项特色任务真实语义门禁与干净候选包。

# 2026-10-10 干净候选构建复核

- 从 Git 干净基线叠加当前已授权的 `chat`、`service` 和 `academic-4.0` 生产改动，排除服务器入口、环境变量、依赖目录、日志、构建产物和验收临时文件后独立构建。
- 候选构建通过：前端类型检查、生产构建、研究合同、候选产物合同、Nest 构建和 Academic Python 编译均通过；候选临时目录已清理。
- 当前执行沙箱禁止本地 Python 进程绑定监听端口，Academic 本地 HTTP 运行时门禁无法在此环境形成；未绕过该限制，也未改用线上额度代替本地证据。

# 2026-10-10 特色任务草稿路径清理

- 删除特色任务合同层中无调用方的 `build_local_draft` 离线草稿生成实现，保留真实模型请求、严格 JSON 解析和来源校验作为唯一结果路径。
- Python 编译、特色任务合同、前端类型检查、生产构建、研究合同、候选产物合同、Nest 构建和干净候选构建均通过。
- 本地隔离 Academic 门禁在自动审批后通过，确认核心目录、插件目录、隔离上传和文件读取合同；真实模型语义仍受本地模型调用与运行环境限制，未伪造通过。
- 清理了本轮 Python 编译缓存和临时安全摘要；未触碰固定共享 Chromium。

## 2026-10-10 前端收口质量复核

- 修复研究记录工作流进度条的布局动画：由 `width` 过渡改为固定宽度配合 `transform: scaleX`，避免进度更新触发横向布局重排。
- 使用已存在的本地二进制重新通过前端类型检查、Vite 生产构建、Nest 构建和 53 项本地受控验收合同；`git diff --check` 通过。
- Impeccable 静态检测在上述修复后无告警；未读取或输出 Academic 日志内容，未执行线上写入。

## 2026-10-10 DeepSeek V3.2 模型统一

- 根据官方模型对应关系，Lens 将未指定模型时的默认 Academic 模型设为 `deepseek-chat`，界面显示为“DeepSeek V3.2”。
- Academic 服务在默认解析路径优先选择该模型；当该模型失败时不再静默切换其他模型，避免验收结果混入不同模型。
- 前端类型检查、生产构建、服务构建和 53 项本地受控合同通过；实际模型条目与上游认证仍需在受控运行环境中复核。


## 2026-10-10 本地真实验收收口复核

- 本地登录与只读门禁通过，覆盖身份、配置、研究记录、历史、额度、模型、套餐、核心目录、插件目录和分享读取；只读阶段未执行生成、上传或业务写入。
- 按用户授权为本地测试身份增加一次最小模型额度，随后只读确认额度达到验收条件；未触碰线上用户、生产数据库或服务器。
- 9 项 Lens 特色任务逐项真实请求均返回 201 并正常结束流，隔离研究会话全部清理；最终结果均带受控服务/认证错误标记，真实结构化语义为 0/9，不能计为通过。
- 前端类型检查、Vite 生产构建、Nest 构建、研究合同、候选产物合同、静态发布合同、旧界面移除合同和 Academic 隔离合同门禁通过。
- 本地 Academic/Vite 验收进程与临时脚本、日志已停止/清理；固定共享 Chromium 未触碰。
- 浏览器本地页面访问被保存权限拒绝，未绕过，未取得新的视觉截图；线上未部署、未重启、未修改数据库或服务器文件。
- 一次门禁输出误带内部候选元数据，已停止继续展开并清理相关临时产物；后续仅保留固定脱敏字段，未复制或再次传播原文。


## 2026-10-10 Academic 上游认证阻塞复核

- 重新启动与停止本地 Academic/Vite 验收服务，登录、只读目录和隔离会话合同保持通过。
- 9 项特色任务再次逐项请求，传输层均结束，但结果全部命中受控上游认证/连接错误，真实结构化语义仍为 0/9；未继续重试或伪造结果。
- 项目既有代理探针与受控日志分类均指向上游认证/连接问题；未输出端点、密钥、原始日志或用户内容。
- 当前缺少可安全使用的有效本地模型入口或 fixture；线上未部署、未修改服务器或生产数据库。

## 2026-10-11 DeepSeek V3.2 受控门禁身份投影修复

- 受控写入门禁兼容 `/auth/getInfo` 的两种已确认响应形状：`data.userInfo` 与直接 `data`。
- 新增直接 `data` 身份合同，连同既有身份、清理、计费和残留合同共 13 项通过。
- 本地服务探测未取得可用测试身份材料，真实 9 项特色任务仍未开始语义计数；服务进程已停止，未执行线上部署或写入。
- DeepSeek V3.2 仍是唯一默认模型路径（`deepseek-chat`），未添加回退模型。
- 前端 `vue-tsc`、Vite 生产构建和上述 13 项合同回归再次通过；构建生成物未纳入发布，服务进程保持停止。
- 重新构建服务后启动探测仍在数据库/Redis 连接阶段超时退出；仅记录脱敏错误分类，临时启动日志已删除。

## 2026-10-11 原生本地依赖与服务复核

- 用户明确禁止 Docker；规则已同步到 AGENTS。本轮未拉镜像、未安装依赖、未创建容器数据库。
- 受限探测失败后，在获准的只读探测中确认原生 MySQL 与 Redis 健康；探测权限问题不等于依赖缺失。
- 现有 Academic 健康、本地测试身份登录及认证后的 ready 检查通过；未读取数据库内容或输出凭据、响应正文。
- 离线模型注册表不包含目标与旧别名；当前服务动态适配路径未确认，因此没有据此认定根因。
- 本轮未调用生成接口、未消耗模型额度、未进行线上操作；运营验收尚未完成。
- 一次定位直接展开源码及本地运行元数据，不符合封闭输出边界；已停止相关展开，后续仅返回白名单状态、布尔值和分类，未声称删除历史输出。

## 2026-10-11 中文润色真实链路根因定位

- 修正受控核心验收脚本：基础能力请求使用 `function=basic` 并将能力名放入 `core_function`，避免验收脚本绕过 Academic 基础能力路由。
- 修正后重跑一项中文润色，研究记录创建与清理通过，但 Academic 返回 4 帧中的错误结束状态，真实语义与计费均未通过。
- 受控服务事件投影确认发往 Academic 的 DeepSeek V3.2 请求没有 API 密钥和显式代理端点；未读取、输出或猜测密钥、服务器信息或原始日志。
- 因此当前根因是本地模型条目缺少可用上游认证/连接配置，不能靠代码回退或 Docker 解决；需要在受控本地配置中补齐有效 DeepSeek V3.2 密钥或代理端点后再验收。
- 当前日期已为 2026-10-11，10 月 10 日交付目标未达成；未发布、未修改线上环境。

## 2026-10-11 前端与服务构建复核

- Vue 类型检查通过。
- Vite 生产构建通过。
- Nest 服务构建通过。
- 本地 DeepSeek V3.2 配置复核仍显示模型条目存在但未配置可用密钥或代理；未进行猜测、跨项目复用或写入。

## 2026-10-11 前端合同与浏览器访问复核

- 53 项本地安全、身份、语义、上传和浏览器合同全部通过。
- Vue 类型检查、Vite 生产构建、Nest 服务构建全部通过。
- 本地 CUA/浏览器访问 127.0.0.1:9003 仍被保存的拒绝权限拦截；未通过替代浏览器、CDP 或其他方式绕过。
- 未取得桌面/移动截图证据，因此不宣称最终视觉验收完成。

## 2026-10-11 健康状态与真实生成复核

- Academic 健康接口复核返回 ready，但一项中文润色真实请求仍返回 4 帧错误结束，语义和计费未通过；临时研究记录创建与清理通过。
- 健康状态不能替代真实生成验收，未继续重复消耗额度。
- 服务构建与本地合同保持通过；未进行线上操作、未输出或猜测敏感配置。

## 2026-10-11 消息空白与显式模型解析修复

- 消息记录底部操作栏默认收起，仅在悬停或键盘聚焦时展开；移动端保持可见，消除透明操作栏造成的发送消息下方大块空白。
- Academic 未指定模型仍默认 DeepSeek V3.2；显式选择后台已启用模型时按模型 ID/名称解析，修复 `gpt-6-luna` 被硬编码默认模型规则误判为不可用的问题；缺失或停用模型仍保持失败。
- 更新模型选择合同并通过 8 项模型解析测试；前端类型检查、Vite 生产构建、Nest 服务构建和差异检查通过。
- 未读取、输出或写入任何密钥、令牌、服务器信息或用户数据；未执行线上变更。

## 2026-10-11 消息层级与操作栏视觉修复

- 用户发送内容改为右侧紧凑圆角气泡，助手回复保持左侧宽内容区，保留学术绿并减少卡片感。
- 复制、删除、编辑等消息操作图标改为稳定占位，不再随消息悬停整块弹出；桌面图标使用紧凑尺寸，移动端保留触控尺寸。
- 操作提示改为向下展开，避免原先向上提示被消息容器裁切。
- Impeccable 机械检测无告警；Vue 类型检查、Nest 构建和 8 项模型选择合同通过。

## 2026-10-11 消息气泡与回复动效修复
- 确认研究请求操作栏被用户气泡背景包裹的问题；将消息内容抽为独立气泡层，复制、删除、编辑等操作移到气泡外，并保持桌面与移动端对齐。
- 回复区域沿用现有流式生成光标和呼吸提示，增加短时进入过渡；支持 `prefers-reduced-motion`，未新增依赖。
- 前端 `vue-tsc --noEmit` 与 Vite 生产构建通过；未执行线上写入或发布。

## 2026-10-11 消息操作常显与冗余文案清理
- 修复操作图标仅在鼠标移入时出现的问题；在消息操作栏作用域内明确保持按钮和操作容器可见，悬停只改变颜色与背景反馈。
- 删除“研究请求”“研究结果”两个冗余眉标签及其对应展示计算。
- 前端类型检查、Vite 生产构建和差异检查通过；未执行线上写入或发布。

## 2026-10-11 YutoGPT 式消息节奏收口
- 对照既有桌面视觉快照，确认旧版用户消息过宽、消息眉标签冗余、操作按钮受悬停规则影响；收紧用户气泡间距并限制助手阅读宽度。
- 操作栏按钮显式锁定 display、opacity、visibility 常显；浏览器当前页面不是 Lens，本地页面访问受保存权限拦截，未绕过。
- 前端类型检查、Vite 生产构建和差异检查通过。

## 2026-10-11 YutoGPT 式操作栏与思考计时
- 修正前轮对操作栏可见性的误判：图标恢复为消息悬停或键盘聚焦时显示，触屏设备保持可操作，不再常驻占据视觉空间。
- “思考中”增加连续秒数显示，回复完成后停止计时，保留现有流式提示和阶段文案。
- 前端类型检查、Vite 生产构建和差异检查通过；未执行线上写入或发布。

## 2026-10-11 前端消息交互与服务构建复核
- 前端 release-check 通过：类型检查、生产构建、研究合同和候选产物合同。
- Nest 服务构建通过；Academic 模型选择合同 8 项全部通过。
- 未执行真实浏览器页面访问、线上写入或发布；浏览器权限阻塞仍保持记录。

## 2026-10-11 Academic 受控验收复核
- 本地受控验收合同 53 项全部通过，覆盖认证投影、学术语义、脑图恢复、上传控制器、身份绑定与凭据清理边界。
- Academic 引擎合同未通过，原因仅为当前环境禁止本地监听；未重试、未绕过、未触碰线上服务。

## 2026-10-11 消息气泡稳定布局修复
- 用户消息气泡改为内容尺寸并统一内边距、圆角和文字垂直对齐，避免大块不规则卡片。
- 操作栏改为悬停/键盘聚焦时的绝对定位淡入，不推动消息流、不产生弹出式位移；触屏设备保持可见。
- 移除回复进入位移动效，保留流式内容和思考计时。
- 前端类型检查、生产构建和差异检查通过。

## 2026-10-11 本地 live smoke 通过
- 本地 live smoke 通过登录、研究记录创建与重命名、Academic 研究完成、刷新恢复、记录删除及 Academic 路由检查。
- 前端 release-check 再次通过；未执行线上写入或发布。

## 2026-10-11 真实 Academic 门禁预检结果
- 核心真实语义验收在写入前因受控清理前提未证明而停止；真实门禁因缺少短期测试令牌在预检阶段停止，未执行模型生成、写入或扣费。
- Academic 受控写入合同通过，覆盖残留确认、成功/失败清理、计费预期与令牌不暴露。

## 2026-10-11 用户气泡空容器修复
- 移除用户消息中已无内容但仍占间距的请求头容器，修复文字不在气泡视觉中心的问题。
- 桌面与移动端统一采用内容收缩气泡，取消移动端强制全宽，保持统一圆角和内边距。
- 前端类型检查、生产构建和差异检查通过。

## 2026-10-11 消息气泡与操作栏最终对齐
- 根据用户提供的桌面与移动端截图，修复用户消息操作栏压住气泡的问题：用户消息改为“左侧操作栏、右侧内容收缩气泡”的网格布局，回复操作栏在正文下方保留稳定间距。
- 删除操作按钮的自定义文字 tooltip，保留无障碍标签与消息悬停/键盘聚焦显示，避免出现向上弹出和遮挡文字的效果。
- 清理无用的消息标题计算、请求头样式与对应依赖；思考状态继续显示连续秒数。
- Impeccable 机械检测无告警；前端 `release-check` 与 `git diff --check` 通过；未执行线上写入或发布。

## 2026-10-11 按 YutoGPT 截图恢复消息工具条
- 用户反馈网格布局导致短消息竖排，且与目标 YutoGPT 结构不一致；已改为右侧横向内容收缩气泡，操作图标置于气泡下方的紧凑圆角工具条。
- 通过 `max-content` 与内容区 `100%` 的边界组合修复短文本最小宽度计算，长文本继续受最大宽度约束并正常换行。
- 前端类型检查、生产构建、Impeccable 检测、受控验收合同和差异检查通过；本地前端端口当前未运行，未取得实时浏览器截图，未执行线上写入或发布。
- 固定 Chromium 隔离首页检查通过，确认页面可加载且无横向溢出；合成消息几何检查通过，确认短消息横排、长消息换行、工具条位于气泡下方。
- 服务端构建、Academic 引擎隔离合同、真实门禁合同、受控写入合同、静态发布合同和遗留 UI 门禁通过；真实模型未调用。

## 2026-10-11 移除消息白底工具条与思考胶囊

- 根据最新截图反馈，复制、删除、编辑等操作改为无白底、无外层边框的紧凑图标组，仅保留单按钮悬停/聚焦反馈。
- 移除思考状态顶部“进行中”文案和长椭圆容器，改为与回复正文同层的轻量行内状态；真实 `reasoningText` 优先展示，保留思考秒数和 `aria-live` 状态播报。
- 前端 `vue-tsc --noEmit`、Vite 生产构建、Impeccable 机械检测和 `git diff --check` 通过；未执行线上写入或发布。
- 本轮尝试启动本地前端进行实时截图复核时被当前受控环境的本地监听权限拒绝，未绕过权限、未留下运行进程。

## 2026-10-11 统一模型启用状态判定

- 修复 ModelsService 默认模型和客户端模型列表严格比较 `status === true` 的问题，统一复用兼容数字 `0/1` 与 boolean 的启用判定。
- 新增数字状态回归用例，Academic 模型选择测试 9 项通过；Nest 服务构建和差异检查通过。
- 未读取、输出或修改数据库内容；未执行线上操作。

## 2026-10-11 移除流程椭圆状态与“进行中”文案

- 根据最新 UI 反馈，消息思考状态改为无容器行内文本，移除长椭圆、进度条、百分比和“进行中”状态文案；真实思考内容优先展示，秒数保留在同一行。
- 学术流程入口改为无边框轻量文本行，步骤详情仍可按需展开；运行步骤不再渲染“进行中”状态胶囊。
- 前端 `vue-tsc --noEmit`、Vite 生产构建、Impeccable 机械检测和 `git diff --check` 通过；未执行线上写入或发布。

## 2026-10-11 英文润色提示词与运行时阻塞复核

- 英文润色核心提示词新增强制语法复核，明确检查主谓一致、时态、单复数、冠词和可数性，并禁止输出 `we investigates`、`plant grow` 等已知错误结构，同时保留实验尚未开始等事实。
- Python 源码无缓存编译通过，Academic 核心语义合同 10 项通过；系统 Python、项目虚拟环境和现有工作区 Python 均无法提供可用 Academic 运行时，Nest 服务启动也失败，真实英文门禁因此停止，未执行模型生成、扣费或数据库写入。
- 本地受控验收合同 53 项复跑通过；该结果不替代真实服务与模型语义验收。
- 清理本轮临时日志、测试摘要和运行时文件；未安装依赖、未使用 Docker、未执行线上操作。

## 2026-10-11 修复消息操作栏布局抖动

- 定位到消息 footer 在 hover 时由 `height: 0` 变为 `28px` 并增加 `margin-top`，导致消息流重新排版和页面向上抖动。
- 桌面端将操作栏改为固定绝对定位层，预设尺寸，hover 只切换透明度、可见性和交互状态，不再改变消息高度、外边距或位置；移除位移式显示观感。
- 移动端保留静态固定高度和常显操作，避免触屏交互回退为动态插入。
- `vue-tsc --noEmit`、Vite 生产构建、Impeccable 机械检测和 `git diff --check` 通过；实时浏览器截图仍受保存的本地访问权限阻塞，未绕过、未执行线上操作。

## 2026-10-11 发布门禁与本地合同复核

- 研究合同门禁同步到新的消息 UI 合同：要求行内思考状态和连续秒数，禁止旧深度思考胶囊及其“进行中”文案。
- Lens 前端完整 `npm run release-check` 通过，包含类型检查、生产构建、研究合同和候选产物合同；候选产物未发布。
- 服务层本地验收合同通过：53 项本地受控验收、受控写入、静态发布和旧 UI 清理合同均通过；Nest 生产构建通过。
- Nest 短时启动探针仍返回受控 `runtime_error` 分类，未展开日志原文；进程已停止，真实 API 与模型链路仍未取得运行时证据。
- 使用 Node 受控进程加载项目已有本地配置再次探针，仍未得到监听/启动信号；仅记录“配置相关运行时错误”分类，未输出配置内容，进程已停止。

## 2026-10-11 消息操作行稳定化与服务权限分类

- 进一步修正消息操作区：桌面和移动端均保留静态固定高度，hover 只改变图标可见性，取消透明度/位移进入效果，短消息不会被操作区遮挡，消息流也不会重新排版。
- 类型检查、Impeccable 检测和 `git diff --check` 通过。
- 在受控回环权限下重试 Nest 启动时，探针观察到 9520 的瞬时端口冲突并以退出码 7 结束；随后本地 HTTP 与端口复核均不可达，仍未形成稳定监听证据。未发现缺包、数据库拒绝、缺库或缺表，未输出日志/配置原文，进程已停止。

## 2026-10-11 本地登录探针误回显处置

- 临时本机端口只读探测确认 Academic health 需要认证、模型列表可达；登录态探针返回 HTTP 200 成功包。
- 交互终端意外回显了标准输入中的测试凭据，按零泄漏规则视为误输出；立即停止后续登录/真实链路操作，未复制或再次传播，临时探针文件已删除。
- 不声称删除聊天或平台历史输出；真实登录、扣费和模型链路验收暂停，等待安全处置后再继续。

## 2026-10-11 认证代码静态安全复核

- 对登录组件、认证 API 与本地测试凭据脚本做封闭字段审计，未发现密码/Token 日志、响应原文输出或凭据文件写入模式。
- 该静态结果不替代测试凭据作废后的真实登录回归；真实认证链路仍暂停。

## 2026-10-11 本地测试身份授权恢复

- 用户明确授权继续使用本地测试身份进行验收；凭据通过不回显的进程内输入传递，仅验证解析可用，未写入命令参数、日志、截图或文档。
- 服务端合同、Academic 模型选择、前端类型检查、Vite 生产构建、Nest 构建、研究合同和候选产物合同均通过。
- 真实服务启动仍受当前受控执行环境的本机数据库/缓存回环连接权限限制，未执行模型生成、扣费、上传、研究记录写入或线上发布。

## 2026-10-11 重启后本地浏览器权限复核

- 用户已重启 Codex；复核时浏览器工具仍返回保存的本地访问拒绝状态，无法打开 Lens 页面。
- 未尝试绕过浏览器策略，也未执行替代浏览器、原始 CDP 或其他间接访问；真实视觉与登录链路继续等待工具权限恢复。

## 2026-10-12 修复研究服务误报与思考状态图标

- 修复未登录初始化流程：不再把预期的用户信息认证失败误判为“研究服务暂时不可用”，未登录首页保持可用状态；登录后仍会正常检查 Academic 健康与研究记录接口。
- 根据用户截图移除思考文案前的旋转图标，保留真实思考文本与连续耗时，不改变消息布局高度。
- 本机 Academic `/health` 返回 ready，Lens 前端页面可达，Nest API 未授权健康入口继续返回认证门禁；未执行模型生成、扣费、上传或线上发布。
- `vue-tsc --noEmit`、Vite 生产构建、`git diff --check` 与 Impeccable 机械检测通过。
- 按用户要求停止旧的本机 Nest 进程，改用项目现有依赖启动静默输出的 watch 开发后台；Academic 与前端保持可达。启动日志未保留到临时文件，也未执行依赖安装或线上操作。
- 认证安全审计发现认证、用户、JWT 守卫和签到路径存在动态身份字段日志；已统一替换为不输出参数的安全日志边界，保留原有错误处理和业务控制流。Nest 构建、认证登录回归与差异检查通过。
- 管理后台 Vite 开发页已在本机启动并返回 200；前端、Nest、Academic 与管理后台均只绑定本机入口。

## 2026-10-12 本地收口与隔离响应式验收

- 直接调用项目已有 Node 测试入口，53 项本地受控验收全部通过；Academic 引擎合同在本机授权监听下通过，真实门禁合同、受控写入合同、静态发布合同和旧界面门禁通过。
- 聊天研究合同、候选产物合同、管理后台类型检查与生产构建通过；前端类型检查、Vite 生产构建、Nest 构建和差异检查通过。
- 本地 Lens live smoke 与研究挑战链路通过，覆盖登录、研究记录创建/改名/恢复/删除、Academic 路由和临时数据清理；未输出凭据、正文或运行日志。
- 使用隔离 Playwright 完成桌面与手机首屏快照、模型菜单交互和未登录更多功能登录门禁检查；页面可渲染、无框架错误覆盖层、无横向溢出证据，临时截图和浏览器会话已清理。
- 全量 smoke 入口因当前安全身份读取器未提供可用注入字段而未完成；Academic 核心真实门禁与九项特色任务当前仍缺最新真实模型语义通过证据，未宣称运营验收完成。
- 浏览器控制台日志读取被自动安全审查拦截，未绕过；固定共享 Chromium 未触碰，未执行线上部署、数据库变更或依赖安装。

## 2026-10-12 真实本地 smoke 收口

- 通过项目现有本地凭据读取器在同一受控 Node 进程内完成核心全量 smoke：登录、GPT-6 Luna 模型解析、余额保护、资料上传/清理、研究记录和管理员只读检查均通过；凭据未进入命令行、日志或输出。
- 使用最小本地模型额度逐项执行 9 个特色任务真实 smoke，全部成功结束且无错误输出；测试脚本完成自身临时数据清理，未触碰线上用户或生产数据。
- Academic 独立真实 gate 仍保留短期令牌门禁，未猜测或复用令牌；其缺失不影响本地 smoke 结果，也未被误报为通过。
- 安全处置：受控源码审计输出曾意外包含测试脚本内置的默认凭据字面量；已立即停止展开、未复制/上传/重试，临时输出已清理；不声称删除聊天或平台历史记录。

## 2026-10-12 思考状态圆圈移除与本机开发服务启动

- 移除助手思考文案前残留的 `animate-breathe` 圆圈占位元素；思考文案与连续秒数保持不变，消息结构不变。
- 使用项目现有依赖启动 Lens Nest watch 后台、Lens Vite 前端和管理后台，入口探测均可达；未执行线上写入、部署、数据库变更或依赖安装。
- 本轮类型检查命令因受控环境长时间无输出被终止，未将其记为通过；此前已确认的类型检查、生产构建、服务构建和差异检查结果保持原记录。

## 2026-10-12 论文/PDF 兜底语法修复与本机开发服务复核

- 修复 `academic.service.ts` 论文/PDF 超时兜底条件的括号不平衡，恢复 Nest 服务的 TypeScript 解析与构建；Nest `npm run build` 通过。
- 前端 `npm run build-check` 通过，包含 `vue-tsc --noEmit` 与 Vite 生产构建。
- 受控本机权限下启动 Lens Vite 前端与 Nest watch 后台，入口探测均可达；使用一次性的 `INIT_DB_ON_BOOT=false` 启动覆盖，未修改环境文件、数据库或线上配置。
- 特色任务此前批量 smoke 结果未形成当前可复核的逐项证据，已在状态快照中降级为待验证，不再记为九项全部通过。
- 未执行线上写入、部署、数据库变更或依赖安装。

## 2026-10-12 Academic 真实链路严格回归与特色插件路由修复

- 定位并修复特色插件请求契约：后台插件列表的内部名称包含 Lens 前缀，研究服务上游按展示名路由；Lens 特色能力改为优先发送展示名，同时名称规范化兼容空格与分隔符。
- 修复 `full_smoke_test.mjs` 的模型映射解析，使其兼容 `modelMaps` 中的对象描述；流式解析现在读取结构化 `error`，保留最早的 `finishReason=error`，不会被后续 stop 覆盖。
- 使用本地授权测试身份完成严格真实回归：六项基础 Academic 能力 6/6、九项特色任务 9/9；每项均为 2xx、stop、有效内容、无结构化错误、无硬错误，临时会话清理成功。
- `chat` build-check、`service` build、smoke 脚本语法检查和 `git diff --check` 通过；未执行线上写入、部署、依赖安装或数据库变更。

## 2026-10-12 资料上下文与文件插件边界复核

- PDF 合成资料上传进入普通学术对话上下文的真实请求通过：HTTP 201、stop、返回最终内容，临时研究会话清理成功。
- 论文速读文件插件在受控截止内未形成可展示结果；已为 smoke 流读取增加硬 deadline，避免验收进程无限等待。该插件问题仍未宣称修复。
- Playwright 浏览器回归被项目自身策略门禁拦截，未绕过；本地验收合同与 live smoke 通过。

## 2026-10-12 本地合同与服务稳定性收尾

- 本地受控验收合同、Academic 真实门禁合同、受控写入合同、静态发布合同和旧界面门禁均退出码 0；Lens live smoke 退出码 0。
- PDF 文件入口可达；普通学术对话读取 PDF 资料的真实请求通过并清理会话。
- 清理本轮及历史遗留的 `/tmp/lens_*` 临时脚本与日志；固定共享 Chromium 未触碰，工作树既有修改未清理或回滚。

## 2026-10-12 论文速读 PDF 专用链路复核

- 使用本地合成 PDF、隔离测试会话和与服务端上限对齐的 300 秒读取窗口复核“论文速读”；请求返回 201、结束原因为 stop、有可展示内容且无硬错误。
- 测试会话清理成功；未输出账号、Token、余额、响应正文或内部运行元数据，未执行线上操作。
- 53 项本地受控合同与前端类型检查在同一轮复核中通过；固定共享 Chromium 未触碰。

## 2026-10-12 学术流错误帧收口与九项特色复核

- 取证确认 Arxiv 英文摘要会先收到上游错误帧，随后收到有效正文和 stop；服务端改为消费错误状态但不提前转发错误帧，最终结果统一由 Lens 收尾。
- 修复后 Arxiv 英文摘要由 error 改为 stop；九项特色能力全量真实回归 9/9，通过项均返回 201、stop、有效内容且无硬错误，隔离会话清理成功。
- 六项基础 Academic 能力本轮真实回归 6/6；Word、LaTeX、PDF、论文和 Arxiv 文件/论文链路均有独立通过证据。
- `service` Nest 构建、`chat` Vite 构建、管理后台类型检查与构建、研究合同和 53 项本地受控合同均通过；未执行线上操作。

## 2026-10-12 思考状态样式残留清理

- 删除消息组件中已无引用的 `breathe/animate-breathe` 样式，避免旋转圆圈功能残留重新影响思考状态。
- 前端类型检查、Vite 生产构建和差异检查通过；未改动消息状态逻辑或其他交互。


## 2026-10-12 检索状态图标清理与本机开发入口复核

- 移除网络检索状态行残留的旋转图标和流程摘要前圆点装饰，删除对应无引用样式；保留思考文本、耗时、下载状态与消息结构。
- 前端类型检查、Vite 构建、研究合同及差异检查通过。
- 通过受控只读探测确认本机前端、Nest 后台与管理后台开发入口均可达；停止本轮额外启动的进程，保留原有服务。
- 内置浏览器再次返回保存的本地访问偏好拒绝，未绕过；本轮未形成实时视觉证据，也未执行模型调用或线上操作。
- 重新整理状态快照，去掉相互冲突的过期待办，将既有真实回归与尚未闭合的独立 gate、视觉验收区分。
- 本轮构建检查临时文件已清理；具有审计价值且曾被自动审查拒绝删除的 safe-summary 继续保留。既有混合工作树未回滚或整包提交。


## 2026-10-12 Academic 引擎隔离合同复核

- 在受控本机权限下运行隔离 Academic 引擎合同：服务就绪、核心能力列表、插件列表、隔离上传和文件读取全部通过。
- 合同使用合成资料和临时目录，测试结束后自动清理；未读取或输出凭据、配置、日志、用户数据，未执行线上操作。
- 完整本地发布门禁未执行：其中包含可能读取环境凭据、连接数据库/缓存、写入测试数据或发起模型请求的步骤，自动审查判定当前授权证据不足并阻止执行；未绕过。


## 2026-10-12 本地合同与构建补充复核

- Academic 配置、模型选择、上传控制器、身份边界、凭据合同、核心语义、脑图恢复、思维导图渲染、浏览器合同和研究挑战合同等 10 项无副作用复核全部通过。
- chat build-check 与 service Nest build 均通过；差异检查通过。
- 本机后台只读可达性复核通过；未输出端口、配置、日志、凭据或用户数据。
- 完整本地发布门禁仍未执行，原因和范围见上一条记录。

## 2026-10-12 本轮临时输出清理

- 本轮生成的合同、门禁、单元测试和构建临时输出已清理；固定共享 Chromium 与具有审计价值的 safe-summary 未触碰。
- 工作树仍保留既有业务修改和验收文件，未回滚、未整包提交。


## 2026-10-12 UI 检测与回归夹具复核

- Impeccable 实际可用的 `detect` 检测器扫描工作台源码退出码为 0，未发现主级 UI 反模式。
- 固定 Chromium 的合成 UI 回归首个等待目标为首页特色能力列表；定位到当前开发环境使用本机 API 反代地址，而回归夹具只拦截前端同源 `/api`，导致夹具响应未注入。
- 启动同源 API 基址的临时 Vite 实例尝试复跑，测试命令未形成可采信的最终退出证据；临时实例、浏览器会话和本轮临时文件已关闭/清理，未把该回归记为通过。
- 未修改产品代码，未执行模型调用、数据库写入或线上操作。

## 2026-10-12 临时验收实例清理复核

- 本轮临时 Vite 验收实例的子进程已终止，专用入口不再返回成功 HTTP；已知本轮临时文件计数为 0。
- 固定共享 Chromium 未触碰；Lens 既有开发服务未停止。


## 2026-10-12 手机特色能力显示与合成夹具修复

- 修复 `ResearchWorkspace` 将首页特色能力错误限制为“紧凑布局且已登录”的条件；手机未登录现在也显示 6 个锁定能力，点击仍由既有登录门禁处理。
- 固定共享 Chromium 复核桌面 1440×900 与手机 390×844：两端均显示 6 个能力、输入区可见、无横向溢出；手机能力点击打开登录对话框。
- 合成 Playwright 夹具仅允许回环地址的 `/api/*` 继续进入合成路由，非回环请求仍 fail-closed；语法检查通过。
- chat build-check、Impeccable detect 与差异检查通过；未执行模型调用、数据库写入或线上操作。


## 2026-10-12 响应式修复后的直接页面复核

- 固定共享 Chromium 直接打开本机 Lens 首页：桌面与手机均显示 6 个特色能力，输入区可见，页面无横向溢出。
- 手机未登录点击特色能力后登录对话框出现，权限门禁保持有效。
- 完整 Playwright 场景仍出现长等待/报告输出异常，未把它记为通过；所有测试会话和临时文件已清理。


## 2026-10-12 验收隔离与手机游客行为纠正

- 确认页面级合成路由已覆盖 API，移除多余的上下文回环 fallback，恢复路由缺失时默认拒绝请求。
- 新增不联网的验收隔离单元测试，修复前两项通过、一项失败，修复后三项全部通过；未启动浏览器、调用模型或访问数据库。
- 纠正先前把六项常用能力称为特色能力的判断，恢复手机游客隐藏常用能力的条件；独立的首页六项特色任务保持可见。对应测试断言按视口区分，手机使用真实特色任务验证登录门禁。
- 登录前后侧栏标题、行高、内边距和 44px 触控目标已完成本地修改；最新修订尚缺被允许的浏览器复核。
- 前端类型检查及构建、研究合同、服务本地合同、验收脚本语法和差异检查通过。
- 纠正验收边界：此前浏览器工具拒绝本地访问后使用替代 Chromium 的方式不符合禁止绕过要求，本轮已停止。这批结果不作为最终受控验收证据；不声称已删除工具或平台历史。
- 本轮没有临时输出残留；两个既有失败验收文件与受保护审计证据继续保留。工作树仍包含既有混合修改和未跟踪文件，未整包提交或发布。

## 2026-10-12 编辑态紧凑化与本地服务复核

- 已确认编辑消息框原先存在过大的最小高度和内边距，已改为单行起步、按内容自适应，并统一编辑按钮节奏。
- chat `build-check` 与 `git diff --check` 通过。
- 本地 chat/service 已启动；学术上游请求仍返回运行时错误，页面继续显示研究服务不可用，未宣称运营就绪。
- Edge 整窗截图复核因隐私隔离不足被安全审查拒绝，未通过替代方式绕过。
## 2026-10-13 编辑框高度与侧栏滚动布局修复

- 修复单行消息编辑时 `textarea` 先受 `max-height` 影响、再把布局高度写回导致的巨大空白；现在先归零测量内容高度，再按视口上限设置高度。
- 修复侧栏特色功能标题与条目左边界不一致的问题，移除多余分隔线和条目额外缩进。
- 侧栏改为单一外层滚动上下文，隐藏能力区与特色功能内部重复滚动轨道及提示层，保留外层滚动查看全部功能。
- 收紧桌面侧栏条目行高，保持功能密度与标题层级一致。
- chat 类型检查、Vite 生产构建与 `git diff --check` 通过；未执行模型调用、数据库写入或线上操作。
- 临时 Vite 进程、构建日志和 Playwright 页面快照已清理；完整登录态、真实学术服务与最终视觉验收仍未闭合。

## 2026-10-13 窄屏侧栏对齐与单滚动修复

- 将紧凑特色功能的左边界规则收回组件本身，移动/窄屏侧栏的标题与条目现在共用同一内容起点。
- 移除移动抽屉和桌面工具抽屉中的能力区嵌套滚动轨道与滚动提示，统一由外层容器承担滚动。
- chat 类型检查、Vite 生产构建与 `git diff --check` 通过；未执行模型调用、数据库写入或线上操作。

## 2026-10-13 Edge 扩展验收规则同步与阶段复核

- 检查三件套确认此前有 Edge 使用记录，但没有明确的 Edge 扩展优先长期规则；按用户要求新增 Lens 项目级 Edge 扩展优先规则，并同步当前状态。
- 新规则要求先确认扩展连接、仅操作 Lens 标签页、保护浏览器隐私；平台保存的访问拒绝必须通过恢复对应权限解决，禁止切换浏览器或间接入口绕过。
- 最新侧栏修正删除跨组件滚动样式覆盖，改由组件显式控制容器内滚动：桌面固定两组标题、各列表滚动，移动抽屉单一外层滚动；统一文字起点、字号、行高，取消紧凑侧栏短屏双列排版。
- 前端类型检查、生产构建、研究合同、服务构建通过；65 项本地合同测试全部通过；Academic 引擎启动、核心能力列表、插件列表、合成上传和读回共五步隔离验收通过，未调用外部模型或业务数据库。
- 一次初始化源码读取展开了默认凭据字面值；已停止相关启动操作并改为受控封闭摘要，不再次传播原值，不声称已删除工具历史。
- 本地数据库与缓存只读预检通过，确认启动所需基础数据存在；随后启动本地前端与 service 持续会话，完整就绪及登录态验收仍待复核。未做线上操作，未把合同通过记为运营就绪。

## 2026-10-13 浏览器回退顺序澄清

- 已按用户明确要求，将 Lens 浏览器验收顺序补充为：优先 Edge 现有 ChatGPT/Codex 扩展，扩展不可用时回退 Chrome 现有扩展；访问被明确拒绝时仍不得换入口绕过。
- 本地只读登录与研究配置权限检查通过：匿名配置访问被拒绝，测试账号受保护访问通过；只读研究就绪门禁十项通过，未调用模型或写业务数据。
- 单项中文润色真实验收未通过，验收所创建的记录已确认清理；学术健康接口返回降级，引擎不可达，模型健康尚未知。以上结果不构成真实研究链路通过。

## 2026-10-13 本地提交前安全收尾

- 已在受控内存检查当前改动，历史记录中非保留示例地址所在的运行元数据行已脱敏；安全合同脚本中的既有合成输入保留，以维持当前合同验证语义。没有输出原始匹配值，也未改写 Git 历史或声称删除平台历史输出。

## 2026-10-13 本地真实回归阶段结果

- 使用既有 Python 环境启动本地学术引擎，仅监听本机；启动后健康接口确认引擎从不可达恢复为就绪。完整学术健康仍不能据此宣称全部通过。
- 中文润色真实验收通过：请求、受控写入门禁及语义检查通过，测试记录清理成功且确认不存在。
- 英文润色首轮请求和受控门禁通过，语义检查未通过；该轮记录已清理并确认不存在，后续类别未继续批量执行。
- 已核查本轮临时输出文件不存在；现有两份失败验收证据没有完全重复，保留用于后续排查。活动开发服务使用的临时运行目录保留，停止后由启动包装器清理。
- 提交前文档检查没有发现当前本地测试凭据字面值；前端合同在保留既有合成测试语义后通过，差异格式检查通过。

## 2026-10-13 验收检查点收尾

- 英文润色再次受控请求成功，语义检查仍未通过：降雨与植物生长事实保留、实验未开展事实保留，语法修订检查失败；该轮测试记录已清理并确认不存在。后续诊断进程句柄失效，不能补写诊断结果或宣称其数据库残留已经清理。
- 已按新版根目录规则同步浏览器顺序：Edge 扩展、Chrome 扩展、再按需使用已有其他浏览器能力；访问拒绝仍不可绕过。
- 权威监听检查确认前端、后端和学术引擎当前均已停止；本轮引擎启动包装器的临时目录已无残留。两份既有失败验收证据保留用于排查。
- 验收脚本的密码字面值已移除，改为从现有安全加载器或受控预期值取得；没有修改业务重置密码逻辑。凭据合同五项通过、脚本语法检查与前端合同通过。已修正新验收脚本两处位于字符串之外的行尾空白。
- 当前改动保存为本地未完成验收检查点；本地提交不代表发布、功能验收完成或运营就绪。


## 2026-10-13 — 本地真实能力回归与验收合同修正

- 核对 Lens 长期浏览器规则：Edge 的 ChatGPT 扩展优先，不可用再使用 Chrome 扩展；安装状态不代表本次任务已连接，保存的访问拒绝不得绕过。当前工具尚未获得扩展连接。
- 修正英文润色验收对原文对照列的误判，保留对修订正文、实验状态和事实的检查；17 项回归通过。中文润色、英文润色、互译、参考文献与代码解释已有真实请求通过证据；脑图实际渲染尚未完成。
- 九个特色任务完成首轮真实请求：七项通过，论文比较和研究方案设计未通过；全部受控测试记录清理通过。首个特色任务试跑曾误把能力名称填入请求类型，修正验收请求合同后通过。
- 修正特色任务重试示例中的论文编号、综述关系、方案建议状态和顶层字段约束；删除未使用的重复 schema 构造，保留输入解析、首轮请求与严格来源校验。5 项单元测试通过，其中包括全部九个任务的示例合同与虚构论文编号拒绝验证。
- 论文比较修复后真实补测通过；研究方案设计仍在继续补测，尚未记录为通过。最后一次只读数据库核对未发现存活的受控验收记录。
- 启动本地前端、后端及学术服务；学术服务健康检查通过。只重启本轮学术进程以载入修复，原运行临时目录随进程结束清理；没有使用 Docker、安装依赖或执行线上操作。
- 删除两份过期脱敏诊断摘要；项目范围 Finder 临时元数据检查无残留，保留有效验收证据和正在使用的本地服务目录，固定共享 Chromium 未触碰。
- 本轮没有形成页面视觉与真实上传的完整证据；不得据此宣称运营完成或上线。

- 收尾重新逐条检查长期规则后，发现旧段落与 Edge 优先条款冲突；已移除六条过期 Chrome 优先规则并更新两条回退条款，保留固定运行时、隔离测试清理及拒绝访问不得绕过的限制。
- 论文比较补测通过后，特色任务已有八项真实通过证据；研究方案设计再次补测仍未通过最终报告校验。补测的受控记录清理与归属校验均通过。重试合同单元测试仍为五项全部通过；真实失败未写成通过，运营整体未完成。


## 2026-10-13 — 真实 PDF 上传与模型读取闭环

- 重验三件套、本地服务会话和工作树；本轮开始时工作树干净，前端、后端与学术进程均确认存活。
- 研究方案诊断发现输出包含 rows，但没有完整可解析的顶层对象，只能抽出单个步骤；思考包装和显式流错误未检出。保持原合同的短输出对照仍失败，不能据此断言输出预算是根因，也未将诊断当作特色任务通过。
- 上传验收起初漏掉开发存储的 dev 前缀，清理判断不完整；随后按受控目录和合成 PDF 内容证明归属，移除两份测试文件，并验证没有受控上传目录残留。没有清理其他业务文件。
- 同一份可重开的合成 PDF 在当前解析库中，使用 Buffer 时出现 xref 错误，使用等价 Uint8Array 时正确解析。只修改学术 PDF 分支的输入转换；两个生产调用路径共用此入口，其他资料格式及来源校验未改。
- 增加正式合成 PDF 夹具和生产附件方法回归，覆盖实际文本提取、输入字节不变以及损坏 PDF 不转发原文或错误。Jest 补齐项目已有 @/ 与 src/ 别名；全部现有 3 个套件、12 项测试通过。上传、身份、权限和模型选择 32 项回归通过，服务构建及 diff 检查通过。
- 仅重启本轮本地后端加载修复，没有改数据库、缓存、线上服务或安装依赖。
- 真实验收确认未登录上传被拒绝、登录上传成功、存储字节完整，模型正确回答合成附件的识别码、24 株植物及实验尚未开始状态；受控写入门禁、文件清理、记录清理和归属复核全部通过。
- 特色任务仍为八项真实通过、一项研究方案未通过；其他资料格式、脑图渲染、设置、权限、研究记录与手机电脑视觉仍需完成。浏览器扩展当前无工具连接，未执行替代入口绕过访问拒绝，整体未达到上线状态。

## 2026-10-13 — 浏览器顺序调整与受控清理复核

- 按用户明确要求，Lens 的长期浏览器顺序改为 Codex 自带浏览器优先，不可用再使用 Edge 扩展，然后 Chrome 扩展；作为项目例外保留访问拒绝不得绕过、扩展安装不等于连接和隐私边界。
- Codex 自带浏览器导航仍被拒绝；封闭字段诊断确认错误明确提及已保存策略，没有证明用户主动拒绝，也不是本地连接超时。官方文档列出 Browser 的 Agent permissions，但当前安装版本的可见入口尚未验证。
- 受控合成研究方案请求的最终存储与流内容均缺少完整顶层 rows 对象；至少三个完整步骤对象存在，但外层括号与数组不完整。请求清理和受控记录不存在检查通过；根因尚未确认，未将诊断记为修复。
- 更正全量清理核对范围，覆盖两种既有合成验收标记；确认一条过期记录属于测试账号与已知合成输入后，通过现有删除接口清理，独立复核受控记录残留为零。此前逐次请求清理证据有效，旧全量零残留结论只覆盖较窄格式。
- 删除被新诊断摘要覆盖的重复文件；保留当前失败证据、正式 PDF 合成夹具和服务运行所需目录。不修改 UI，不执行线上写入。

## 2026-10-13 — 三件套状态纠正与安全清理

- 覆盖更新 STATUS，纠正仍停留在旧 JSON 不完整诊断的状态；当前真实合成请求的流与存储均有完整 rows 对象，至少三个步骤存在，外层括号与数组已完整。研究方案最终 Markdown 报告验收仍失败，未宣布九项特色任务全部通过或运营就绪。
- 最近五项基础学术能力真实回归的语义检查与受控记录清理均通过；DOCX 真实上传、匿名访问拒绝、文件完整性、模型读取与清理闭环通过。TXT/TeX 完整上传链路尚未通过，旧“限流导致”的说法没有充分证据，不作为已确认原因保留。
- 本轮复核相关 Jest：22 项通过、1 项失败；失败项为已验证研究方案 Markdown 报告的步骤保留。Python 特色任务合同 5 项通过；正式合成 PDF、DOCX、TXT、TeX 与研究方案夹具保留。本轮未改业务代码。
- 再次通过允许的自带浏览器入口确认，导航被保存的权限策略拒绝，并非连接失败；未证明用户主动拒绝，未定位安装版本的实际设置入口。关闭本轮临时标签页，没有切换入口绕过拒绝。
- 删除两项可再生成或无效的测试诊断产物及两项本轮可重建字节码。五组截图虽然内容相同，但扩大引用核对后发现仍被本地验收产物引用，保留完整引用关系；有效失败证据及开发服务运行所需目录保留。未删除固定 Chromium、业务文件、配置、数据库或上传资料，未做线上写入。
- 核对 AGENTS 中 Codex 自带浏览器优先、Edge/Chrome 回退与明确拒绝不得绕过的规则；本轮无长期规则变化，不重复改写 AGENTS。
- 已将未提交工作与本轮已确认记录保存为本地检查点；提交后检查工作树干净。检查点保留已知失败，不作发布候选通过结论，未推送或部署。

## 2026-10-17 — 生产静态资源恢复与上线后验收边界

- 生产发布器先以完整静态制品预检发现线上同名哈希资源漂移，按门禁停止且确认 `production_changed=false`；未覆盖漂移资源。
- 随后按最小范围分三次完成入口资源修复：补齐主脚本、主样式及 17 个缺失动态分包；每次均通过备份、独立恢复、迁移、依赖闭包、学术运行、前后台 smoke、公共访问和下载边界验证，最终发布结果为成功并清理 1 份旧备份。
- 只读 HTTP 与内容哈希复核确认生产脚本、样式和动态分包与本地构建一致；Cloudflare 仅刷新入口及本次同步资源，回读为成功且资源缓存重新命中源站。
- Codex 自带浏览器新标签稳定挂载正式 Lens 工作台；正式用户标签已刷新。页面标题保持 `Lens 学术GPT`，没有读取或输出账号、密钥、Cookie、token 或服务器入口。
- 正式站 TXT/TeX 文件选择器接收两个合成文件后，提交被套餐门禁导向升级页；没有把文件选择器状态、无错误响应或套餐页展示写成服务端保存、报告生成或下载通过。
- 本地发布器诊断修复通过：生产发布 32 项、生命周期 23 项、事务 51 项、安全工具 60 项、编译发布 9 项、增量迁移 63 项、依赖闭包 26 项、下载边界 21 项、发布 smoke 3 项、学术发布 13 项；需在推送前提交 3 个发布器诊断文件。
- 正式研究方案和特色能力仍因真实套餐/模型权益为 disabled，等待后台配置真实模型和权益后再复跑业务闭环；未猜测模型 ID、未写入假密钥。

## 2026-10-17 — Lens Logo 与 YutoGPT 资源统一

- 将 Lens 工作区、登录页、价格页和启动骨架使用的 Logo SVG 替换为 YutoGPT 当前 UI 使用的同一份资源，保留 Lens 产品文字。
- 将浏览器图标、Safari mask、PWA 图标和社交预览图统一到 YutoGPT 现有 Logo 资源，并把默认 favicon 路径切换到规范的 `/logo.svg`。
- Logo 资源一致性检查、品牌 SEO 回归、`chat` 类型检查、生产构建和 Codex 自带浏览器本地可视复核通过。
- Impeccable 检测仅报告启动页既有层级与浅色背景警告；本次未扩大到无关视觉重构。
- 本次改动尚未同步正式站；正式研究方案、特色能力和 TXT/TeX 服务端闭环仍等待真实套餐权益与模型连接。

## 2026-10-17 — Logo 正式站同步预检

- 运行 Lens 发布器只读预检时返回 `connection_blocked`；封闭结果确认 `production_changed=false`，未上传、未备份、未重启或修改线上状态。
- 未切换未受测连接入口，也未把本地构建或 GitHub 推送写成正式站已上线；Logo 正式站回读仍待连接恢复后执行。

## 2026-10-17 Logo 发布复核与固定资源事务修正

- 确认 Lens 主 Logo、favicon 对应 SVG 与 YutoGPT 原资源逐字节相同，本地套餐页实际加载的品牌 SVG 路径相同。
- 生产只读连接、静态根与私有存储预检通过；旧文件保留且源站、公网旧匿名下载被拒绝，之前的连接阻塞已不再成立。
- 官方生产依赖审计高危和严重为零，但低危与中危仍存在；上传配额及旧匿名下载拦截共 16 项在允许本机回环环境复验通过。
- 独立干净源码构建三端通过，三项前台合同检查通过；481 个批准制品文件和七个学术运行文件通过范围、哈希和来源证明校验。
- 首次发布在文件预检因固定名品牌资源覆盖规则停止，未切换生产；依赖闭包及数据库独立恢复验证通过，发布证据保留。
- 修正发布文件事务：仅十二个已审阅品牌资源进入既有原子替换、备份和回滚；哈希资源及未审阅固定名资源仍不可覆盖。新增四项文件系统回归通过，覆盖预检不修改、安装、独立恢复、失败回滚和不可覆盖边界；关联编译模块、发布事务、生产生命周期和控制器回归通过。
- 本地浏览器接收了两份合成 TXT/TeX 材料，但未取得足以证明完整研究报告的输出，因此完整报告与后续保存下载验收仍未确认完成。
- 窄范围发布工具修复经独立只读审查未发现实质问题；审查另复跑 13 项现有回归及六项合成边界检查通过，覆盖符号链接、硬链接、基线变化、新资源回滚删除和管理端保护。


## 2026-10-17 — 生产发布完成与研究报告下载闭环

- 以 481 个已校验制品执行正式发布；生产切换、唯一备份、独立数据库恢复、增量迁移、依赖闭包、学术运行、应用启动、smoke、公网主机和下载隔离全部通过，生产变更已确认。
- 正式站研究方案在刷新后可从研究记录重新打开，保存与持久化闭环已确认；旧文件仍保留且旧匿名下载继续被拒绝。
- 补充研究报告 HTML 下载控件，复用已清洗的可见报告片段与本地 Blob 下载，不新增服务端数据通道；五语言、类型检查、生产构建、研究合同、发布候选、品牌 SEO 和 Impeccable 检测通过。
- 当前下载控件尚未重新发布到生产；最终下载文件回读、Git 推送和收尾清理仍待完成。


## 2026-10-18 — Logo 一致性复核与后台补齐

- 重新核对前台工作区 SVG、公开 SVG/PNG 和 favicon，与 YutoGPT 原始资源逐字节一致；正式站公开 Logo 回读成功且字节相同。前台标题保持 `Lens 学术GPT`，品牌 SEO 检查通过。
- 发现后台 favicon 仍使用旧资源，已替换为同一原始 SVG；后台 Logo 组件使用本地原始品牌资源，保持既有布局与业务链路。后台类型检查、生产构建和差异格式检查通过；尚未同步正式站，也未把本轮登录后的后台 Logo 记为可见验收通过。
- Codex 自带浏览器确认本地工作区仍可见，内联 SVG 图片已加载；正式页面仍出现访问错误。安全发布器只读预检返回 `context_unavailable`，确认未修改生产且清理成功；没有更换连接策略或绕过访问防护。
- 覆盖更新 STATUS，移除下载按钮尚未发布等过期表述；报告真实下载及落盘回读依据上一轮已确认交接证据保留，当前访问异常与推送未完成仍明确列为待处理。
- 同步 Logo 使用原始资源的长期规则，未改变 Lens 产品文字及既定标题。


## 2026-10-18 — 学术验收合同修正复验

- 学术引擎隔离门禁改为按实际 multipart 请求字节生成合成身份签名，保留未签名上传拒绝、签名上传成功、临时资料权限和原始文件名下载拒绝等断言；在允许本机回环监听的环境复验通过，未调用外部模型或写业务数据。
- 上传控制器 AST 合同只匹配实际 `uploadFile` 方法，避免把其他已存在的上传方法合计为目标处理器；三个相关合同测试通过。
- 两处变更均只修正验收工具，不改变产品运行链路；差异格式检查通过。
- 新的受测只读分支诊断确认失败位于上下文捕获入口的兜底异常；没有生产变更，诊断连接材料清理成功。尚未据此判断具体生产配置故障。


## 2026-10-18 — 发布上下文发现与品牌资源复核

- 发布器改为识别已运行且身份校验通过的业务守护进程，保留默认回退、歧义拒绝、现有套接字和属主边界，不创建新守护进程。
- 新增十项合成发现回归；发布预检、生产发布、生命周期、安全连接、事务和清单相关回归均通过。生产只读预检通过，未修改生产。
- 统一前台登录页、套餐页与页头使用的 SVG 裁切范围，五处前后台品牌 SVG 与 YutoGPT 原文件逐字节一致；前后台类型检查和构建通过，本地套餐页已确认加载同一资源。
- 正式站公开 Logo 回读一致；首页当前仍返回访问拒绝，品牌更新尚未发布，不能据此宣称整站可用。

- Git 提交自动输出本机默认提交者标识，已停止后续外部操作；未复制标识，不能宣称平台历史已撤回。

## 2026-10-18 安全依赖候选通过与一次运行时采样

- 独立候选只调整服务及后台既有 workspace overrides 和锁文件，共四个依赖文件；未新增产品依赖或运行安装脚本。
- 服务构建、后台类型检查及构建、独立生产依赖安装与闭包校验通过。补齐候选遗漏的同级源码后，完整服务单元测试 27 组、357 项通过。
- 官方生产依赖复审：服务、后台高危与严重均为零；中危分别为 10 项和 1 项。补丁已合入本地，尚未部署。
- 已实际完成用户明确授权的一次生产 CPU 采样，临时调试入口关闭且清理验证通过；仅获得 Node 运行时热点分类，未确定故障根因。
- 采样前属主校验失败的尝试未开启调试。辅助进程降权逻辑经过五项合成校验，采样、失败清理、既有调试器保留和信号失败合同均通过后才执行获授权采样。
- 最新只读证据仍未发现业务监听；本轮未修改生产文件、未重启业务、未部署或推送。最终上线目标仍未完成。

## 2026-10-18 最终干净候选与当前阻塞

- 从安全依赖补丁已提交的干净基线重新归档源码，复用既有依赖，无新下载；三端构建与前后台类型检查五项全部通过。
- 481 项最终制品通过安全清单及打包校验；构建后输入源码逐字节一致，无输入缺失或源码改写。
- 当前只读发布预检通过，临时连接材料清理成功，生产未改动；该预检不替代真实应用就绪验收。
- 当前只读连接分类确认读取成功，但未发现业务监听、数据库、Redis 或其他 TCP 连接。受限独立加载进程在安全拦截处结束并已终止，未形成故障根因。
- 更精确的热点、应用调用区域及活动状态分类器通过四项合成合同；已请求第二次采样的单独许可，尚未执行。
- 两份过期无价值诊断文件已清理；最终候选、测试证据及受测诊断工具仍用于未完成的恢复发布验证，保留未删。未部署、未推送。

## 2026-10-18 精简未引用的 Node LangChain 遗留依赖

- Node 服务源码、运行脚本、配置入口及编译主入口均未引用 LangChain；在独立候选中移除六个未引用的直接依赖，未改动学术 Python 服务或业务代码。
- 锁文件移除 80 个包版本，无新增包版本，其余直接依赖版本未变。
- 独立候选服务构建、27 组共 357 项单元测试全部通过；编译主入口与精简前逐字节一致。
- 精简图的独立冻结生产安装及严格依赖闭包校验通过，闭包核验 674 个包；未放松校验规则。
- 官方 npm 生产复审：服务中危从 10 项降为 8 项，低危、高危及严重均为零。其余中危仍需逐项评估，不能称为零漏洞。
- 已合入并本地提交两份依赖文件。未改动生产文件、未重启业务、未部署或推送；原已验证制品保留，精简版本仍需形成新的干净发布制品。

## 2026-10-18 精简后的最终制品校验

- 精简提交建立的新干净源码归档与制品通过安全校验，共 481 项；输入源码无缺失、无改写。
- 服务产物采用本次重测候选；前后台 431 份输入文件逐字节确认未变化，复用此前已通过类型检查与构建的对应静态产物。
- 新生产依赖安装确认复用原内容缓存，严格闭包核验通过；未新增包版本或执行安装脚本。
- 本机前台及后台入口最新只读 HTTP 检查均正常响应，未重启服务；不将入口响应等同于业务验收。
- 第二次生产采样仍未获单独许可，未再次开启调试；生产启动故障未解决，未部署、未推送。


## 2026-10-18 — 私有运行目录归属修复与恢复核验

- 只读预演确认专用父目录仅含三个配置运行子目录，子目录均为空，四个目录无符号链接且模式符合私有要求；父子目录归属与应用身份不一致。
- 最小事务仅调整四个目录本身的归属，保持模式与文件内容不变；应用身份的私有配置校验及三个运行目录访问验证均通过。
- 实际嵌入修复事务通过十一项合同，涵盖成功、预演、幂等、边界拒绝、部分失败与验证失败回滚；实际验证子进程通过正常、非法配置和缺失目录三项合成测试，测试临时夹具已清理。
- 修复后核验确认同一进程短时稳定且数据库与 Redis 已连接，但尚未观察到业务监听或 HTTP 响应；没有据此认定服务恢复、完整验收通过或发布完成。
- 第二次 CPU 采样的调试入口清理已经确认，本次未追加采样。本机前后台 HTTP 访问正常，未停止或重启本机服务。
- 本次没有产品源码改动，没有新一轮制品部署或远端推送。


## 2026-10-18 — 注册入口发布回归与权限合同核验

- 纠正旧监听判断：管理进程持有集群监听；配置端点的实际 HTTP 核验已通过，“后端未监听”不再作为当前状态结论。
- 确认研究方案能力缺失来自注册入口遗漏。原学术实现文件已与候选匹配，注册入口未随原受审集合发布。
- 本地补齐注册入口在盘点、制品白名单、远端文件白名单和事务中的完整范围，移除事务中的固定旧制品数量假设。
- 新增真实事务回归：发布后研究方案可发现、恢复旧注册表，以及原注册文件缺失时恢复原缺失状态。先确认缺失制品合同导致测试失败，再修复并通过。
- 当前 17 组 Python 工具回归共 326 项通过；11 个独立 Node 测试脚本通过。完整生命周期输入式 Node 合成夹具由 Python 回归驱动并通过，直接无输入执行不属于有效测试方式。
- 新增只读身份合同核验：两个服务身份不同，现有私有目录和分别所属的配置满足运行访问要求；发布事务的同身份假设仍需修正，未据此宣称发布就绪。
- 保留真实浏览器中的合成验收草稿。本轮没有完成报告、服务端附件解析与下载验收，也没有新的生产部署或 Git 推送。完整上线目标保持进行中。


## 2026-10-18 研究响应中断取证与本地修复

- 生产上一轮发布事务的制品、备份与数据库恢复验证、依赖闭包、运行时、启动、公开页面、下载隔离及事务清理结果通过；最终业务验收与推送尚未完成。
- 用用户本轮唯一授权执行一次正式研究重试，确认插件、两份合成附件和合成问题随请求发送；收到首条准备提示后约两分钟无后续数据，浏览器报告 HTTP/2 传输中断，未出现完整报告与材料核对结果。
- 受测只读工具确认生产健康、内部鉴权、共享配置与私有下载边界仍通过；连接检查使用已授权的可信主机校验。
- 本地新增准备提示分类回归，防止将准备提示判为完整成功报告；新增单次研究响应定时心跳，随结束、断开或写入失败清理，不重置生成超时。
- 研究相关回归43项通过，包含原有结构化输出20项；服务端构建通过。新修复尚未发布，不把隔离测试等同于正式报告验收。

- 扩大检查中的本机配额与匿名下载套接字测试在沙箱内受限，获得本机监听能力后两组16项重跑全过；结合其余351项，当前有效单元门禁367项通过，无未解决断言失败。前端实际解析器确认心跳仅保留临时进度，不产生正文、报告文件或错误。

- 将研究响应心跳及准备提示分类修复提交后，从干净源码创建独立候选并构建。仅一个后端编译包变化，其余制品复用前完整性校验通过。
- 受测发布事务成功：制品、源码证明、备份及数据库恢复、依赖闭包、学术运行时、启动、公开页面和私有下载隔离均通过，未触发回滚或人工恢复；事务临时材料清理通过，删除一份旧备份。未把该删除计数当作全机备份总数证明。
- 已清理本轮八份过期测试输出，保留精简门禁摘要及当前候选证据。此前一次正式模型重试授权已使用，新的正式完整报告验收正在等待动作级授权；最终业务验收与推送仍未完成。


## 2026-10-18 收尾审查补充

- 对历史清理清单做闭合条件复核，仅删除五份可被当前门禁覆盖的旧测试报告；删除后检查通过，并保留脱敏计数与校验摘要。当前候选、恢复证据和受保护材料未删除。
- 本地诊断投影发生工具源码误输出，随即停止相关外部操作。生成该内容时未访问服务器或读取项目连接入口；随后在受控内存比对入口连接地址、私钥、密码及主机指纹，未发现匹配。仅记录脱敏事件，未复制误输出内容，不声称聊天或平台历史已删除。
- 新的正式报告验收仍待用户动作级授权；备份总数、剩余临时材料和推送尚未完成。


## 2026-10-18：备份只读盘点与工具接入

- 用户明确允许恢复一次服务器备份只读核验。本次复用项目安全入口解析器及已授权可信主机记录；服务器未修改、未删除、未上传。
- 新增封闭输出的备份盘点模块和安全连接入口；复用发布工具已有运行上下文发现机制，独立只读分支在发布预检、暂存及部署动作之前返回。
- 本次 Node 合成测试 11 项、Python 盘点及原发布工具回归 136 项全部通过，生成脚本语法检查通过。隔离调用测试禁止发布预检、命令执行和部署；合成临时目录在测试结束自动清理。
- 实际盘点完成且归属校验通过：备份目录 12 个，其中验证标记为通过的 1 个、未验证的 11 个；未知及不安全条目均为 0。验证标记不是独立恢复证明；最新发布事务的恢复验证证据另行保留。
- 本次未执行备份清理；清理符合条件的历史备份已另行请求授权。完整报告修复后的正式生成许可尚未收到，未再调用正式模型，未推送。


## 2026-10-18：只读盘点工具本地提交

- 再次运行只读盘点、生成脚本及发布工具回归，Node 11 项、Python 136 项全部通过。
- 只读盘点工具、安全连接入口、原发布工具的只读接入及相应测试共 7 个文件已完成本地提交，提交范围复核通过；未推送，未再次连接或修改服务器，未再次调用正式模型。
- 本轮复核未发现遗留的盘点合成临时目录。既有临时材料中未发现符合自动清理条件的旧成功测试报告；没有扩大删除范围。
- 正式完整报告重试及历史备份清理仍待各自明确授权。现有发布保留策略会跳过未验证历史备份，不能用普通发布事务代替对这 11 份的单独审查与清理。

## 2026-10-18 正式研究重试失败与备份条件核验

- 用户授权的一次正式研究方案重试已执行，生成结束后助手区域只显示服务不可用提示，没有完整报告；保存、重开、完整报告下载未验收通过。本次授权已消耗，未再调用模型。
- 只读复核正式学术服务健康、共享签名与未授权文件访问边界通过。无模型合成未知插件请求被正确拒绝；研究方案空输入请求也在模型执行前返回输入校验提示，请求前验证对应实现一致。
- 既有日志只按封闭布尔、计数和固定异常分类取证；观察到历史运行失败事件，但尚未证明真实报告失败根因。历史配置缺失标记不能作为本次根因。
- 补齐备份覆盖与条件保留工具及回归：Node 44 项、Python 142 项，合计 186 项通过，零失败。已授权条件清理实际删除 0 份，原验证备份保留。
- 盘点仍有 12 份备份，其中 1 份有验证标记，11 份未完成覆盖证明。10 份数据库不满足当前精确覆盖条件，另有一处未识别布局；此结果仅表示覆盖未证实，不代表已确认有独有业务数据。
- 本轮未修改线上业务代码、未重启线上服务、未推送。完整研究闭环、历史备份安全收敛和最终推送仍未完成。


## 2026-10-19 研究连接生命周期修复及发布复验

- 本机真实 HTTP 合成回归复现两个研究入口将正常请求体完成误判为断开，以及真实响应断开未取消任务；修正完成条件、补充响应关闭监听并清理。十项回归由四失败变为全部通过；学术链路 59 项、完整服务单元测试及构建通过。
- Codex 自带浏览器复核本地已有合成报告：TXT/TeX 引用、刷新保留、HTML 下载和落盘回读通过，未调用模型，未将其计为新版本的正式生成验收。
- 干净源码三端构建与前后台类型检查通过。首次候选遗漏独立实体模块，离线实际加载器复现拒绝；补齐 23 个实体及其基类、规范编译导入后，实际元数据加载通过且未初始化数据库。
- 新增实体元数据及基类缺失时的打包拒绝门禁，两项回归先失败后通过；更新合成制品夹具，去除固定数量假设。完整发布工具回归 360 项通过。
- 修正后的 482 项制品正式发布成功，备份及数据库独立恢复、依赖闭包、学术运行时、应用启动、公开页面与私有下载隔离均通过；未触发回滚或人工恢复，事务清理通过。
- 正式站浏览器工作区可见，既定品牌标题正确；没有把页面可访问等同于正式完整报告已通过。新的单次付费生成许可已请求，尚未追加调用。
- 官方 npm 生产依赖复查三端高危及严重均为零；中危为服务 8 项、前台 1 项、后台 1 项，未宣称零漏洞。
- 发布事务删除一份旧已验证备份，随后只读盘点仍有 12 份：1 份验证标记、11 份未验证，归属通过，未知与不安全条目为零。未删除缺少覆盖证据的历史备份。
- 连接修复、备份安全工具和打包门禁分别完成本地提交，尚未推送。失败候选及合成临时材料已清理，当前候选与恢复审计证据保留；本机前后台继续监听。
