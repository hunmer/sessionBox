import { contextBridge, ipcRenderer } from 'electron'

type ReplayCommand =
  | { type: 'load-events'; events: any[] }
  | { type: 'seek'; timeMs: number }
  | { type: 'resize' }

function emit(channel: string, payload?: unknown): void {
  ipcRenderer.sendToHost(channel, payload)
}

const api = {
  sendToHost: emit
}

function dispatchCommand(command: ReplayCommand): void {
  window.dispatchEvent(new CustomEvent('sessionbox:replay-command', { detail: command }))
}

ipcRenderer.on('debugger:replay-command', (_event, command: ReplayCommand) => {
  dispatchCommand(command)
})

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('debuggerReplayApi', api)
} else {
  ;(window as any).debuggerReplayApi = api
}

window.addEventListener('DOMContentLoaded', () => {
  emit('debugger:replay-ready')
})

window.addEventListener('error', (event) => {
  emit('debugger:replay-error', event.message || 'Replay 页面发生错误')
})
