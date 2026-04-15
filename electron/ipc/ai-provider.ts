import { ipcMain } from 'electron'
import {
  listAIProviders,
  createAIProvider,
  updateAIProvider,
  deleteAIProvider,
} from '../services/store'
import { testProviderConnection } from '../services/ai-proxy'

export function registerAIProviderIpcHandlers(): void {
  ipcMain.handle('ai-provider:list', () => {
    return listAIProviders()
  })

  ipcMain.handle('ai-provider:create', (_event, data) => {
    return createAIProvider(data)
  })

  ipcMain.handle('ai-provider:update', (_event, { id, ...updates }) => {
    return updateAIProvider(id, updates)
  })

  ipcMain.handle('ai-provider:delete', (_event, id: string) => {
    return deleteAIProvider(id)
  })

  ipcMain.handle('ai-provider:test', async (_event, id: string) => {
    return testProviderConnection(id)
  })
}
