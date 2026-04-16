import { ipcMain } from 'electron'
import { executionLogStore } from '../services/execution-log'

export function registerExecutionLogIpcHandlers(): void {
  ipcMain.handle('executionLog:list', (_e, workflowId: string) => {
    return executionLogStore.list(workflowId)
  })

  ipcMain.handle('executionLog:save', (_e, workflowId: string, log: any) => {
    return executionLogStore.add(workflowId, log)
  })

  ipcMain.handle('executionLog:delete', (_e, workflowId: string, logId: string) => {
    executionLogStore.delete(workflowId, logId)
  })

  ipcMain.handle('executionLog:clear', (_e, workflowId: string) => {
    executionLogStore.clear(workflowId)
  })
}
