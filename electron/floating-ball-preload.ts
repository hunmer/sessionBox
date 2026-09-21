import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('floatingBall', {
  send: (type: 'pointer-down' | 'pointer-move' | 'pointer-up' | 'click', x: number, y: number) => {
    ipcRenderer.send('floating-ball:pointer', { type, x, y })
  }
})
