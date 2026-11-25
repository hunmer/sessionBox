import { ipcRenderer } from 'electron'

export function createDownloadApi() {
  return {
    checkConnection: (): Promise<boolean> => ipcRenderer.invoke('download:checkConnection'),
    getConfig: (): Promise<any> => ipcRenderer.invoke('download:getConfig'),
    updateConfig: (config: any): Promise<any> => ipcRenderer.invoke('download:updateConfig', config),
    start: (): Promise<boolean> => ipcRenderer.invoke('download:start'),
    stop: (): Promise<void> => ipcRenderer.invoke('download:stop'),
    add: (url: string, options?: { filename?: string; dir?: string; headers?: string[]; cookies?: string; referer?: string; category?: string }): Promise<string> =>
      ipcRenderer.invoke('download:add', url, options),
    pause: (gid: string): Promise<void> => ipcRenderer.invoke('download:pause', gid),
    resume: (gid: string): Promise<void> => ipcRenderer.invoke('download:resume', gid),
    remove: (gid: string): Promise<void> => ipcRenderer.invoke('download:remove', gid),
    listActive: (): Promise<any[]> => ipcRenderer.invoke('download:listActive'),
    listWaiting: (): Promise<any[]> => ipcRenderer.invoke('download:listWaiting'),
    listStopped: (): Promise<any[]> => ipcRenderer.invoke('download:listStopped'),
    globalStat: (): Promise<any> => ipcRenderer.invoke('download:globalStat'),
    purge: (): Promise<void> => ipcRenderer.invoke('download:purge'),
    // 系统下载器任务（Electron DownloadItem 兜底路径，与 aria2 任务统一展示）
    listSystem: (): Promise<any[]> => ipcRenderer.invoke('download:listSystem'),
    removeSystem: (gid: string): Promise<void> => ipcRenderer.invoke('download:removeSystem', gid),
    pauseSystem: (gid: string): Promise<void> => ipcRenderer.invoke('download:pauseSystem', gid),
    resumeSystem: (gid: string): Promise<void> => ipcRenderer.invoke('download:resumeSystem', gid),
    clearSystemFinished: (): Promise<void> => ipcRenderer.invoke('download:clearSystemFinished'),
    clearSystemAll: (): Promise<void> => ipcRenderer.invoke('download:clearSystemAll'),
    /** 订阅系统下载进度推送（主进程节流 300ms 推送一次任务列表） */
    onDownloadProgress: (handler: (tasks: any[]) => void): (() => void) => {
      const listener = (_e: unknown, tasks: any[]) => handler(tasks)
      ipcRenderer.on('on:system-download:progress', listener)
      return () => ipcRenderer.removeListener('on:system-download:progress', listener)
    },
    showInFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('download:showInFolder', filePath),
    getFilePath: (dir: string, filename: string): Promise<string> => ipcRenderer.invoke('download:getFilePath', dir, filename),
    startDrag: (filePath: string): void => ipcRenderer.send('download:startDrag', filePath),
    openFile: (filePath: string): Promise<void> => ipcRenderer.invoke('download:openFile', filePath),
    pickDirectory: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('download:pickDirectory', defaultPath),
    /** 复制下载地址到系统剪贴板 */
    copyUrl: (url: string): Promise<void> => ipcRenderer.invoke('download:copyUrl', url),
    /** 选择外部下载程序可执行文件 */
    pickExecutable: (defaultPath?: string): Promise<string | null> => ipcRenderer.invoke('download:pickExecutable', defaultPath)
  }
}
