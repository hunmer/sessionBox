interface CloseTabShortcutDependencies {
  getActiveTab: () => { id: string } | null
  getTabCount: () => number
  isClosing: () => boolean
  closeTab: (tabId: string) => Promise<unknown>
  closeWindow: () => void
}

/** 创建可测试的快捷键处理器，防止关闭/激活事务期间重复处理。 */
export function createCloseTabShortcutHandler(deps: CloseTabShortcutDependencies): () => Promise<void> {
  let closePending = false
  return async () => {
    if (closePending) return

    const activeTab = deps.getActiveTab()
    if (!activeTab) {
      if (deps.getTabCount() === 0 && !deps.isClosing()) deps.closeWindow()
      return
    }

    closePending = true
    try {
      await deps.closeTab(activeTab.id)
    } finally {
      closePending = false
    }
  }
}
