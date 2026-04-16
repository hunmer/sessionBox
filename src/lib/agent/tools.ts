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

/** 工具元数据（用于 UI 展示，不依赖 targetTabId） */
export interface ToolMeta {
  name: string
  description: string
  category: string
}

/** 所有浏览器交互工具的元数据列表 */
export const BROWSER_TOOL_LIST: ToolMeta[] = [
  { name: 'click_element', description: '点击页面元素', category: '页面交互' },
  { name: 'type_text', description: '在输入框中输入文字', category: '页面交互' },
  { name: 'scroll_page', description: '滚动页面', category: '页面交互' },
  { name: 'select_option', description: '选择下拉框选项', category: '页面交互' },
  { name: 'hover_element', description: '鼠标悬停在元素上', category: '页面交互' },
  { name: 'get_page_content', description: '获取页面文本内容', category: '页面信息' },
  { name: 'get_dom', description: '获取指定元素 HTML', category: '页面信息' },
  { name: 'get_page_screenshot', description: '截取页面截图', category: '页面信息' },
  { name: 'list_tabs', description: '列出所有标签页', category: '标签页管理' },
  { name: 'create_tab', description: '创建新标签页', category: '标签页管理' },
  { name: 'navigate_tab', description: '导航到指定 URL', category: '标签页管理' },
  { name: 'switch_tab', description: '切换标签页', category: '标签页管理' },
  { name: 'close_tab', description: '关闭标签页', category: '标签页管理' },
  { name: 'list_groups', description: '列出所有分组', category: '标签页管理' },
  { name: 'list_pages', description: '列出所有页面', category: '标签页管理' },
  { name: 'get_page_summary', description: '获取页面结构化摘要（标题、heading、链接、meta）', category: '页面信息' },
  { name: 'get_page_markdown', description: '获取页面正文内容的 Markdown 表示', category: '页面信息' },
  { name: 'get_interactive_nodes', description: '获取页面中可见的交互节点简要列表（name, text, selector）', category: '页面信息' },
  { name: 'get_interactive_node_detail', description: '根据选择器获取单个交互节点的详细信息', category: '页面信息' },
  { name: 'get_active_tab', description: '获取当前对话选中的目标标签页信息', category: '标签页管理' },
  { name: 'write_skill', description: '保存或更新一个 Skill（Markdown 格式）', category: '技能管理' },
  { name: 'read_skill', description: '按名称读取 Skill 内容', category: '技能管理' },
  { name: 'list_skills', description: '列出所有已保存的 Skill（名称 + 说明）', category: '技能管理' },
  { name: 'search_skill', description: '按名称模糊搜索 Skill', category: '技能管理' },
  { name: 'exec_skill', description: '按名称执行一个 Skill，传入参数', category: '技能管理' },
]

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

    {
      name: 'get_page_summary',
      description: '获取页面结构化摘要，包括标题、URL、description、headings、links（最多 50 条）和 meta 信息。',
      input_schema: {
        type: 'object',
        properties: {
          tabId: tabIdField,
        },
      },
    },

    {
      name: 'get_page_markdown',
      description: '获取页面正文内容的 Markdown 表示。使用 Readability 提取正文，再转为 Markdown。适合阅读文章、博客、文档类页面。',
      input_schema: {
        type: 'object',
        properties: {
          tabId: tabIdField,
          maxLength: { type: 'number', description: 'Markdown 内容最大字符数，默认 10000', default: 10000 },
        },
      },
    },

    {
      name: 'get_interactive_nodes',
      description: '获取页面中可见的交互节点简要列表（按钮、链接、输入框等），每个节点仅返回 name、text、selector。用于快速定位目标元素，再用 get_interactive_node_detail 获取详情。默认仅返回视口内元素。',
      input_schema: {
        type: 'object',
        properties: {
          tabId: tabIdField,
          viewportOnly: { type: 'boolean', description: '是否仅返回视口内元素，默认 true', default: true },
        },
      },
    },

    {
      name: 'get_interactive_node_detail',
      description: '根据 CSS 选择器获取单个交互节点的详细信息，包括 tag、role、name、text、rect、visible、clickable、attributes、styles 等。先用 get_interactive_nodes 定位目标，再用本工具查看详情。',
      input_schema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS 选择器，来自 get_interactive_nodes 返回的 selector' },
          tabId: tabIdField,
        },
        required: ['selector'],
      },
    },

    {
      name: 'get_active_tab',
      description: '获取当前对话中用户选中的目标标签页信息（BrowserViewPicker 中选择的标签页）。返回标签页 ID、标题、URL 等信息。当不确定应操作哪个标签页时，应先调用此工具确认目标。',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },

    // ===== 技能管理工具 =====
    {
      name: 'write_skill',
      description:
        '保存或更新一个 Skill。Skill 以 Markdown 格式存储，包含名称、说明和内容（步骤 + 代码）。当用户说"保存 skill"或"创建技能"时使用。如果同名 Skill 已存在则覆盖。',
      input_schema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Skill 名称，使用小写英文 + 短横线，如 "scrape-product"、"batch-download"。作为唯一标识和文件名。',
          },
          description: {
            type: 'string',
            description: 'Skill 的一句话说明，用于 list/search 时展示。',
          },
          content: {
            type: 'string',
            description:
              'Skill 的 Markdown 正文，包含步骤、代码片段、参数说明等。支持 ```js 代码块，执行时会提取运行。',
          },
        },
        required: ['name', 'description', 'content'],
      },
    },

    {
      name: 'read_skill',
      description:
        '按名称读取 Skill 的完整内容。返回 Markdown 正文。当用户说"查看 skill"、"读取技能"时使用。',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Skill 名称' },
        },
        required: ['name'],
      },
    },

    {
      name: 'list_skills',
      description:
        '列出所有已保存的 Skill，返回名称和说明。当用户说"列出 skill"、"有哪些技能"时使用。',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },

    {
      name: 'search_skill',
      description:
        '按名称模糊搜索 Skill。返回匹配的 Skill 列表（名称 + 说明）。当用户说"搜索 skill"或不确定完整名称时使用。',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '搜索关键词（支持模糊匹配）' },
        },
        required: ['name'],
      },
    },

    {
      name: 'exec_skill',
      description:
        '按名称执行一个已保存的 Skill。Skill 的 Markdown 正文中 ```js 代码块会被提取并按顺序执行，步骤中的参数占位符会被替换。当用户说"执行 skill"、"运行技能"时使用。找不到时建议先 search_skill。',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '要执行的 Skill 名称' },
          params: {
            type: 'object',
            description:
              '传给 Skill 的参数键值对，对应 Skill 内容中的占位符。例如 { "url": "https://example.com", "count": 5 }',
            properties: {},
          },
        },
        required: ['name'],
      },
    },
  ]
}
