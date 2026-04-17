import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { BROWSER_TOOL_LIST } from '@/lib/agent/tools'

const PANEL_VISIBLE_KEY = 'sessionbox-chat-panel-visible'
const TARGET_TAB_KEY = 'sessionbox-chat-target-tab'
const ENABLED_TOOLS_KEY = 'sessionbox-chat-enabled-tools'

function loadEnabledTools(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(ENABLED_TOOLS_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  const defaults: Record<string, boolean> = {}
  for (const tool of BROWSER_TOOL_LIST) {
    defaults[tool.name] = true
  }
  return defaults
}

export const useChatUIStore = defineStore('chat-ui', () => {
  const isPanelVisible = ref(localStorage.getItem(PANEL_VISIBLE_KEY) === '1')
  const targetTabId = ref<string | null>(localStorage.getItem(TARGET_TAB_KEY))
  const enabledTools = ref<Record<string, boolean>>(loadEnabledTools())

  function togglePanel() {
    isPanelVisible.value = !isPanelVisible.value
    localStorage.setItem(PANEL_VISIBLE_KEY, isPanelVisible.value ? '1' : '0')
  }

  function setTargetTab(tabId: string | null) {
    targetTabId.value = tabId
    if (tabId) {
      localStorage.setItem(TARGET_TAB_KEY, tabId)
    } else {
      localStorage.removeItem(TARGET_TAB_KEY)
    }
  }

  function toggleTool(name: string) {
    enabledTools.value[name] = !enabledTools.value[name]
    localStorage.setItem(ENABLED_TOOLS_KEY, JSON.stringify(enabledTools.value))
  }

  function isToolEnabled(name: string): boolean {
    return enabledTools.value[name] !== false
  }

  const enabledToolNames = computed(() => {
    return new Set(
      BROWSER_TOOL_LIST
        .filter((t) => enabledTools.value[t.name] !== false)
        .map((t) => t.name),
    )
  })

  return {
    isPanelVisible,
    targetTabId,
    enabledTools,
    enabledToolNames,
    togglePanel,
    setTargetTab,
    toggleTool,
    isToolEnabled,
  }
})
