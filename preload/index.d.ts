import { ElectronAPI } from '@electron-toolkit/preload'
import type { IpcAPI } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: IpcAPI
  }
}
