import { ElectronAPI } from '@electron-toolkit/preload'

interface IpcAPI {
  // Phase 2 定义 IPC API 类型
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<boolean>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IpcAPI
  }
}
