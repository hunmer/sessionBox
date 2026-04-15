import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

/**
 * 创建浏览器交互工具集（通过 IPC 桥接到主进程 CDP 执行）
 */
export function createBrowserTools(targetTabId: string | null): DynamicStructuredTool[] {
  const getTabId = (explicitTabId?: string) => explicitTabId ?? targetTabId ?? ''

  return [
    new DynamicStructuredTool({
      name: 'click_element',
      description: '点击页面上的元素。通过 CSS 选择器定位目标元素。',
      schema: z.object({
        selector: z.string().describe('CSS 选择器，例如 "#login-btn", ".submit-button"'),
        tabId: z.string().optional().describe('目标标签页 ID'),
      }),
      func: async (input) => {
        const result = await window.api.browser.click({
          selector: input.selector,
          tabId: getTabId(input.tabId),
        })
        return JSON.stringify(result)
      },
    }),

    new DynamicStructuredTool({
      name: 'type_text',
      description: '在输入框中输入文字。',
      schema: z.object({
        text: z.string().describe('要输入的文字'),
        selector: z.string().optional().describe('CSS 选择器定位输入框'),
        tabId: z.string().optional().describe('目标标签页 ID'),
      }),
      func: async (input) => {
        const result = await window.api.browser.type({
          text: input.text,
          selector: input.selector,
          tabId: getTabId(input.tabId),
        })
        return JSON.stringify(result)
      },
    }),

    new DynamicStructuredTool({
      name: 'scroll_page',
      description: '滚动页面。',
      schema: z.object({
        direction: z.enum(['up', 'down', 'left', 'right']).describe('滚动方向'),
        amount: z.number().default(300).describe('滚动像素数'),
        tabId: z.string().optional().describe('目标标签页 ID'),
      }),
      func: async (input) => {
        const result = await window.api.browser.scroll({
          direction: input.direction,
          amount: input.amount,
          tabId: getTabId(input.tabId),
        })
        return JSON.stringify(result)
      },
    }),

    new DynamicStructuredTool({
      name: 'select_option',
      description: '选择下拉框的选项。',
      schema: z.object({
        selector: z.string().describe('select 元素的 CSS 选择器'),
        value: z.string().describe('要选中的选项值'),
        tabId: z.string().optional().describe('目标标签页 ID'),
      }),
      func: async (input) => {
        const result = await window.api.browser.select({
          selector: input.selector,
          value: input.value,
          tabId: getTabId(input.tabId),
        })
        return JSON.stringify(result)
      },
    }),

    new DynamicStructuredTool({
      name: 'hover_element',
      description: '鼠标悬停在元素上。',
      schema: z.object({
        selector: z.string().describe('CSS 选择器'),
        tabId: z.string().optional().describe('目标标签页 ID'),
      }),
      func: async (input) => {
        const result = await window.api.browser.hover({
          selector: input.selector,
          tabId: getTabId(input.tabId),
        })
        return JSON.stringify(result)
      },
    }),

    new DynamicStructuredTool({
      name: 'get_page_content',
      description: '获取页面的文本内容。',
      schema: z.object({
        tabId: z.string().optional().describe('目标标签页 ID'),
      }),
      func: async (input) => {
        const result = await window.api.browser.getContent({
          tabId: getTabId(input.tabId),
        })
        return JSON.stringify(result)
      },
    }),

    new DynamicStructuredTool({
      name: 'get_dom',
      description: '获取指定元素的 outerHTML。',
      schema: z.object({
        selector: z.string().describe('CSS 选择器'),
        tabId: z.string().optional().describe('目标标签页 ID'),
      }),
      func: async (input) => {
        const result = await window.api.browser.getDom({
          selector: input.selector,
          tabId: getTabId(input.tabId),
        })
        return JSON.stringify(result)
      },
    }),

    new DynamicStructuredTool({
      name: 'get_page_screenshot',
      description: '截取页面截图。',
      schema: z.object({
        tabId: z.string().optional().describe('目标标签页 ID'),
        format: z.enum(['png', 'jpeg']).optional().describe('截图格式'),
      }),
      func: async (input) => {
        const result = await window.api.browser.screenshot({
          tabId: getTabId(input.tabId),
          format: input.format,
        })
        return JSON.stringify(result)
      },
    }),

    // ===== 标签页管理工具 =====
    new DynamicStructuredTool({
      name: 'list_tabs',
      description: '列出所有打开的标签页。',
      schema: z.object({}),
      func: async () => {
        const tabs = await window.api.tab.list()
        return JSON.stringify(tabs)
      },
    }),

    new DynamicStructuredTool({
      name: 'create_tab',
      description: '创建新标签页。',
      schema: z.object({
        url: z.string().describe('要打开的 URL'),
        pageId: z.string().optional().describe('已有页面 ID'),
      }),
      func: async (input) => {
        if (input.pageId) {
          const tab = await window.api.tab.create(input.pageId)
          return JSON.stringify(tab)
        }
        return JSON.stringify({ error: '请提供 pageId（从 list_pages 获取）' })
      },
    }),

    new DynamicStructuredTool({
      name: 'navigate_tab',
      description: '在标签页中导航到指定 URL。',
      schema: z.object({
        url: z.string().describe('目标 URL'),
        tabId: z.string().optional().describe('标签页 ID'),
      }),
      func: async (input) => {
        const id = input.tabId ?? targetTabId ?? ''
        await window.api.tab.navigate(id, input.url)
        return JSON.stringify({ success: true })
      },
    }),

    new DynamicStructuredTool({
      name: 'switch_tab',
      description: '切换到指定标签页。',
      schema: z.object({
        tabId: z.string().describe('要切换到的标签页 ID'),
      }),
      func: async (input) => {
        await window.api.tab.switch(input.tabId)
        return JSON.stringify({ success: true })
      },
    }),

    new DynamicStructuredTool({
      name: 'close_tab',
      description: '关闭指定标签页。（破坏性操作，请谨慎使用）',
      schema: z.object({
        tabId: z.string().describe('要关闭的标签页 ID'),
      }),
      func: async (input) => {
        await window.api.tab.close(input.tabId)
        return JSON.stringify({ success: true })
      },
    }),

    new DynamicStructuredTool({
      name: 'list_groups',
      description: '列出所有分组。',
      schema: z.object({}),
      func: async () => {
        const groups = await window.api.group.list()
        return JSON.stringify(groups)
      },
    }),

    new DynamicStructuredTool({
      name: 'list_pages',
      description: '列出所有页面。',
      schema: z.object({}),
      func: async () => {
        const pages = await window.api.page.list()
        return JSON.stringify(pages)
      },
    }),
  ]
}
