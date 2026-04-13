import { EventEmitter2 } from 'eventemitter2'

export const pluginEventBus = new EventEmitter2({
  wildcard: true,
  delimiter: ':',
  maxListeners: 50,
  newListener: false
})

/**
 * 广播渲染进程推送事件
 * 在各 webContents.send 调用点前调用此函数
 */
export function broadcastToRenderer(channel: string, ...args: any[]): void {
  pluginEventBus.emit(`render:${channel}`, { channel, args })
}
