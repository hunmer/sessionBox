import { ipcRenderer } from 'electron'

// Workflow agent 工具执行
export function createAgentApi() {
  return {
    execTool: (toolType: string, params?: Record<string, any>, targetTabId?: string): Promise<any> =>
      ipcRenderer.invoke('agent:execTool', toolType, params, targetTabId),
  }
}
