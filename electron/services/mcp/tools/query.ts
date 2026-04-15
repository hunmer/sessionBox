import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from '../types'

/** 统一文本返回格式 */
function text(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }]
  }
}

export function registerQueryTools(server: McpServer, ctx: ToolContext): number {
  // 1. list_workspaces
  server.tool(
    'list_workspaces',
    'List all workspaces in SessionBox',
    {},
    async () => {
      const workspaces = ctx.store.listWorkspaces()
      return text(workspaces)
    }
  )

  // 2. list_groups
  server.tool(
    'list_groups',
    'List all groups across workspaces',
    {},
    async () => {
      const groups = ctx.store.listGroups()
      return text(groups)
    }
  )

  // 3. list_containers
  server.tool(
    'list_containers',
    'List all containers (session isolation units)',
    {},
    async () => {
      const containers = ctx.store.listContainers()
      return text(containers)
    }
  )

  // 4. list_pages
  server.tool(
    'list_pages',
    'List all pages (bound to groups and containers)',
    {},
    async () => {
      const pages = ctx.store.listPages()
      return text(pages)
    }
  )

  // 5. list_tabs (聚合运行时信息)
  server.tool(
    'list_tabs',
    'List all tabs with runtime info (active state, frozen state, current URL)',
    {},
    async () => {
      const tabs = ctx.store.listTabs()
      const activeTabId = ctx.webviewManager.getActiveTabId()

      const result = tabs.map((tab) => {
        const viewInfo = ctx.webviewManager.getViewInfo(tab.id)
        const page = tab.pageId ? ctx.store.getPageById(tab.pageId) : undefined
        const group = page?.groupId ? ctx.store.getGroupById(page.groupId) : undefined
        const workspace = group?.workspaceId
          ? ctx.store.listWorkspaces().find((w) => w.id === group.workspaceId)
          : undefined

        return {
          tabId: tab.id,
          pageId: tab.pageId,
          title: tab.title,
          url: viewInfo?.url ?? tab.url,
          isActive: tab.id === activeTabId,
          isFrozen: ctx.webviewManager.isFrozen(tab.id),
          containerId: viewInfo?.containerId ?? page?.containerId,
          groupName: group?.name,
          workspaceName: workspace?.title,
          pinned: tab.pinned,
          muted: tab.muted
        }
      })

      return text(result)
    }
  )

  // 6. list_bookmarks
  server.tool(
    'list_bookmarks',
    'List all bookmarks',
    {},
    async () => {
      const bookmarks = ctx.store.listBookmarks()
      return text(bookmarks)
    }
  )

  // 7. list_proxies
  server.tool(
    'list_proxies',
    'List all proxy configurations',
    {},
    async () => {
      const proxies = ctx.store.listProxies()
      return text(proxies)
    }
  )

  // 8. get_tab_detail (深度关联查询)
  server.tool(
    'get_tab_detail',
    'Get detailed information for a specific tab, including page, group, workspace, container, and proxy info',
    {
      tabId: z.string().describe('The tab ID to query')
    },
    async ({ tabId }) => {
      const tabs = ctx.store.listTabs()
      const tab = tabs.find((t) => t.id === tabId)
      if (!tab) {
        return text({ error: `Tab ${tabId} not found` })
      }

      // 通过 pageId 查询关联数据
      const page = tab.pageId ? ctx.store.getPageById(tab.pageId) : undefined
      const group = page?.groupId ? ctx.store.getGroupById(page.groupId) : undefined
      const workspace = group?.workspaceId
        ? ctx.store.listWorkspaces().find((w) => w.id === group.workspaceId)
        : undefined
      const container = page?.containerId
        ? ctx.store.getContainerById(page.containerId)
        : undefined

      // 查询代理：页面级 > 容器级 > 分组级
      const proxyId = page?.proxyId ?? container?.proxyId ?? group?.proxyId
      const proxy = proxyId ? ctx.store.getProxyById(proxyId) : undefined

      // 运行时信息
      const viewInfo = ctx.webviewManager.getViewInfo(tabId)
      const activeTabId = ctx.webviewManager.getActiveTabId()

      const detail = {
        tab: {
          id: tab.id,
          pageId: tab.pageId,
          title: tab.title,
          url: viewInfo?.url ?? tab.url,
          order: tab.order,
          pinned: tab.pinned,
          muted: tab.muted,
          isActive: tab.id === activeTabId,
          isFrozen: ctx.webviewManager.isFrozen(tabId)
        },
        page: page
          ? { id: page.id, name: page.name, icon: page.icon, url: page.url, userAgent: page.userAgent }
          : null,
        group: group ? { id: group.id, name: group.name, color: group.color } : null,
        workspace: workspace
          ? { id: workspace.id, title: workspace.title, color: workspace.color }
          : null,
        container: container
          ? { id: container.id, name: container.name, icon: container.icon }
          : null,
        proxy: proxy
          ? {
              id: proxy.id,
              name: proxy.name,
              type: proxy.type,
              host: proxy.host,
              port: proxy.port,
              enabled: proxy.enabled
            }
          : null
      }

      return text(detail)
    }
  )

  return 8
}
