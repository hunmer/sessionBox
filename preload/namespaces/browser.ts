import { ipcRenderer } from 'electron'

export function createBrowserApi() {
  return {
    click: (args: any): Promise<any> => ipcRenderer.invoke('browser:click', args),
    type: (args: any): Promise<any> => ipcRenderer.invoke('browser:type', args),
    scroll: (args: any): Promise<any> => ipcRenderer.invoke('browser:scroll', args),
    select: (args: any): Promise<any> => ipcRenderer.invoke('browser:select', args),
    hover: (args: any): Promise<any> => ipcRenderer.invoke('browser:hover', args),
    getContent: (args: any): Promise<any> => ipcRenderer.invoke('browser:get-content', args),
    getDom: (args: any): Promise<any> => ipcRenderer.invoke('browser:get-dom', args),
    screenshot: (args: any): Promise<any> => ipcRenderer.invoke('browser:screenshot', args),
  }
}
