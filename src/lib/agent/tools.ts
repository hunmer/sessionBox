/**
 * 浏览器交互工具定义（Anthropic function calling 格式）
 * 工具的实际执行由主进程通过 CDP 完成，渲染进程只负责定义 schema。
 */

export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/**
 * 创建浏览器交互工具集
 * @param targetTabId 默认目标标签页 ID
 */
export function createBrowserTools(targetTabId: string | null): ToolDefinition[] {
  const tabIdField = { type: 'string' as const, description: '目标标签页 ID' }

  return [
    {
      name: 'click_element',
      description: '点击页面上的元素。通过 CSS 选择器定位目标元素。',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器，例如 "#login-btn", ".submit-button"' },
          tabId: tabIdField,
        },
        required: ['selector'],
      },
    },

    {
      name: 'type_text',
      description: '在输入框中输入文字。',
      input_schema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要输入的文字' },
          selector: { type: 'string', description: 'CSS 选择器定位输入框' },
          tabId: tabIdField,
        },
        required: ['text'],
      },
    },

    {
      name: 'scroll_page',
      description: '滚动页面。',
      input_schema: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: '滚动方向' },
          amount: { type: 'number', description: '滚动像素数', default: 300 },
          tabId: tabIdField,
        },
        required: ['direction'],
      },
    },

    {
      name: 'select_option',
      description: '选择下拉框的选项。',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'select 元素的 CSS 选择器' },
          value: { type: 'string', description: '要选中的选项值' },
          tabId: tabIdField,
        },
        required: ['selector', 'value'],
      },
    },

    {
      name: 'hover_element',
      description: '鼠标悬停在元素上。',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          tabId: tabIdField,
        },
        required: ['selector'],
      },
    },

    {
      name: 'get_page_content',
      description: '获取页面的文本内容。',
      input_schema: {
        type: 'object',
        properties: {
          tabId: tabIdField,
        },
      },
    },

    {
      name: 'get_dom',
      description: '获取指定元素的 outerHTML。',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器' },
          tabId: tabIdField,
        },
        required: ['selector'],
      },
    },

    {
      name: 'get_page_screenshot',
      description: '截取页面截图。',
      input_schema: {
        type: 'object',
        properties: {
          tabId: tabIdField,
          format: { type: 'string', enum: ['png', 'jpeg'], description: '截图格式' },
        },
      },
    },

    // ===== 标签页管理工具 =====
    {
      name: 'list_tabs',
      description: '列出所有打开的标签页。',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },

    {
      name: 'create_tab',
      description: '创建新标签页。',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要打开的 URL' },
          pageId: { type: 'string', description: '已有页面 ID' },
        },
        required: ['url'],
      },
    },

    {
      name: 'navigate_tab',
      description: '在标签页中导航到指定 URL。',
      input_schema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '目标 URL' },
          tabId: tabIdField,
        },
        required: ['url'],
      },
    },

    {
      name: 'switch_tab',
      description: '切换到指定标签页。',
      input_schema: {
        type: 'object',
        properties: {
          tabId: { type: 'string', description: '要切换到的标签页 ID' },
        },
        required: ['tabId'],
      },
    },

    {
      name: 'close_tab',
      description: '关闭指定标签页。（破坏性操作，请谨慎使用）',
      input_schema: {
        type: 'object',
        properties: {
          tabId: { type: 'string', description: '要关闭的标签页 ID' },
        },
        required: ['tabId'],
      },
    },

    {
      name: 'list_groups',
      description: '列出所有分组。',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },

    {
      name: 'list_pages',
      description: '列出所有页面。',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
  ]
}
