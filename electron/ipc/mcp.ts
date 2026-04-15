import { ipcMain } from 'electron'
import { mcpServerService } from '../services/mcp/server'
import { getMcpEnabled, setMcpEnabled } from '../services/store'

export function registerMcpIpcHandlers(): void {
  ipcMain.handle('mcp:start', async () => {
    setMcpEnabled(true)
    await mcpServerService.start()
  })

  ipcMain.handle('mcp:stop', async () => {
    setMcpEnabled(false)
    await mcpServerService.stop()
  })

  ipcMain.handle('mcp:get-status', () => {
    return mcpServerService.getStatus()
  })
}
