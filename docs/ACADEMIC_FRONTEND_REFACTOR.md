# Lens 学术研究前端重构基线

## 目标

将 Lens 公网用户端重构为面向老师、学生和研究人员的学术研究工作区，复用现有 99AI/NestJS 后端与 `academic-4.0` 学术服务。产品名始终是 Lens，归属 YutoAI；“学术 GPT”只描述用途，不作为产品品牌。

前端技术栈固定为 Vue/Vite，并采用 `binary-husky/gpt_academic` 的 Gradio 左右研究工作台范式：研究记录为主区，研究输入、基础功能和函数插件集中在右侧操作区。Lens 保持自己的品牌、账号、后端契约和数据边界；Uvicorn 只运行学术 API。

## 最终不变量

- 公网用户端只保留 Lens 学术研究界面，不保留 99AI 通用工具货架。
- `service` 继续负责认证、会话、上传、下载、计费、订单、会员、模型、分享和前台配置。
- `academic-4.0` 继续负责论文、PDF、Word、LaTeX、润色、摘要和科研流程。
- `admin` 继续作为内部运营后台，不混入公网用户端。
- 用户历史会话、文件、订单、余额、分享链接和 SEO 静态页保持兼容。
- 用户端只运行 `chat` 的 Vue/Vite 应用；`chat/dist` 是唯一前端发布候选。
- 后端仍是权限、价格、扣费和数据的唯一真相源，前端不复制这些规则。

## 用户任务优先级

### P0：首版必须完整

1. 登录、会话恢复和新建研究。
2. 普通研究对话与长会话历史。
3. 上传论文后的问答、摘要、方法和结论解释。
4. PDF、Word、LaTeX 文件处理与下载结果。
5. 中文/英文润色和逐句修改对照。
6. 文献综述和多步科研流程。

### P1：核心稳定后接入

- 多篇论文比较。
- 来源整理和综述提纲。
- 可复用研究模板。
- 结构化研究笔记。
- 教学材料和课程内容辅助。

### P2：默认隐藏但暂不删除后端

- 代码项目分析。
- 联网搜索和多模型问询。
- Mermaid 图表、音频、图像和其他低频插件。
- 通用 App/应用市场能力。

P2 能力先移出主导航，待确认用户使用数据和调用方后，再决定是否永久移除。

## 目标界面

### 首页

- 直接显示最近研究和新建研究。
- 空状态只提供“读懂论文”“开始综述”“写作润色”“上传资料”四类入口。
- 不展示功能大全、营销 Hero、卡片矩阵或与研究无关的推荐。

### 研究工作区

- 主区：对话、文件、引用、公式、表格、代码和研究结果。
- 右侧操作区上部：文本输入、上传、模型和发送/停止。
- 右侧操作区下部：研究目标、基础能力、函数工具、步骤和下载结果。
- 项目：新建、搜索、最近、收藏和项目通过顶部按需抽屉进入，不挤占研究主区。
- 移动端：输入器回到底部，研究能力通过顶部按需抽屉进入。

### 研究目标

用户先选择自然语言目标，系统再映射到后端能力：

- 读懂这篇论文
- 比较这些论文
- 生成文献综述提纲
- 润色这段学术英文
- 翻译这个 LaTeX 项目
- 解释这段研究代码

不要求用户理解内部插件名、函数名、模型 key 或后端路由。

## 前端领域边界

```text
chat/
  src/views/workbench/                Lens 学术工作台（9002）
    ResearchWorkspace.vue             研究记录与操作区布局
    components/ResearchComposer.vue   研究输入与文件入口
    components/CapabilityPanel.vue    基础能力与函数工具
  src/api/academic.ts                 Academic 请求契约
  src/domain/research/                流事件与结果领域模型

academic-4.0/
  main.py                              FastAPI 学术执行入口（38000）
```

组件不能直接解析后端原始响应；所有后端数据先经过 Adapter 和领域模型。

## 后端契约分类

### 必须迁移并回归

- `/auth/*`
- `/chatlog/*`
- `/group/*`
- `/academic/chat-process`
- `/academic/workflow-process`
- `/academic/core-function-list`
- `/academic/plugin-list`
- `/upload/file`
- `/upload/file/download`
- `/balance/*`
- `/models/list`
- `/models/baseConfig`
- `/config/queryFront`
- `/config/notice`
- `/crami/queryAllPackage`
- `/order/*`
- `/share/create`
- `/share/:shareCode`

### 仅在明确需要时接入

- `/app/*`
- `/plugin/*`
- 微信绑定和登录接口
- TTS、PPT 封面等非核心能力

### 不得因删除用户端 UI 而删除

- 后端权限校验
- 计费与订单数据
- 用户历史会话
- 文件代理和下载结果
- 分享链路
- SEO 静态页和协议入口
- 内部 `admin` 运营能力

## NDJSON 流状态机

新前端必须由单一 Stream Reducer 处理流式响应：

```text
idle -> preparing -> streaming -> completing -> completed
                         |             |
                         +-> aborted   +-> failed
```

事件处理约定：

- `resetContent`：替换当前临时正文。
- `thinkingPreview`：只用于等待态进度，不进入最终正文。
- `progressText`：只更新当前阶段说明。
- `taskData`：更新科研工作流结构。
- `fileVectorResult`：更新文件结果和下载入口。
- `finalContent`：锁定最终展示正文。
- 流中断：保留已确认内容，提供可重试状态，不伪造成功。

任何流事件都不能重复扣费、覆盖历史正文或泄露内部路径、URL、堆栈和请求标识。

## 本地数据兼容

新前端必须迁移现有会话、模型、草稿、语言、主题、侧栏和研究选择状态。新键采用版本化命名，例如：

```text
lens.ui.v1
lens.session.v1
lens.composer.v1
lens.research.v1
```

旧数据只读迁移一次；迁移失败时安全回退，禁止清空用户本地状态。

## 旧用户端清理规则

2026-09-01 用户明确将“彻底废弃 99AI 前端、仅保留 99AI 后端”设为当前产品边界。旧用户端源码不再作为长期回滚资产；回滚应依赖 Git 历史和发布备份，不在活动源码树中保留废弃 UI。

已删除且禁止重新引入的前端专属文件包括：

- `chat/src/views/chat/components/AppList/index.vue`
- `chat/src/views/chat/components/AppTips/index.vue`
- `chat/src/views/chat/components/Welcome/index.vue`
- `chat/src/api/appStore.ts`
- `chat/src/store/modules/appStore/index.ts`
- `chat/src/api/plugin.ts`
- `chat/src/views/chat/components/sider/Plugin.vue`
- `chat/src/views/chat/components/AiBot/index.vue`
- `chat/src/views/chat/components/PresetHints/index.vue`

`service` 后端模块、历史 `appId` 字段、用户会话数据、订单、文件和后台运营能力不属于前端垃圾，继续保留。

以下是本次边界变更前使用过的历史删除门槛，留作审计背景，不再阻止本地旧 UI 清理：

旧 99AI 用户端只能在以下条件全部满足后删除：

1. 登录、会话、长会话、上传、下载、学术任务、工作流、会员、支付和分享全部通过回归。
2. 旧 localStorage、历史消息和 URL 兼容验证通过。
3. 新旧前端对关键 API 的请求语义和错误行为一致。
4. `chat/dist` 构建、`service/public/chat` 同步和线上回滚流程验证通过。
5. 新前端经过内部账号和真实用户观察周期。
6. 没有未确认的前端调用方、路由或静态资源依赖。

在此之前，只允许移除用户端入口或通过灰度开关隐藏，不允许删除后端能力和历史数据。

### 历史旧用户端待删除清单（已执行）

当前只允许把以下前端专属文件列为物理删除候选；删除前必须再次确认活动源码、路由和构建产物均无引用：

- `chat/src/views/chat/components/AppList/index.vue`
- `chat/src/views/chat/components/AppTips/index.vue`
- `chat/src/views/chat/components/Welcome/index.vue`
- `chat/src/api/appStore.ts`
- `chat/src/store/modules/appStore/index.ts`

`service/src/modules/app`、历史 `appId` 字段、用户会话数据和后台运营能力不属于该清单，不得因移除用户端 UI 一并删除。

## 验收门槛

### 功能

- 新用户 30 秒内能开始第一个研究任务。
- 论文上传后无需理解插件名称即可完成问答。
- 工作流最多三步可启动，始终显示当前阶段。
- 失败后可重试、保留中间结果或下载已有文件。

### 工程

- `vue-tsc`、生产构建和既有服务回归全部通过。
- 长会话 500/1000 条消息不出现明显卡死或滚动抖动。
- 流式中断、刷新恢复、重新生成和编辑行为稳定。
- 前端不硬编码价格、权限和扣费逻辑。

### 安全与体验

- 不在 URL、日志或界面暴露 token、路径、内部 URL、堆栈和请求 ID。
- 分享页面保持只读。
- 深色模式、移动端、键盘导航、焦点管理和对比度通过验收。
- SEO 静态页、canonical、sitemap、robots 和 llms 链路不受影响。

## 执行顺序

1. 保护当前脏工作树，建立可回滚基线。
2. 完成 API、NDJSON 和本地数据契约清单。
3. 搭建 Lens 学术研究前端骨架和设计 token。
4. 完成“登录 → 新建研究 → 上传论文 → 问答 → 结果 → 刷新恢复”闭环。
5. 迁移润色、综述、LaTeX 和科研工作流。
6. 完成移动端、深色模式、无障碍、性能和安全验收。
7. 灰度切换并验证回滚。
8. 观察稳定后，再删除旧 99AI 用户端实现。

## 已落地实现（2026-08-31）

- `chat/src/domain/research/ndjson.ts` 已提供独立的增量分帧器，仅处理网络分片与尾部残片，不承载业务语义。
- `chat/src/domain/research/contracts.ts` 已集中定义学术聊天、科研工作流请求结构与端点常量。
- `chat/src/api/academic.ts` 与 `chat/src/views/workbench/ResearchWorkspace.vue` 已接入上述契约，保持原请求地址、字段和消息解析行为不变。
- `chat/src/domain/research/storage.ts` 已建立 `lens.research.v1` 本地状态版本，并从旧 `chatStorage` 迁移研究相关偏好；旧键继续保留，避免历史会话被破坏。
- `chat/src/views/workbench/components/ResearchStart.vue` 已接入研究工作区视觉骨架：语义化入口标题、任务分区和主题令牌；不引入第二套部署入口。
- 空工作区的“提问/导入”按钮已接入现有 composer 聚焦与文件选择器，不复制上传和发送逻辑。
- `chat/src/domain/research/files.ts` 已统一研究文件字段解析与展示名清洗，空工作区和 Footer 共用，避免不同组件各自解析 `fileUrl`。
- `chat/src/domain/research/result.ts` 已提供纯结果生命周期 reducer，统一流式阶段、进度、最终正文和结构化结果标记；它不拼接文本，避免把展示层状态与事件语义耦合。
- `ResearchWorkspace.vue` 已接入结果 reducer 的正常完成、失败和中止保护；离线契约校验覆盖 reducer 生命周期，未改变后端接口或扣费语义。
- `chat/src/domain/research/starter.ts` 已将研究入口任务与阅读/写作/分析分区改为声明式领域配置，组件只负责翻译和交互；入口增加代码解释，并保留既有权限和能力列表匹配。
- 研究契约校验脚本已对入口配置做结构断言，防止任务 ID 重复或分区引用不存在的任务。
- `CapabilityPanel.vue` 已增加研究目标概览区，将当前能力或工作流步骤先以用户可理解的上下文呈现，再提供模式和能力选择；面板仍复用现有权限、能力列表与工作流 store。
- 本地浏览器只读验收已确认未登录空状态、研究任务描述、代码解释入口和能力面板提示均真实渲染；该验收不替代联网登录、上传和问答闭环。
- `chat/src/domain/research/sources.ts` 已统一来源领域解析和外链安全边界，消息组件不再自行解析检索 JSON；内部地址、凭据 URL 和无效结果不会进入可点击来源列表。
- 公网用户端已暂时隔离通用 `AppList` 入口：主布局不再渲染或动态加载应用广场，Header 不再提供其切换控件；源文件、后端能力和兼容状态保留，等待核心闭环与灰度观察后再删除。
- 浏览器只读复核确认默认主界面直接进入学术工作区，不显示应用广场入口；该验证不替代登录、上传和真实学术调用验收。
- 研究入口现已包含“开始文献综述”通用学术对话任务；它只设置用户目标和提示，不绑定某个可能缺失的后端插件，确保老师和学生始终能从综述任务开始。
- 浏览器只读验收已确认文献综述入口和用途描述真实渲染；联网调用与结果质量仍需真实后端环境验证。
- 消息结果层已依据既有状态字段显示进行中、完成和失败徽标，失败时保留重新生成操作；状态展示不复制后端权限或计费规则。
- 首轮键盘可达性已覆盖研究入口、能力模式、来源/下载/后续操作和滚动到底部；主要选择状态通过 `aria-pressed` 与 live status 暴露给辅助技术。
- 本地浏览器已只读确认空工作区入口行为；联网闭环尚未验收，因为本地开发服务器未连接后端，初始化请求返回服务不可用。
- `ResearchWorkspace.vue` 已增加初始化失败的可见恢复状态和重试入口，避免联调/灰度时把后端不可用误呈现为空白页面；不暴露内部错误细节。
- 联调前置条件已确认：本地 API 目标为 `127.0.0.1:9520`，当前无服务监听；后端启动受 Redis EPERM 限制，联网 E2E 需在允许本机依赖连接且不触碰线上数据的环境中执行。
- `chat/src/domain/research/stream.ts` 已将后端历史流字段统一为单一事件契约，并配套 `verify:research-contract` 离线校验；这为后续刷新恢复和结果上下文 reducer 提供稳定输入。
- 本阶段仍不删除旧 99AI 用户端、不修改后端、不部署；下一步进入布局骨架与版本化本地状态迁移设计。
- 2026-08-31：首轮键盘可达性和辅助技术语义已覆盖研究入口、能力面板、消息状态、来源/下载/后续操作及滚动到底部；研究输入框、导入资料区域和能力面板说明已改为多语言 locale，契约脚本对关键属性做静态回归。
- 2026-08-31：390×844 移动视口只读复核通过；本地 Playwright 学术回归暂未形成结论，原因是当前共享运行时缺少匹配的 `chromium_headless_shell`，且 Vite 联调目标未配置为有效 URL。该环境问题不改变线上契约，也未触发浏览器下载或线上操作。
- 2026-08-31：已修复 Vite 联调目标配置，代理优先读取 `VITE_GLOB_API_URL`，并保留旧变量和本机 9520 兜底；该修复仅改善本地联调，不改变生产 API 契约。
- 2026-08-31：Vite 客户端 API 前缀与开发代理 origin 已分离，proxy target 自动剥离 `/api`；Footer 不再在研究输入挂载时请求通用 `/app/list`，避免被隔离的应用货架返回结构影响学术主链路。
- 2026-08-31：仅本机 mock API 的浏览器闭环已确认研究首页、中文润色、刷新恢复、文献综述通用 chat 和 AppList 隔离；真实 9520/academic-4.0、上传和计费仍需独立回归。
- 2026-08-31：`service` TypeScript no-emit 与 Nest build 已通过；研究契约验证脚本同时校验 `academic.controller.ts` 的 chat、workflow、core-function-list、plugin-list 路由，作为前后端端点漂移的离线护栏。
- 2026-08-31：未登录状态不再在 Footer 挂载时预加载 Academic 能力列表，避免空状态产生无意义鉴权请求；登录后或用户选择具体任务时仍会按需加载。
- 2026-08-31：`MemberCenter.vue` 对签到接口返回值增加数组与字段归一化，异常配置不会再让非核心签到视图触发 `map/some` 类型错误；不改变签到接口或计费语义。
- 2026-08-31：扩展 `service/playwright/academic_regression.spec.cjs`，增加上传论文随学术请求提交、会员能力编排添加步骤并提交工作流两条浏览器回归场景；脚本通过 `node --check`，实际执行仍等待可用的匹配 Playwright headless shell。
- 2026-08-31：实际尝试运行 4 条 Academic 浏览器回归时，Playwright 仍寻找不存在的 `chromium_headless_shell-1169`，因此 4 条均未启动浏览器；已删除生成的 `service/test-results` 临时错误记录并关闭本地 Vite 服务，未下载浏览器或安装依赖。
- 2026-08-31：回归入口已与当前 AcademicGPT UI 对齐，不再依赖已移除的“学术模式切换”按钮，改由研究任务和能力选择进入 Academic 模式；4 条场景可被正确发现。
- 2026-08-31：研究本地状态迁移增加类型边界，隐藏回复索引只接受合法群组/回复 ID，异常旧 `chatStorage` 不会污染刷新恢复；契约验证、类型检查与 diff 校验通过。
- 2026-08-31：研究状态迁移进一步将活动会话、群组键和回复索引归一化为正整数，重复/非法 ID 丢弃；正常历史会话兼容不变。
- 2026-08-31：公网用户端已完成 99AI 应用市场调用链隔离：Footer 移除 `/app/*` 列表请求、`@应用` 搜索和应用选择；chatBase 移除 AppList/AppTips 挂载与应用配置弹窗；无消息会话统一进入 AcademicGPT 研究首页。旧 `appId` 仅作为历史兼容字段透传。
- 2026-08-31：旧 99AI 用户端源码/API/store 继续保留为回滚资产，不进入当前用户端挂载；依据删除门槛，真实后端、计费/分享、部署回滚和观察周期未完成前不物理删除。
- 2026-08-31：Playwright runner 已固定共享 Chromium 可执行文件；本机 mock AcademicGPT 回归 4/4 通过（编辑覆盖、润色刷新、论文上传、会员工作流），测试进程和临时产物已清理。
- 2026-08-31：契约验证、Vue 类型检查、生产构建和 diff 校验全部通过；生产构建仍有既有 chat store 动静态导入 warning，真实 9520/Redis/academic-4.0 联调仍待安全环境。
- 2026-08-31：活动用户端进一步移除 `showAppListComponent` 全局状态与切换动作；重建 `chat/dist` 未命中 `/app/list`、应用广场/市场或 `AppList` 字符串。旧前端文件仅保留为未挂载回滚资产，未提前违反删除门槛。
- 2026-08-31：当前工作树最终固定 Chromium 回归 4/4 通过（编辑覆盖、润色刷新、论文上传、会员工作流）；测试服务、临时进程和 `service/test-results` 均已清理。
- 2026-08-31：在 `service` 目录执行 `npm run build:test`（Nest webpack）复核成功；本轮未启动后端、未连接 Redis/MySQL 或触碰线上状态。
- 2026-08-31：新增 `service/scripts/academic_real_gate.mjs` 真实 Academic 认证预检门禁及 `test:academic-real-gate` 脚本；它通过外部短期 token 只读检查登录态、前台配置和能力列表，默认拒绝远端目标，不执行生成、上传、计费或业务写入。
- 2026-08-31：用假 token 对本机 service 验证真实预检失败路径：配置接口 200，认证与 Academic 能力接口 401，退出码和脱敏摘要符合预期；该验证不替代获授权账号的真实闭环。
- 2026-08-31：旧 `app-cat-store` 不再从活动 store 出口导出；未挂载的回滚 AppList 改为直接导入自身 store 以保持类型检查，生产构建和旧应用字符串扫描均通过。
- 2026-08-31：上述收口后固定 Chromium Academic mock 回归再次 4/4 通过；测试服务、端口、临时结果、残留 Chromium 进程和确认空的临时 profile 均已清理。
- 2026-08-31：研究契约校验新增活动入口白名单，静态拦截旧应用 API、`useAppCatStore`、AppList/AppTips 重新进入主入口；回滚源码仍保留且被明确排除。
- 2026-08-31：Academic 浏览器回归新增研究入口对论文速读、LaTeX 翻译的真实插件选择与请求字段断言；完整固定 Chromium mock 回归由 4 条扩展为 5 条并全部通过，覆盖按需加载、权限过滤和多语言显示。
- 2026-08-31：只读复核 academic-4.0 本机运行条件：系统 Python 3.12 可用，但现有虚拟环境仍为 Python 3.11.14；核心 Python 依赖可导入，38000 无监听。未启动或重建引擎，真实生成链路继续等待兼容运行时与获授权凭据。
- 2026-08-31：在隔离 `/tmp` 存储根并移除非法 `NO_PROXY` 条目的本机环境中完成 academic-4.0 能力枚举：核心能力接口返回 6 项，插件接口返回 28 项，包含论文速读、PDF 总结/深度理解、LaTeX 翻译/润色；服务已停止且临时目录已清理。该结果证明能力路由可用，不等同于真实账号生成、上传、计费或分享闭环通过。
- 2026-08-31：同一隔离环境完成 academic-4.0 文件契约回归：上传 `main.py` 返回 200/1 个文件，`/academic/file` 返回 200 且内容可读；服务已停止并清理隔离目录。该结果只证明学术服务文件路由可用，不替代 NestJS 鉴权后的真实用户上传闭环。
- 2026-08-31：前端门禁复核通过：契约验证、Vue 类型检查、Vite production build 与 diff 校验均成功；`chat/dist` 未命中旧 99AI 应用入口字符串，保留为部署契约产物。
- 2026-08-31：将 academic-4.0 能力与文件路由验证固化为 `service/scripts/academic_engine_contract_gate.mjs` / `test:academic-engine-contract` 自动门禁；它只在隔离存储根和本机随机端口运行，验证核心/插件列表及上传/文件读取，自动清理且不调用模型或业务写入。本轮回归通过。
- 2026-08-31：修正长会话压力测试统计不存在的旧 `.workspace-entry` 节点，改为检查 AcademicGPT `.workspace-record` 实际渲染窗口；新增 1000 条研究消息的窗口化、历史加载和输入交互回归，固定共享 Chromium 完整 6/6 通过（28.2 秒）。
- 2026-08-31：研究契约校验新增长会话选择器静态护栏，禁止压力测试回退到旧 `.workspace-entry`，确保窗口化断言绑定 AcademicGPT 实际 `.workspace-record`。
- 2026-08-31：AcademicGPT 活动输入区的操作文案与 aria-label 已统一接入五种 locale，覆盖展开/收起、资料上传、拖拽导入、发送/停止、推理和网络搜索；避免多语言用户落回中文硬编码。
- 2026-08-31：分享链接恢复为独立只读用户路径：`App.vue` 识别并校验 `?shareCode=`，调用既有 `/share/:shareCode` 后只挂载 `SharedHtmlView.vue`，不挂载聊天路由、登录初始化、缓存清理、可配置统计脚本、编辑、删除或重新生成操作。分享 iframe 禁止脚本、表单和弹窗；创建/读取分享的 API 响应已改为显式类型。该实现通过离线契约、类型检查和生产构建，但真实账号创建分享与线上链接仍在删除门禁内待验收。
- 2026-08-31：AcademicGPT 结果区新增“分享研究结果”动作，复用 `/share/create`，将已渲染的安全结果包裹为只读 HTML 并复制后端返回链接；操作仅新增分享请求，不改变会话、消息或计费字段。mock 回归覆盖创建请求结构，真实账号创建与线上打开仍待验收。
- 2026-08-31：分享创建前新增浏览器端 HTML 白名单清洗，移除脚本、iframe/object/embed、表单、style、事件属性和不安全 URL，仅保留论文结果所需的文本、表格、代码、图片与安全链接；服务端原有清洗继续保留，形成双层边界。
- 2026-08-31：将分享清洗与文档生成抽离为 `chat/src/domain/research/share.ts` 领域模块，消息组件不再承载安全策略；契约脚本在无浏览器 DOM 的环境中直接验证 fallback 清洗结果，确保规则可执行、可回归。
- 2026-08-31：分享 mock 回归进一步断言结果区按钮会提交包含 `<article>` 和研究结果正文的 `/share/create` 请求，并确认不会触发普通 `/chatgpt/chat-process`；实际浏览器运行仍受固定 Chromium `SIGABRT` 预检阻塞。
- 2026-08-31：分享只读场景已加入 Academic mock 浏览器回归，覆盖有效/非法分享码，断言不会挂载 `.workspace-home`、研究输入框或编辑/删除/重新生成操作，并验证 iframe sandbox 与 `/share/:shareCode` 请求；固定共享 Chromium 当前在 headless 预检阶段 `SIGABRT`，所以本轮只有脚本/契约证据，没有浏览器运行结论。
- 2026-09-01：新增 `chat/scripts/verify_academic_release_candidate.mjs` 发布候选门禁，产物级检查账号、会话、文件、余额/订单、分享与 Academic 端点，禁止旧应用货架 UI/API、敏感路径/凭据标记、source map、缺失静态资源和越界引用；`--mirror` 模式会逐文件验证部署镜像，同时允许保留旧哈希资源用于零停机回滚。
- 2026-09-01：`build.sh` 已在 chat 构建后、同步至 `service/public/chat` 后、生成 `AIWebQuickDeploy/public/chat` 后分别执行候选/镜像门禁，失败时不会继续启动服务。首轮门禁发现并修复 Safari mask icon 指向不存在子目录的问题；当前 `chat/dist` 候选通过，仓库内 `service/public/chat` 仍是未同步的旧镜像，本轮未执行部署。
- 2026-09-01：新增 `service/scripts/sync_static_release.mjs`，将 chat 静态同步收敛为受限发布原语：目标只能是 `public/chat`，备份只能是 `.release-backups/chat-latest`，候选/目标/备份不得嵌套；同步前覆盖保留唯一完整备份，资源先复制，`index.html` 最后原子替换，旧哈希文件不删除。`build.sh` 已改用该发布器，并提供 `rollback:chat-static` 恢复入口。
- 2026-09-01：在 `/tmp` 用当前旧 `service/public/chat` 与新 `chat/dist` 完成切换/镜像校验/回滚演练；新入口哈希与候选一致，回滚后旧入口哈希精确恢复，临时 index/backup staging 无残留。演练目录已清理，未操作服务器；线上灰度、HTTP 回查和观察期仍需单独授权执行。
- 2026-09-01：上述发布/回滚不再只依赖手工演练；新增 `static_release_contract_gate.mjs` 自动覆盖备份、稳定文件切换、旧哈希保留、入口回滚、受限路径和 staging 清理，并在 `build.sh` 真正同步 `service/public/chat` 前强制执行。
- 2026-09-01：将 `academic_real_gate.mjs` 扩展为授权账号的 10 步只读预检，覆盖认证、配置、会话/历史、余额、模型、套餐、Academic 能力和可选既有分享；远端强制 HTTPS 与显式开关，拒绝 URL 凭据、非法分享码、重定向和无界超时，明确不调用生成、上传、订单、创建会话或分享创建。
- 2026-09-01：新增可注入 fetch 的 `academic_real_gate_contract.mjs`，离线证明上述读取路径与零写入边界，并接入 `build.sh` 静态同步前门禁。真实短期 token 尚未注入，因此该结果只证明验收器本身安全可执行，不代替真实账号回归。
- 2026-09-01：新增 `academic_controlled_write_gate.mjs` 作为动作级授权后的最小业务验收器：绑定 token subject 与指定测试用户、固定模型、明确 `charged/free` 计费预期和确认口令，只创建单个临时研究会话、执行一次 Academic 请求、验证余额/用量方向并在 finally 删除会话；不包含订单、支付、套餐、卡密、数据库或批量删除。
- 2026-09-01：上传与分享创建因缺少用户侧删除 API，默认关闭且要求第二个残留确认；输出仅保留引用哈希。`academic_controlled_write_gate_contract.mjs` 已离线验证默认零残留、成功/失败/计费不符均清理会话、残留门禁、远端主机锁定和高风险端点零调用，并接入 `build.sh`。本轮没有真实执行该写入门禁。
- 2026-09-01：新增 `verify_legacy_removal_ready.mjs` 删除就绪门禁与 `test:legacy-removal-gate`：检查五个旧 99AI 回滚资产、活动源码和 `chat/dist` 的零引用、候选/部署镜像逐文件哈希一致、候选文件清单哈希、八类真实验收证据、`allowRemoval`/审批人和至少 24 小时观察期；门禁非破坏性地固定返回 `canDelete:false`，不负责物理删除。当前由于缺少删除证据文件而拒绝通过，活动源码 120 个文件已扫描干净。
