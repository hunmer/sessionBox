import { ipcRenderer } from 'electron'

// MCP Server
export function createMcpApi() {
  return {
    start: (): Promise<void> => ipcRenderer.invoke('mcp:start'),
    stop: (): Promise<void> => ipcRenderer.invoke('mcp:stop'),
    getStatus: (): Promise<{ enabled: boolean; running: boolean; toolCount: number; port: number }> =>
      ipcRenderer.invoke('mcp:get-status')
  }
}
