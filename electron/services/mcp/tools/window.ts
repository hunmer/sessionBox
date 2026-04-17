import { BrowserWindow } from 'electron'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from '../types'

/** 成功响应 */
function ok(data: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ success: true, ...data }, null, 2) }]
  }
}

/** 错误响应 */
function err(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: message }, null, 2) }]
  }
}

/** 根据 ID 查找窗口，找不到返回 null */
function findWindow(windowId: number): BrowserWindow | null {
  const win = BrowserWindow.getAllWindows().find(w => w.id === windowId)
  if (!win || win.isDestroyed()) return null
  return win
}

export function registerWindowTools(server: McpServer, ctx: ToolContext): number {
  // 1. create_window
  server.tool(
    'create_window',
    'Create an independent BrowserWindow',
    {
      url: z.string().describe('URL to open'),
      containerId: z.string().optional().describe('Container ID for session isolation'),
      title: z.string().optional().describe('Window title'),
      width: z.number().optional().describe('Window width (default 1280)'),
      height: z.number().optional().describe('Window height (default 800)')
    },
    async ({ url, containerId, title, width, height }) => {
      try {
        const partition = containerId
          ? `persist:container-${containerId}`
          : undefined

        const win = new BrowserWindow({
          width: width ?? 1280,
          height: height ?? 800,
          show: false,
          autoHideMenuBar: true,
          title: title ?? '新窗口',
          webPreferences: {
            partition,
            sandbox: false
          }
        })
        win.loadURL(url)
        win.once('ready-to-show', () => win.show())

        return ok({ windowId: win.id, title: title ?? '新窗口', url, containerId })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  // 2. navigate_window
  server.tool(
    'navigate_window',
    'Navigate a window to a new URL',
    {
      windowId: z.number().describe('Window ID to navigate'),
      url: z.string().describe('URL to navigate to')
    },
    async ({ windowId, url }) => {
      try {
        const win = findWindow(windowId)
        if (!win) return err(`Window ${windowId} not found or destroyed`)
        void win.webContents.loadURL(url)
        return ok({ windowId, url })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  // 3. close_window
  server.tool(
    'close_window',
    'Close a window',
    {
      windowId: z.number().describe('Window ID to close')
    },
    async ({ windowId }) => {
      try {
        const win = findWindow(windowId)
        if (!win) return err(`Window ${windowId} not found or destroyed`)
        win.close()
        return ok({ windowId, closed: true })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  // 4. list_windows
  server.tool(
    'list_windows',
    'List all open windows',
    {},
    async () => {
      try {
        const windows = BrowserWindow.getAllWindows().map(w => ({
          windowId: w.id,
          title: w.getTitle(),
          url: w.webContents.getURL(),
          width: w.getBounds().width,
          height: w.getBounds().height,
          isMaximized: w.isMaximized(),
          isMain: w === ctx.webviewManager?.getMainWindow?.()
        }))
        return ok({ windows })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  // 5. focus_window
  server.tool(
    'focus_window',
    'Focus (bring to front) a window',
    {
      windowId: z.number().describe('Window ID to focus')
    },
    async ({ windowId }) => {
      try {
        const win = findWindow(windowId)
        if (!win) return err(`Window ${windowId} not found or destroyed`)
        if (win.isMinimized()) win.restore()
        win.focus()
        return ok({ windowId, focused: true })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  // 6. screenshot_window
  server.tool(
    'screenshot_window',
    'Take a screenshot of a window',
    {
      windowId: z.number().describe('Window ID to screenshot')
    },
    async ({ windowId }) => {
      try {
        const win = findWindow(windowId)
        if (!win) return err(`Window ${windowId} not found or destroyed`)
        const image = await win.webContents.capturePage()
        if (image.isEmpty()) return err('Window content is empty')
        const base64 = image.toJPEG(80).toString('base64')
        return ok({ windowId, imageBase64: base64, width: image.getSize().width, height: image.getSize().height })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  // 7. get_window_detail
  server.tool(
    'get_window_detail',
    'Get detailed info about a window',
    {
      windowId: z.number().describe('Window ID')
    },
    async ({ windowId }) => {
      try {
        const win = findWindow(windowId)
        if (!win) return err(`Window ${windowId} not found or destroyed`)
        const bounds = win.getBounds()
        return ok({
          windowId: win.id,
          title: win.getTitle(),
          url: win.webContents.getURL(),
          bounds,
          isMaximized: win.isMaximized(),
          isMinimized: win.isMinimized(),
          isFullScreen: win.isFullScreen(),
          isFocused: win.isFocused(),
          isMain: win === ctx.webviewManager?.getMainWindow?.()
        })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  return 7
}
