import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from '../types'

/** 跟踪已 attach debugger 的 tab */
const attachedTabs = new Set<string>()

/** 当 tab 被销毁时清理 debugger 状态 */
export function cleanupDetachedTab(tabId: string): void {
  attachedTabs.delete(tabId)
}

/** 确保 debugger 已 attach 到目标 tab 的 WebContents */
function ensureDebuggerAttached(ctx: ToolContext, tabId: string): any {
  const wc = ctx.webviewManager.getWebContents(tabId)
  if (!wc) throw new Error(`No WebContents for tab ${tabId}`)

  if (!attachedTabs.has(tabId)) {
    wc.debugger.attach('1.3')
    attachedTabs.add(tabId)

    // 启用常用域
    try { wc.debugger.sendCommand('Runtime.enable') } catch {}
    try { wc.debugger.sendCommand('Page.enable') } catch {}
    try { wc.debugger.sendCommand('Network.enable') } catch {}
  }

  return wc
}

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

export function registerCdpTools(server: McpServer, ctx: ToolContext): number {
  // 1. execute_js
  server.tool(
    'execute_js',
    'Execute JavaScript code in a tab and return the result',
    {
      tabId: z.string().describe('Tab ID to execute JavaScript in'),
      code: z.string().describe('JavaScript code to execute')
    },
    async ({ tabId, code }) => {
      try {
        const wc = ctx.webviewManager.getWebContents(tabId)
        if (!wc) return err(`No WebContents for tab ${tabId}`)

        // 10 秒超时保护
        const result = await Promise.race([
          wc.executeJavaScript(code),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Execution timed out after 10s')), 10_000)
          )
        ])

        return ok({ tabId, result: result ?? null })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  // 2. cdp_command
  server.tool(
    'cdp_command',
    'Send a Chrome DevTools Protocol command to a tab',
    {
      tabId: z.string().describe('Tab ID to send CDP command to'),
      method: z.string().describe('CDP method name (e.g. "Runtime.evaluate", "Page.captureScreenshot")'),
      params: z.record(z.any()).optional().describe('CDP command parameters')
    },
    async ({ tabId, method, params }) => {
      try {
        const wc = ensureDebuggerAttached(ctx, tabId)
        const result = await wc.debugger.sendCommand(method, params ?? {})
        return ok({ tabId, method, result })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  // 3. screenshot
  server.tool(
    'screenshot',
    'Capture a screenshot of a tab and return the base64 image data',
    {
      tabId: z.string().describe('Tab ID to screenshot')
    },
    async ({ tabId }) => {
      try {
        const dataUrl = await ctx.webviewManager.captureTab(tabId)
        if (!dataUrl) return err(`Failed to capture tab ${tabId} (tab may be frozen or not loaded)`)

        // 提取 base64 部分: "data:image/png;base64,XXXXX"
        const base64 = dataUrl.replace(/^data:image\/[^;]+;base64,/, '')

        return ok({
          tabId,
          format: 'png',
          sizeBytes: Buffer.from(base64, 'base64').length,
          data: base64
        })
      } catch (error: any) {
        return err(error?.message ?? String(error))
      }
    }
  )

  return 3
}
