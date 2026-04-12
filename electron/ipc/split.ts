import { ipcMain } from 'electron'
import {
  getSplitState,
  setSplitState,
  clearSplitState,
  listSplitSchemes,
  createSplitScheme,
  deleteSplitScheme
} from '../services/store'
import type { SplitLayoutData, SavedSplitSchemeData } from '../services/store'
import { webviewManager } from '../services/webview-manager'

export function registerSplitIpcHandlers(): void {
  // Fire-and-forget: update multiple view bounds simultaneously
  ipcMain.on(
    'split:update-multi-bounds',
    (_e, paneBounds: Array<{ tabId: string; rect: { x: number; y: number; width: number; height: number } }>) => {
      webviewManager.updateMultiBounds(paneBounds)
    }
  )

  ipcMain.handle('split:get-state', (_e, workspaceId: string) => getSplitState(workspaceId))

  ipcMain.handle('split:set-state', (_e, workspaceId: string, data: SplitLayoutData) =>
    setSplitState(workspaceId, data)
  )

  ipcMain.handle('split:clear-state', (_e, workspaceId: string) => clearSplitState(workspaceId))

  ipcMain.handle('split:list-schemes', () => listSplitSchemes())

  ipcMain.handle('split:create-scheme', (_e, data: SavedSplitSchemeData) => createSplitScheme(data))

  ipcMain.handle('split:delete-scheme', (_e, id: string) => deleteSplitScheme(id))
}
