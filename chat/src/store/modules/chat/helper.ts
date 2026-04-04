import { ss } from '@/utils/storage'

const LOCAL_NAME = 'chatStorage'

export function defaultState(): Chat.ChatState {
  return {
    active: 0,
    usingContext: true,
    usingNetwork: false,
    usingDeepThinking: false,
    usingMcpTool: false,
    groupList: [],
    chatList: [],
    groupKeyWord: '',
    baseConfig: null,
    currentPlugin: undefined,
    pluginList: [],
    academicMode: true,
    mobileAcademicPanelVisible: false,
    academicPluginList: [],
    academicCoreFunctions: [],
    academicPluginArgs: '',
    currentAcademicPlugin: undefined,
    currentAcademicCore: undefined,
    academicWorkflowEnabled: false,
    academicWorkflowRunning: false,
    academicWorkflowSteps: [],
    academicWorkflowTemplates: [],
    preferredModel: null,
    chatHistoryHasMore: false,
    chatHistoryLoading: false,
    chatHistoryCursor: 0,
    hiddenReplyChatIdsByGroup: {},
    hiddenReplyTailAnchorByGroup: {},
    prompt: '',
    reasoningText: '',
  }
}

export function getLocalState(): Chat.ChatState {
  const localState = ss.get(LOCAL_NAME)
  return { ...defaultState(), ...localState, academicMode: true }
}

export function setLocalState({
  active,
  preferredModel,
  hiddenReplyChatIdsByGroup,
  hiddenReplyTailAnchorByGroup,
}: Chat.ChatState) {
  ss.set(LOCAL_NAME, {
    ...ss.get(LOCAL_NAME),
    active,
    preferredModel: preferredModel || null,
    hiddenReplyChatIdsByGroup: hiddenReplyChatIdsByGroup || {},
    hiddenReplyTailAnchorByGroup: hiddenReplyTailAnchorByGroup || {},
  })
}

export function formatChatPre(data: any): any {
  return data.map((item: any) => {
    const { name, childList, id } = item
    return {
      label: name,
      value: id,
      children: childList.map((t: any) => {
        return {
          label: t.title,
          value: t.prompt,
        }
      }),
    }
  })
}
