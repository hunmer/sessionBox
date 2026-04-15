import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from '../types'

/** 成功响应 */
function ok(data: unknown) {
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

export function registerTabTools(server: McpServer, ctx: ToolContext): number {
  // 1. create_tab
  server.tool(
    'create_tab',
    'Create a new tab. Provide pageId to open from an existing page, or url to open a direct URL.',
    {
      pageId: z.string().optional().describe('Existing page ID to create tab from'),
      url: z.string().optional().describe('URL to open (used when no pageId)'),
      containerId: z.string().optional().describe('Container ID (required when using url without pageId)')
    },
    async ({ pageId, url, containerId }) => {
      try {
        let finalPageId = pageId ?? ''
        let finalUrl = url ?? ''
        let finalContainerId = containerId ?? ''

        if (pageId) {
          // 通过页面创建
          const page = ctx.store.getPageById(pageId)
          if (!page) return err(`Page ${pageId} not found`)
          finalUrl = page.url
          finalContainerId = page.containerId ?? 'default'
        } else if (url) {
          // 通过 URL 创建，使用默认容器
          finalContainerId = finalContainerId || ctx.store.getDefaultContainerId()
        } else {
          return err('Must provide either pageId or url')
        }

        // 计算 order
        const existingTabs = ctx.store.listTabs()
        const maxOrder = existingTabs.length > 0
          ? Math.max(...existingTabs.map((t) => t.order))
          : -1

        // 创建 tab 数据
        const tab = ctx.store.createTab({
          pageId: finalPageId,
          title: '',
          url: finalUrl,
          order: maxOrder + 1
        })

        // 注册视图
        ctx.webviewManager.registerPendingView(tab.id, finalPageId, finalContainerId, finalUrl)

        // 通知渲染进程
        ctx.mainWindow?.webContents.send('on:tab:created', tab)

        return ok({ tabId: tab.id, url: finalUrl })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  // 2. navigate_tab
  server.tool(
    'navigate_tab',
    'Navigate a tab to a new URL',
    {
      tabId: z.string().describe('Tab ID to navigate'),
      url: z.string().describe('URL to navigate to')
    },
    async ({ tabId, url }) => {
      try {
        ctx.webviewManager.navigate(tabId, url)
        return ok({ tabId, url })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  // 3. close_tab
  server.tool(
    'close_tab',
    'Close (destroy) a tab',
    {
      tabId: z.string().describe('Tab ID to close')
    },
    async ({ tabId }) => {
      try {
        ctx.webviewManager.destroyView(tabId)
        ctx.store.deleteTab(tabId)
        return ok({ tabId, closed: true })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  // 4. switch_tab
  server.tool(
    'switch_tab',
    'Switch to (activate) a tab',
    {
      tabId: z.string().describe('Tab ID to switch to')
    },
    async ({ tabId }) => {
      try {
        ctx.webviewManager.switchView(tabId)
        return ok({ tabId, activated: true })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  // 5. reload_tab
  server.tool(
    'reload_tab',
    'Reload the current page in a tab',
    {
      tabId: z.string().describe('Tab ID to reload'),
      ignoreCache: z.boolean().optional().describe('Whether to bypass cache (hard reload)')
    },
    async ({ tabId, ignoreCache }) => {
      try {
        if (ignoreCache) {
          ctx.webviewManager.forceReload(tabId)
        } else {
          ctx.webviewManager.reload(tabId)
        }
        return ok({ tabId, reloaded: true, ignoreCache: !!ignoreCache })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  // 6. go_back
  server.tool(
    'go_back',
    'Navigate back in a tab',
    {
      tabId: z.string().describe('Tab ID to go back in')
    },
    async ({ tabId }) => {
      try {
        ctx.webviewManager.goBack(tabId)
        return ok({ tabId, action: 'go_back' })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  // 7. go_forward
  server.tool(
    'go_forward',
    'Navigate forward in a tab',
    {
      tabId: z.string().describe('Tab ID to go forward in')
    },
    async ({ tabId }) => {
      try {
        ctx.webviewManager.goForward(tabId)
        return ok({ tabId, action: 'go_forward' })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  return 7
}
