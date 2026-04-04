import {
  fetchCreateGroupAPI,
  fetchDelAllGroupAPI,
  fetchDelGroupAPI,
  fetchQueryGroupAPI,
  fetchUpdateGroupAPI,
} from '@/api/group'
import { defineStore } from 'pinia'
import { getLocalState, setLocalState } from './helper'

import {
  fetchDelChatLogAPI,
  fetchDelChatLogByGroupIdAPI,
  fetchDeleteGroupChatsAfterIdAPI,
  fetchQueryChatLogListAPI,
} from '@/api/chatLog'
import { fetchModelBaseConfigAPI } from '@/api/models'
import { fetchQueryPluginsAPI } from '@/api/plugin'
import { fetchAcademicCoreFunctionList, fetchAcademicPluginList } from '@/api/academic'
import { useGlobalStoreWithOut } from '@/store'
import { getToken } from '../auth/helper'

const useGlobalStore = useGlobalStoreWithOut()
const CHAT_HISTORY_PAGE_SIZE = 80
const CHAT_RENDER_WINDOW_LIMIT = 1200

export const useChatStore = defineStore('chat-store', {
  state: (): Chat.ChatState => getLocalState(),

  getters: {
    /* 当前选用模型的配置 */
    activeConfig: state => {
      const uuid = state.active
      if (!uuid) return {}
      const config = state.groupList.find(item => item.uuid === uuid)?.config
      const parsedConfig = config ? JSON.parse(config) : state.baseConfig

      return parsedConfig
    },

    activeGroupAppId: state => {
      const uuid = state.active
      if (!uuid) return null
      return state.groupList.find(item => item.uuid === uuid)?.appId
    },

    activeGroupFileUrl: state => {
      const uuid = state.active
      if (!uuid) return null
      return state.groupList.find(item => item.uuid === uuid)?.fileUrl
    },

    /* 当前选用模型的名称 */
    activeModel(state) {
      return this.activeConfig?.modelInfo?.model
    },

    /* 当前选用模型的名称 */
    activeModelName(state) {
      return this.activeConfig?.modelInfo?.modelName
    },

    /* 当前选用模型的名称 */
    activeModelAvatar(state) {
      return this.activeConfig?.modelInfo?.modelAvatar
    },

    /* 当前选用模型的扣费类型 */
    activeModelDeductType(state) {
      return this.activeConfig?.modelInfo?.deductType
    },

    /* 当前选用模型的模型类型 */
    activeModelKeyType(state) {
      return this.activeConfig?.modelInfo?.keyType
    },

    /* 当前选用模型支持上传文件的格式 */
    activeModelFileUpload(state) {
      return this.activeConfig?.modelInfo?.isFileUpload
    },

    /* 当前选用模型的调用价格 */
    activeModelPrice(state) {
      return this.activeConfig?.modelInfo?.deduct
    },
  },

  actions: {
    normalizeChatRows(rows: any[]) {
      return (Array.isArray(rows) ? rows : []).map((item: any) => ({
        ...item,
        fileUrl: item.fileUrl ?? item.file_url ?? '',
        imageUrl: item.imageUrl ?? item.image_url ?? '',
        reasoningText: item.reasoningText ?? item.reasoning_text ?? '',
        networkSearchResult: item.networkSearchResult ?? item.network_search_result ?? '',
        fileVectorResult: item.fileVectorResult ?? item.file_vector_result ?? '',
      }))
    },

    mergeChatRows(existingRows: Chat.Chat[], incomingRows: Chat.Chat[]) {
      const merged = [...incomingRows, ...existingRows]
      const seen = new Set<string>()
      return merged.filter(item => {
        const key = String(item?.chatId || '')
        if (!key) return true
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    },

    trimChatWindowIfNeeded() {
      if (!Array.isArray(this.chatList) || this.chatList.length <= CHAT_RENDER_WINDOW_LIMIT) return
      const trimmed = this.chatList.slice(-CHAT_RENDER_WINDOW_LIMIT)
      this.chatList = trimmed
      const earliestChatId = Number(trimmed[0]?.chatId || 0)
      if (earliestChatId > 0) {
        this.chatHistoryHasMore = true
        this.chatHistoryCursor = earliestChatId
      }
    },

    resetChatHistoryState() {
      this.chatHistoryHasMore = false
      this.chatHistoryLoading = false
      this.chatHistoryCursor = 0
    },

    normalizeAcademicSelectorName(value: any) {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
    },

    isSameAcademicSelector(a: any, b: any) {
      const keysA = [a?.name, a?.displayName, a?.originName]
        .map(item => this.normalizeAcademicSelectorName(item))
        .filter(Boolean)
      const keysB = [b?.name, b?.displayName, b?.originName]
        .map(item => this.normalizeAcademicSelectorName(item))
        .filter(Boolean)
      if (!keysA.length || !keysB.length) return false
      return keysA.some(key => keysB.includes(key))
    },

    reconcileAcademicSelectionState() {
      if (this.currentAcademicPlugin) {
        const matchedPlugin = (this.academicPluginList || []).find((item: any) =>
          this.isSameAcademicSelector(item, this.currentAcademicPlugin)
        )
        if (matchedPlugin) {
          this.currentAcademicPlugin = matchedPlugin
        } else {
          this.currentAcademicPlugin = undefined
          this.academicPluginArgs = ''
        }
      }
      if (this.currentAcademicCore) {
        const matchedCore = (this.academicCoreFunctions || []).find((item: any) =>
          this.isSameAcademicSelector(item, this.currentAcademicCore)
        )
        if (matchedCore) {
          this.currentAcademicCore = matchedCore
        } else {
          this.currentAcademicCore = undefined
        }
      }
    },

    async queryAcademicPluginList() {
      try {
        const res: any = await fetchAcademicPluginList()
        const rows = Array.isArray(res?.rows)
          ? res.rows
          : Array.isArray(res?.data?.rows)
            ? res.data.rows
            : []
        const renameMap: Record<string, string> = {
          [this.normalizeAcademicSelectorName(
            '一键下载arxiv论文并翻译摘要（先在input输入编号，如1812.10695）'
          )]: 'Arxiv摘要',
          [this.normalizeAcademicSelectorName('PDF批量总结')]: 'PDF 批量总结',
          [this.normalizeAcademicSelectorName('PDF深度理解')]: 'PDF 深度理解',
          [this.normalizeAcademicSelectorName('Word批量总结')]: 'Word 批量总结',
          [this.normalizeAcademicSelectorName('Arxiv论文下载')]: 'Arxiv摘要',
          [this.normalizeAcademicSelectorName('Arxiv精准翻译')]: 'Arxiv 英文摘要',
          [this.normalizeAcademicSelectorName('Arxiv英文摘要')]: 'Arxiv 英文摘要',
          [this.normalizeAcademicSelectorName('Arxiv精准翻译（输入arxivID）')]: 'Arxiv 英文摘要',
          [this.normalizeAcademicSelectorName('LaTeX摘要')]: 'LaTeX 摘要',
          [this.normalizeAcademicSelectorName('LaTeX精准翻译')]: 'LaTeX 精准翻译',
          [this.normalizeAcademicSelectorName('LaTeX英文润色')]: 'LaTeX 英文润色',
          [this.normalizeAcademicSelectorName('LaTeX中文润色')]: 'LaTeX 中文润色',
          [this.normalizeAcademicSelectorName('LaTeX高亮纠错')]: 'LaTeX 高亮纠错',
        }
        this.academicPluginList = rows.map((item: any) => {
          const plugin = {
            ...item,
            originName: String(item?.originName || item?.name || ''),
          }
          const normalized = this.normalizeAcademicSelectorName(
            plugin.displayName || plugin.name || ''
          )
          if (renameMap[normalized]) {
            plugin.displayName = renameMap[normalized]
          }
          return plugin
        })
      } catch (error) {}
      this.reconcileAcademicSelectionState()
    },

    async queryAcademicCoreFunctions() {
      const fallbackCore = [
        { name: '中文润色', description: '中文学术表达润色与结构优化' },
        { name: '英文润色', description: '英文论文润色与语法优化' },
        { name: '绘制脑图', description: '将文本总结为结构化脑图' },
        { name: '中英互译', description: '学术场景中英文互译' },
        { name: '参考文献转Bib', description: '将参考文献转换为BibTeX' },
        { name: '学术型代码解释', description: '解释代码含义与逻辑' },
      ]
      try {
        const res: any = await fetchAcademicCoreFunctionList()
        const rows = Array.isArray(res?.rows)
          ? res.rows
          : Array.isArray(res?.data?.rows)
            ? res.data.rows
            : []
        if (Array.isArray(rows) && rows.length) {
          const names = rows.map((item: any) => String(item?.name || ''))
          const legacyFallback = ['文献综述', '研究设计', '论文润色']
          const isLegacy =
            names.length <= 3 && names.every((n: string) => legacyFallback.includes(n))
          this.academicCoreFunctions = isLegacy ? fallbackCore : rows
          this.reconcileAcademicSelectionState()
          return
        }
      } catch (error) {}
      this.academicCoreFunctions = fallbackCore
      this.reconcileAcademicSelectionState()
    },

    setAcademicMode(enabled: boolean) {
      this.academicMode = true
      if (enabled) {
        this.mobileAcademicPanelVisible = true
      }
    },

    setMobileAcademicPanelVisible(visible: boolean) {
      this.mobileAcademicPanelVisible = visible
    },

    setAcademicPlugin(plugin: any) {
      const prevName = String(
        this.currentAcademicPlugin?.name || this.currentAcademicPlugin?.displayName || ''
      )
      const nextName = String(plugin?.name || plugin?.displayName || '')
      this.currentAcademicPlugin = plugin || undefined
      if (plugin) {
        this.academicMode = true
        this.mobileAcademicPanelVisible = true
        this.academicWorkflowEnabled = false
        this.academicWorkflowRunning = false
        this.academicWorkflowSteps = []
        this.currentAcademicCore = undefined
        // 切换插件时清空自定义指令，避免将旧插件提示词污染到新插件。
        if (prevName !== nextName) {
          this.academicPluginArgs = ''
        }
      } else {
        this.academicPluginArgs = ''
      }
    },

    setAcademicCore(coreFn: any) {
      this.currentAcademicCore = coreFn || undefined
      if (coreFn) {
        this.academicMode = true
        this.mobileAcademicPanelVisible = true
        this.academicWorkflowEnabled = false
        this.academicWorkflowRunning = false
        this.academicWorkflowSteps = []
        this.currentAcademicPlugin = undefined
        this.academicPluginArgs = ''
      }
    },

    setAcademicWorkflowEnabled(enabled: boolean) {
      this.academicWorkflowEnabled = Boolean(enabled)
      if (enabled) {
        this.academicMode = true
        this.mobileAcademicPanelVisible = true
      } else {
        this.academicWorkflowRunning = false
      }
      this.recordState()
    },

    setAcademicWorkflowRunning(running: boolean) {
      this.academicWorkflowRunning = Boolean(running)
      this.recordState()
    },

    setAcademicWorkflowSteps(steps: Chat.AcademicWorkflowStep[]) {
      this.academicWorkflowSteps = (Array.isArray(steps) ? steps : [])
        .slice(0, 3)
        .map(step => ({
          kind: step?.kind === 'plugin' ? 'plugin' : 'core',
          name: String(step?.name || '').trim(),
          displayName: String(step?.displayName || step?.name || '').trim(),
          args: String(step?.args || '').trim(),
        }))
      if (this.academicWorkflowSteps.length) {
        this.academicWorkflowEnabled = true
        this.academicMode = true
        this.mobileAcademicPanelVisible = true
      }
      this.recordState()
    },

    addAcademicWorkflowStep(step?: Partial<Chat.AcademicWorkflowStep>) {
      const current = Array.isArray(this.academicWorkflowSteps) ? [...this.academicWorkflowSteps] : []
      if (current.length >= 3) return
      current.push({
        kind: step?.kind === 'plugin' ? 'plugin' : 'core',
        name: String(step?.name || '').trim(),
        displayName: String(step?.displayName || step?.name || '').trim(),
        args: String(step?.args || '').trim(),
      })
      this.setAcademicWorkflowSteps(current)
    },

    updateAcademicWorkflowStep(index: number, patch: Partial<Chat.AcademicWorkflowStep>) {
      if (!Array.isArray(this.academicWorkflowSteps)) return
      const next = [...this.academicWorkflowSteps]
      if (!next[index]) return
      next[index] = {
        ...next[index],
        ...patch,
        kind: patch?.kind === 'plugin' ? 'plugin' : patch?.kind === 'core' ? 'core' : next[index].kind,
        name: String((patch?.name ?? next[index].name) || '').trim(),
        displayName: String((patch?.displayName ?? next[index].displayName ?? patch?.name ?? next[index].name) || '').trim(),
        args: String((patch?.args ?? next[index].args) || '').trim(),
      }
      this.setAcademicWorkflowSteps(next)
    },

    removeAcademicWorkflowStep(index: number) {
      if (!Array.isArray(this.academicWorkflowSteps)) return
      const next = [...this.academicWorkflowSteps]
      next.splice(index, 1)
      this.academicWorkflowSteps = next
      if (!next.length) {
        this.academicWorkflowEnabled = false
        this.academicWorkflowRunning = false
      }
      this.recordState()
    },

    moveAcademicWorkflowStep(index: number, direction: -1 | 1) {
      if (!Array.isArray(this.academicWorkflowSteps)) return
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= this.academicWorkflowSteps.length) return
      const next = [...this.academicWorkflowSteps]
      ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
      this.academicWorkflowSteps = next
      this.recordState()
    },

    clearAcademicWorkflow() {
      this.academicWorkflowEnabled = false
      this.academicWorkflowRunning = false
      this.academicWorkflowSteps = []
      this.recordState()
    },

    setAcademicPluginArgs(args: string) {
      this.academicPluginArgs = args || ''
    },

    /* 查询插件列表 */
    async queryPlugins() {
      try {
        const res: any = await fetchQueryPluginsAPI()
        if (res.success && res.code === 200) {
          // 过滤掉不启用的插件并只保留需要的字段
          this.pluginList = res.data.rows
            .filter((plugin: any) => plugin.isEnabled === 1)
            .map((plugin: any) => ({
              pluginId: plugin.id,
              pluginName: plugin.name,
              description: plugin.description,
              pluginImg: plugin.pluginImg,
              parameters: plugin.parameters,
              deductType: plugin.deductType,
              drawingType: plugin.drawingType,
              modelType: plugin.modelType,
            }))
        } else {
        }
      } catch (error) {}
    },

    /* 对话组过滤 */
    setGroupKeyWord(keyWord: string) {
      this.groupKeyWord = keyWord
    },

    /* 计算拿到当前选择的对话组信息 */
    getChatByGroupInfo() {
      if (this.active) return this.groupList.find(item => item.uuid === this.active)
    },

    /*  */
    getConfigFromUuid(uuid: any) {
      return this.groupList.find(item => item.uuid === uuid)?.config
    },

    /* 新增新的对话组 */
    async addNewChatGroup(appId = 0, modelConfig?: any, params?: string) {
      if (!getToken()) return
      try {
        let finalModelConfig = modelConfig
        if (!finalModelConfig && this.preferredModel?.value) {
          const preferred = this.preferredModel
          finalModelConfig = {
            modelInfo: {
              model: preferred.value,
              modelName: preferred.label,
              keyType: preferred.keyType,
              deductType: preferred.deductType,
              deduct: preferred.deduct,
              isFileUpload: preferred.isFileUpload,
              isImageUpload: preferred.isImageUpload,
              isNetworkSearch: preferred.isNetworkSearch,
              deepThinkingType: preferred.deepThinkingType,
              isMcpTool: preferred.isMcpTool,
              modelAvatar: preferred.modelAvatar || '',
              modelDescription: preferred.modelDescription || '',
            },
            fileInfo: {},
          }
        }
        const res: any = await fetchCreateGroupAPI({
          appId,
          modelConfig: finalModelConfig,
          params,
        })

        this.active = res.data.id
        this.usingNetwork = false
        this.usingDeepThinking = false
        this.usingMcpTool = false
        this.recordState()

        await this.queryMyGroup()

        await this.setActiveGroup(res.data.id)
      } catch (error) {}
    },

    /* 查询基础模型配置  */
    async getBaseModelConfig() {
      const res = await fetchModelBaseConfigAPI()
      this.baseConfig = res?.data
    },

    /* 查询我的对话组 */
    async queryMyGroup() {
      if (!getToken()) {
        this.groupList = []
        this.chatList = []
        this.active = 0
        this.resetChatHistoryState()
        this.recordState()
        return
      }
      const res: any = await fetchQueryGroupAPI()
      this.groupList = [
        ...res.data.map((item: any) => {
          const {
            id: uuid,
            title,
            isSticky,
            createdAt,
            updatedAt,
            appId,
            config,
            appLogo,
            isFixedModel,
            isGpts,
            params,
            fileUrl,
            content,
            appModel,
          } = item
          return {
            uuid,
            title,
            isEdit: false,
            appId,
            config,
            isSticky,
            appLogo,
            createdAt,
            isFixedModel,
            isGpts,
            params,
            fileUrl,
            content,
            appModel,
            updatedAt: new Date(updatedAt).getTime(),
          }
        }),
      ]

      const isHasActive = this.groupList.some(
        (item: { uuid: any }) => Number(item.uuid) === Number(this.active)
      )
      if (!this.active || !isHasActive) {
        this.groupList.length && this.setActiveGroup(this.groupList[0].uuid)
      }
      // 如果 groupList 为空，新建一个对话组
      if (this.groupList.length === 0) {
        await this.addNewChatGroup()
      }
      this.recordState()
    },

    /* 修改对话组信息 */
    async updateGroupInfo(params: {
      groupId: number
      title?: string
      isSticky?: boolean
      fileUrl?: string
    }) {
      await fetchUpdateGroupAPI(params)
      await this.queryMyGroup()
    },

    /* 变更对话组 */
    // 设置当前激活的对话组
    async setActiveGroup(uuid: number) {
      useGlobalStore.updateShowAppListComponent(false)
      // useGlobalStore.updateImagePreviewer(false)
      // this.chatList = [];
      this.active = uuid
      this.resetChatHistoryState()

      this.groupList.forEach(item => (item.isEdit = false))
      await this.queryActiveChatLogList()
      if (!this.active) {
        this.chatList = []
      }
      this.active = uuid
      // 记录当前状态
      this.recordState()
    },

    /* 删除对话组 */
    async deleteGroup(params: Chat.History) {
      const curIndex = this.groupList.findIndex(item => item.uuid === params.uuid)
      const { uuid: groupId } = params
      await fetchDelGroupAPI({ groupId })
      await this.queryMyGroup()
      if (this.groupList.length === 0) await this.setActiveGroup(0)

      if (curIndex > 0 && curIndex < this.groupList.length)
        await this.setActiveGroup(this.groupList[curIndex].uuid)

      if (curIndex === 0 && this.groupList.length > 0)
        await this.setActiveGroup(this.groupList[0].uuid)

      if (curIndex > this.groupList.length || (curIndex === 0 && this.groupList.length === 0))
        await this.setActiveGroup(0)

      if (curIndex > 0 && curIndex === this.groupList.length)
        await this.setActiveGroup(this.groupList[curIndex - 1].uuid)

      this.recordState()
    },

    /* 删除全部非置顶对话组 */
    async delAllGroup() {
      if (!this.active || !this.groupList.length) return
      await fetchDelAllGroupAPI()
      await this.queryMyGroup()
      if (this.groupList.length === 0) await this.setActiveGroup(0)
      else await this.setActiveGroup(this.groupList[0].uuid)
    },

    // /* 查询当前对话组的聊天记录 */
    // async queryActiveChatLogList() {
    //   if (!this.active || Number(this.active) === 0) return;
    //   const res: any = await fetchQueryChatLogListAPI({ groupId: this.active });
    //   this.chatList = res.data;
    //   this.recordState();
    // },

    /* 查询当前对话组的聊天记录 */
    /* 查询当前对话组的聊天记录 */
    async queryActiveChatLogList(loadMore = false) {
      // 如果没有激活的对话组，或者 groupId 为 0，则不进行查询
      if (!this.active || Number(this.active) === 0) {
        this.chatList = [] // 确保没有数据时清空 chatList
        this.resetChatHistoryState()
        return
      }
      if (this.chatHistoryLoading) return
      if (loadMore && !this.chatHistoryHasMore) return

      this.chatHistoryLoading = true
      try {
        // 调用 API 查询聊天记录
        const res: any = await fetchQueryChatLogListAPI({
          groupId: this.active,
          size: CHAT_HISTORY_PAGE_SIZE,
          beforeChatId: loadMore ? this.chatHistoryCursor : undefined,
        })

        const payload = res?.data
        const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.rows) ? payload.rows : []
        const normalizedList = this.normalizeChatRows(rows)
        const normalizedWithHiddenFilter = this.applyHiddenReplyFilter(normalizedList, Number(this.active))

        if (Array.isArray(payload)) {
          this.chatList = normalizedWithHiddenFilter
          this.chatHistoryHasMore = false
          this.chatHistoryCursor = Number(this.chatList[0]?.chatId || 0)
          this.trimChatWindowIfNeeded()
          return
        }

        // 检查响应数据并更新 chatList
        if (normalizedWithHiddenFilter.length) {
          this.chatList = loadMore
            ? this.mergeChatRows(this.chatList, normalizedWithHiddenFilter)
            : normalizedWithHiddenFilter
          this.chatHistoryHasMore = Boolean(payload?.hasMore)
          this.chatHistoryCursor = Number(
            payload?.nextBeforeChatId || this.chatList[0]?.chatId || 0
          )
          if (!loadMore) {
            this.trimChatWindowIfNeeded()
          }
        } else {
          if (!loadMore) {
            this.chatList = [] // 如果没有数据，确保 chatList 为空数组
          }
          this.chatHistoryHasMore = false
          this.chatHistoryCursor = Number(this.chatList[0]?.chatId || 0)
        }
      } catch (error) {
        // 捕获错误并处理

        if (!loadMore) {
          this.chatList = [] // 出错时清空 chatList
          this.chatHistoryHasMore = false
          this.chatHistoryCursor = 0
        }
      } finally {
        // 无论成功还是失败，都调用 recordState
        this.chatHistoryLoading = false
        this.recordState()
      }
    },

    /* 添加一条虚拟的对话记录 */
    addGroupChat(data: Chat.Chat) {
      this.chatList = [...this.chatList, data]
      this.trimChatWindowIfNeeded()
    },

    /* 动态修改对话记录 */
    updateGroupChat(index: number, data: Chat.Chat) {
      this.chatList[index] = { ...this.chatList[index], ...data }
    },

    /* 修改其中部分内容 */
    updateGroupChatSome(index: number, data: Partial<Chat.Chat>) {
      this.chatList[index] = { ...this.chatList[index], ...data }
    },

    /* 删除一条对话记录 */
    async deleteChatById(chatId: number | undefined) {
      if (!chatId) return
      await fetchDelChatLogAPI({ id: chatId })
      await this.queryActiveChatLogList()
    },

    /* 删除一条对话记录 */
    async deleteChatsAfterId(chatId: number | undefined) {
      if (!chatId) return
      await fetchDeleteGroupChatsAfterIdAPI({ id: chatId })
      await this.queryActiveChatLogList()
    },

    /* 设置使用上下文 */
    setUsingContext(context: boolean) {
      this.usingContext = context
      this.recordState()
    },

    /* 设置使用联网 */
    setUsingNetwork(context: boolean) {
      this.usingNetwork = context
      this.recordState()
    },

    /* 设置使用深度思考 */
    setUsingDeepThinking(context: boolean) {
      this.usingDeepThinking = context
      this.recordState()
    },

    /* 设置使用 MCP 工具 */
    setUsingMcpTool(context: boolean) {
      this.usingMcpTool = context
      this.recordState()
    },

    setUsingPlugin(plugin: any) {
      // Set the current plugin to the new plugin if provided, else clear it
      this.currentPlugin = plugin || undefined
      this.recordState() // Record the state change
    },

    setPreferredModel(model: any) {
      this.preferredModel = model || null
      this.recordState()
    },

    getHiddenReplyChatIds(groupId: number) {
      const current = this.hiddenReplyChatIdsByGroup || {}
      return (current[groupId] || []).map(id => Number(id)).filter(id => id > 0)
    },

    getHiddenReplyTailAnchor(groupId: number) {
      const current = this.hiddenReplyTailAnchorByGroup || {}
      const anchorId = Number(current[groupId] || 0)
      return anchorId > 0 ? anchorId : 0
    },

    applyHiddenReplyFilter(list: Chat.Chat[], groupId: number) {
      const fullList = Array.isArray(list) ? [...list] : []
      const anchorId = this.getHiddenReplyTailAnchor(groupId)
      const hiddenIds = this.getHiddenReplyChatIds(groupId)
      if (anchorId || hiddenIds.length) {
        this.clearHiddenReplyTail(groupId)
      }
      return fullList
    },

    rememberHiddenReplyTail(groupId: number, chatIds: number[], anchorChatId?: number) {
      if (!groupId) return
      const normalizedIds = Array.from(new Set(chatIds.map(id => Number(id)).filter(id => id > 0)))
      const normalizedAnchorId = Number(anchorChatId || 0)
      const current = this.hiddenReplyChatIdsByGroup || {}
      const currentAnchors = this.hiddenReplyTailAnchorByGroup || {}
      this.hiddenReplyChatIdsByGroup = {
        ...current,
        [groupId]: normalizedIds,
      }
      this.hiddenReplyTailAnchorByGroup = normalizedAnchorId
        ? {
            ...currentAnchors,
            [groupId]: normalizedAnchorId,
          }
        : currentAnchors
      this.recordState()
    },

    clearHiddenReplyTail(groupId?: number) {
      if (!groupId) {
        this.hiddenReplyChatIdsByGroup = {}
        this.hiddenReplyTailAnchorByGroup = {}
      } else {
        const current = { ...(this.hiddenReplyChatIdsByGroup || {}) }
        const currentAnchors = { ...(this.hiddenReplyTailAnchorByGroup || {}) }
        delete current[groupId]
        delete currentAnchors[groupId]
        this.hiddenReplyChatIdsByGroup = current
        this.hiddenReplyTailAnchorByGroup = currentAnchors
      }
      this.recordState()
    },

    async setPrompt(prompt: string) {
      this.prompt = prompt
      this.recordState()
    },

    setStreamIn(isStreamIn: boolean) {
      this.isStreamIn = isStreamIn
      this.recordState()
    },

    /* 删除当前对话组的全部内容 */
    async clearChatByGroupId() {
      if (!this.active) return

      await fetchDelChatLogByGroupIdAPI({ groupId: this.active })
      this.clearHiddenReplyTail(Number(this.active))
      await this.queryActiveChatLogList()
    },

    recordState() {
      setLocalState(this.$state)
    },

    clearChat() {
      this.chatList = []
      this.groupList = []
      this.active = 0
      this.resetChatHistoryState()
      this.hiddenReplyChatIdsByGroup = {}
      this.hiddenReplyTailAnchorByGroup = {}
      this.recordState()
    },
  },
})
