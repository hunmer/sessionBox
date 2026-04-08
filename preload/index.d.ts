import { ElectronAPI } from '@electron-toolkit/preload'

interface IpcAPI {
  // Phase 2 定义 IPC API 类型
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: IpcAPI
  }
}
