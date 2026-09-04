import { useChatStore, useGlobalStoreWithOut } from '@/store'

export function useResearchSession() {
  const chatStore = useChatStore()
  const globalStore = useGlobalStoreWithOut()

  const addResearchRecord = (chat: Chat.Chat) => {
    chatStore.addGroupChat(chat)
  }

  const updateResearchRecord = (index: number, chat: Partial<Chat.Chat>) => {
    chatStore.updateGroupChatSome(index, chat)
  }

  const toggleWorkflowPreview = (visible: boolean) => {
    globalStore.updateWorkflowPreviewer(visible)
  }

  const addWorkflowContent = (content: string) => {
    globalStore.addWorkflowContent(content)
  }

  const clearWorkflowContent = () => {
    globalStore.clearWorkflowContent()
  }

  const updateWorkflowContent = (index: number, content: string) => {
    globalStore.updateWorkflowContentAt(index, content)
  }

  const addMessageToWorkflow = (message: string) => {
    globalStore.addWorkflowContent(message)
    globalStore.updateWorkflowPreviewer(true)
  }

  return {
    addResearchRecord,
    updateResearchRecord,
    toggleWorkflowPreview,
    addWorkflowContent,
    clearWorkflowContent,
    updateWorkflowContent,
    addMessageToWorkflow,
  }
}
