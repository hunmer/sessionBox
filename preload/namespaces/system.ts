import { ipcRenderer } from 'electron'

// 系统内存信息
export function createSystemApi() {
  return {
    memory: (): Promise<{ appMemoryKB: number; totalMemoryKB: number; freeMemoryKB: number }> =>
      ipcRenderer.invoke('system:memory')
  }
}
