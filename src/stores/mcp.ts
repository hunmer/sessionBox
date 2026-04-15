import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const api = window.api

export const useMcpStore = defineStore('mcp', () => {
  const enabled = ref(false)
  const running = ref(false)
  const toolCount = ref(0)
  const port = ref(9527)

  const sseUrl = computed(() => `http://localhost:${port.value}/sse`)

  async function refreshStatus() {
    const status = await api.mcp.getStatus()
    enabled.value = status.enabled
    running.value = status.running
    toolCount.value = status.toolCount
    port.value = status.port
  }

  async function startServer() {
    await api.mcp.start()
    running.value = true
    enabled.value = true
    await refreshStatus()
  }

  async function stopServer() {
    await api.mcp.stop()
    running.value = false
    enabled.value = false
    await refreshStatus()
  }

  async function init() {
    await refreshStatus()
  }

  return {
    enabled,
    running,
    toolCount,
    port,
    sseUrl,
    refreshStatus,
    startServer,
    stopServer,
    init
  }
})
