import { ipcMain } from 'electron'
import { workflowVersionStore } from '../services/workflow-version'

export function registerWorkflowVersionIpcHandlers(): void {
  ipcMain.handle('workflowVersion:list', (_e, workflowId: string) => {
    return workflowVersionStore.list(workflowId)
  })

  ipcMain.handle('workflowVersion:add', (_e, workflowId: string, name: string, nodes: any[], edges: any[]) => {
    return workflowVersionStore.add(workflowId, name, nodes, edges)
  })

  ipcMain.handle('workflowVersion:get', (_e, workflowId: string, versionId: string) => {
    return workflowVersionStore.get(workflowId, versionId)
  })

  ipcMain.handle('workflowVersion:delete', (_e, workflowId: string, versionId: string) => {
    workflowVersionStore.delete(workflowId, versionId)
  })

  ipcMain.handle('workflowVersion:clear', (_e, workflowId: string) => {
    workflowVersionStore.clear(workflowId)
  })

  ipcMain.handle('workflowVersion:nextName', (_e, workflowId: string) => {
    return workflowVersionStore.nextVersionName(workflowId)
  })
}
