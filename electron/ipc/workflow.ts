import { ipcMain } from 'electron'
import {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  listWorkflowFolders,
  createWorkflowFolder,
  updateWorkflowFolder,
  deleteWorkflowFolder,
} from '../services/store'

export function registerWorkflowIpcHandlers(): void {
  // 工作流
  ipcMain.handle('workflow:list', (_e, folderId?: string | null) => listWorkflows(folderId))
  ipcMain.handle('workflow:get', (_e, id: string) => getWorkflow(id))
  ipcMain.handle('workflow:create', (_e, data) => createWorkflow(data))
  ipcMain.handle('workflow:update', (_e, id: string, data) => updateWorkflow(id, data))
  ipcMain.handle('workflow:delete', (_e, id: string) => deleteWorkflow(id))

  // 工作流文件夹
  ipcMain.handle('workflowFolder:list', () => listWorkflowFolders())
  ipcMain.handle('workflowFolder:create', (_e, data) => createWorkflowFolder(data))
  ipcMain.handle('workflowFolder:update', (_e, id: string, data) => updateWorkflowFolder(id, data))
  ipcMain.handle('workflowFolder:delete', (_e, id: string) => deleteWorkflowFolder(id))
}
