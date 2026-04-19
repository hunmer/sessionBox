// src/lib/workflow/nodeRegistry.ts
import { BROWSER_TOOL_LIST } from '@/lib/agent/tools'
import type { NodeTypeDefinition, NodeProperty } from './types'

/** 工具 schema property 到 NodeProperty 的转换 */
function schemaToProps(
  properties: Record<string, any>,
  required?: string[],
): NodeProperty[] {
  return Object.entries(properties).map(([key, schema]) => {
    const prop: NodeProperty = {
      key,
      label: schema.description || key,
      type: inferPropType(schema),
      required: required?.includes(key),
      tooltip: schema.description,
    }
    if (schema.enum) {
      prop.type = 'select'
      prop.options = schema.enum.map((v: string) => ({ label: v, value: v }))
    }
    if (schema.default !== undefined) {
      prop.default = schema.default
    }
    return prop
  })
}

function inferPropType(schema: any): NodeProperty['type'] {
  if (schema.enum) return 'select'
  switch (schema.type) {
    case 'number':
    case 'integer':
      return 'number'
    case 'boolean':
      return 'checkbox'
    case 'string':
      return 'text'
    default:
      return 'text'
  }
}

/** 工具完整 schema 定义（从 tools.ts createBrowserTools 中提取） */
const toolSchemas: Record<string, { properties: Record<string, any>; required?: string[] }> = {
  click_element: {
    properties: {
      selector: { type: 'string', description: 'CSS 选择器，例如 "#login-btn", ".submit-button"' },
      tabId: { type: 'string', description: '目标标签页 ID' },
    },
    required: ['selector'],
  },
  input_text: {
    properties: {
      text: { type: 'string', description: '要输入的文字' },
      selector: { type: 'string', description: 'CSS 选择器定位输入框' },
      tabId: { type: 'string', description: '目标标签页 ID' },
    },
    required: ['text'],
  },
  scroll_page: {
    properties: {
      direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: '滚动方向' },
      amount: { type: 'number', description: '滚动像素数', default: 300 },
      tabId: { type: 'string', description: '目标标签页 ID' },
    },
    required: ['direction'],
  },
  select_option: {
    properties: {
      selector: { type: 'string', description: 'select 元素的 CSS 选择器' },
      value: { type: 'string', description: '要选中的选项值' },
      tabId: { type: 'string', description: '目标标签页 ID' },
    },
    required: ['selector', 'value'],
  },
  hover_element: {
    properties: {
      selector: { type: 'string', description: 'CSS 选择器' },
      tabId: { type: 'string', description: '目标标签页 ID' },
    },
    required: ['selector'],
  },
  get_page_content: {
    properties: { tabId: { type: 'string', description: '目标标签页 ID' } },
  },
  get_dom: {
    properties: {
      selector: { type: 'string', description: 'CSS 选择器' },
      tabId: { type: 'string', description: '目标标签页 ID' },
    },
    required: ['selector'],
  },
  get_page_screenshot: {
    properties: {
      tabId: { type: 'string', description: '目标标签页 ID' },
      format: { type: 'string', enum: ['png', 'jpeg'], description: '截图格式' },
    },
  },
  get_page_summary: {
    properties: { tabId: { type: 'string', description: '目标标签页 ID' } },
  },
  get_page_markdown: {
    properties: {
      tabId: { type: 'string', description: '目标标签页 ID' },
      maxLength: { type: 'number', description: 'Markdown 内容最大字符数，默认 10000', default: 10000 },
    },
  },
  get_interactive_nodes: {
    properties: {
      tabId: { type: 'string', description: '目标标签页 ID' },
      viewportOnly: { type: 'boolean', description: '是否仅返回视口内元素，默认 true', default: true },
    },
  },
  get_interactive_node_detail: {
    properties: {
      selector: { type: 'string', description: 'CSS 选择器' },
      tabId: { type: 'string', description: '目标标签页 ID' },
    },
    required: ['selector'],
  },
  list_tabs: { properties: {} },
  create_tab: {
    properties: {
      url: { type: 'string', description: '要打开的 URL（默认百度）' },
      pageId: { type: 'string', description: '已有页面 ID，传入后使用页面名称和容器' },
      containerId: { type: 'string', description: '容器 ID，无 pageId 时指定 Session 隔离' },
      workspaceId: { type: 'string', description: '工作区 ID，不传则使用当前激活工作区' },
      active: { type: 'boolean', description: '是否立即激活标签页（默认 true）' },
    },
  },
  navigate_tab: {
    properties: {
      url: { type: 'string', description: '目标 URL' },
      tabId: { type: 'string', description: '目标标签页 ID' },
    },
    required: ['url'],
  },
  switch_tab: {
    properties: { tabId: { type: 'string', description: '要切换到的标签页 ID' } },
    required: ['tabId'],
  },
  close_tab: {
    properties: { tabId: { type: 'string', description: '要关闭的标签页 ID' } },
    required: ['tabId'],
  },
  create_window: {
    properties: {
      url: { type: 'string', description: '要打开的 URL' },
      pageId: { type: 'string', description: '已有页面 ID，用于关联容器' },
      containerId: { type: 'string', description: '容器 ID，用于 Session 隔离' },
      title: { type: 'string', description: '窗口标题' },
      width: { type: 'number', description: '窗口宽度，默认 1280' },
      height: { type: 'number', description: '窗口高度，默认 800' },
    },
    required: ['url'],
  },
  navigate_window: {
    properties: {
      windowId: { type: 'number', description: '目标窗口 ID' },
      url: { type: 'string', description: '目标 URL' },
    },
    required: ['windowId', 'url'],
  },
  close_window: {
    properties: { windowId: { type: 'number', description: '要关闭的窗口 ID' } },
    required: ['windowId'],
  },
  list_windows: { properties: {} },
  focus_window: {
    properties: { windowId: { type: 'number', description: '目标窗口 ID' } },
    required: ['windowId'],
  },
  screenshot_window: {
    properties: { windowId: { type: 'number', description: '目标窗口 ID' } },
    required: ['windowId'],
  },
  get_window_detail: {
    properties: { windowId: { type: 'number', description: '目标窗口 ID' } },
    required: ['windowId'],
  },
  list_workspaces: { properties: {} },
  list_groups: { properties: {} },
  list_pages: { properties: {} },
  get_active_tab: { properties: {} },
  write_skill: {
    properties: {
      name: { type: 'string', description: 'Skill 名称，小写英文+短横线' },
      description: { type: 'string', description: 'Skill 一句话说明' },
      content: { type: 'string', description: 'Skill 的 Markdown 正文' },
    },
    required: ['name', 'description', 'content'],
  },
  read_skill: {
    properties: { name: { type: 'string', description: 'Skill 名称' } },
    required: ['name'],
  },
  list_skills: { properties: {} },
  search_skill: {
    properties: { name: { type: 'string', description: '搜索关键词' } },
    required: ['name'],
  },
  inject_js: {
    properties: {
      webContentId: { type: 'number', description: '目标 WebContents ID（Electron webContents.id）' },
      code: { type: 'string', description: '要注入执行的 JavaScript 代码' },
    },
    required: ['webContentId', 'code'],
  },
}

function getToolIcon(name: string): string {
  const iconMap: Record<string, string> = {
    click_element: 'MousePointerClick',
    input_text: 'Type',
    scroll_page: 'ArrowUpDown',
    select_option: 'List',
    hover_element: 'Pointer',
    get_page_content: 'FileText',
    get_dom: 'Code',
    get_page_screenshot: 'Camera',
    get_page_summary: 'ClipboardList',
    get_page_markdown: 'BookOpen',
    get_interactive_nodes: 'MousePointer',
    get_interactive_node_detail: 'Search',
    list_tabs: 'LayoutList',
    create_tab: 'Plus',
    navigate_tab: 'Navigation',
    switch_tab: 'ArrowRightLeft',
    close_tab: 'X',
    create_window: 'AppWindow',
    navigate_window: 'Navigation',
    close_window: 'X',
    list_windows: 'LayoutList',
    focus_window: 'Maximize',
    screenshot_window: 'Camera',
    get_window_detail: 'Info',
    list_workspaces: 'Briefcase',
    list_groups: 'FolderTree',
    list_pages: 'Layers',
    get_active_tab: 'AppWindow',
    write_skill: 'Save',
    read_skill: 'BookOpen',
    list_skills: 'List',
    search_skill: 'Search',
    inject_js: 'FileCode',
    run_code: 'Terminal',
    toast: 'Bell',
    agent_chat: 'Bot',
    switch: 'GitBranch',
    start: 'LogIn',
    end: 'LogOut',
  }
  return iconMap[name] || 'Circle'
}

/** 从 BROWSER_TOOL_LIST 构建节点定义 */
function buildToolNodeDefinitions(): NodeTypeDefinition[] {
  return BROWSER_TOOL_LIST.map((tool) => {
    const schema = toolSchemas[tool.name] || { properties: {} }
    return {
      type: tool.name,
      label: tool.description,
      category: tool.category,
      icon: getToolIcon(tool.name),
      description: tool.description,
      properties: schemaToProps(schema.properties, schema.required),
    }
  })
}

/** 选择器条件操作符 */
export const CONDITION_OPERATORS = [
  { value: 'equals', label: '等于' },
  { value: 'not_equals', label: '不等于' },
  { value: 'greater_than', label: '大于' },
  { value: 'less_than', label: '小于' },
  { value: 'greater_than_or_equal', label: '大于等于' },
  { value: 'less_than_or_equal', label: '小于等于' },
  { value: 'contains', label: '包含' },
  { value: 'not_contains', label: '不包含' },
  { value: 'starts_with', label: '开头是' },
  { value: 'ends_with', label: '结尾是' },
  { value: 'is_empty', label: '为空' },
  { value: 'is_not_empty', label: '不为空' },
] as const

/** 不需要比较值的操作符 */
export const NO_VALUE_OPERATORS = new Set(['is_empty', 'is_not_empty'])

/** 新增节点定义 */
const customNodeDefinitions: NodeTypeDefinition[] = [
  {
    type: 'start',
    label: '开始',
    category: '流程控制',
    icon: 'LogIn',
    description: '工作流入口节点，仅支持输出连接',
    properties: [],
    handles: { source: true, target: false },
  },
  {
    type: 'end',
    label: '结束',
    category: '流程控制',
    icon: 'LogOut',
    description: '工作流出口节点，仅支持输入连接',
    properties: [],
    handles: { source: false, target: true },
  },
  {
    type: 'run_code',
    label: '运行 JS 代码',
    category: '流程控制',
    icon: 'Terminal',
    description: '执行自定义 JavaScript 代码，可通过 context 访问上游数据',
    properties: [
      {
        key: 'code',
        label: '代码',
        type: 'code',
        required: true,
        tooltip: 'JavaScript 代码，可使用 context 变量。返回值将写入 context[this.id]',
      },
    ],
  },
  {
    type: 'toast',
    label: 'Toast 消息',
    category: '流程控制',
    icon: 'Bell',
    description: '显示 Toast 通知消息',
    properties: [
      {
        key: 'message',
        label: '消息内容',
        type: 'text',
        required: true,
        tooltip: '要显示的消息文本',
      },
      {
        key: 'type',
        label: '消息类型',
        type: 'select',
        default: 'info',
        options: [
          { label: '信息', value: 'info' },
          { label: '成功', value: 'success' },
          { label: '警告', value: 'warning' },
          { label: '错误', value: 'error' },
        ],
      },
    ],
  },
  {
    type: 'switch',
    label: '选择器',
    category: '流程控制',
    icon: 'GitBranch',
    description: '条件分支路由，按条件顺序匹配，输出 = 条件数 + 1（默认）',
    properties: [
      {
        key: 'conditions',
        label: '条件列表',
        type: 'conditions',
        tooltip: '按顺序评估条件，匹配则走对应分支，全部不匹配走默认分支',
      },
    ],
    handles: {
      target: true,
      dynamicSource: {
        dataKey: 'conditions',
        extraCount: 1,
      },
    },
  },
  {
    type: 'agent_chat',
    label: 'AI 对话',
    category: 'AI',
    icon: 'Bot',
    description: '调用 AI 处理文本，prompt 支持 $context 变量替换',
    properties: [
      {
        key: 'prompt',
        label: 'Prompt',
        type: 'textarea',
        required: true,
        tooltip: 'AI 提示词，可用 {{context.nodeId.field}} 引用上下文变量',
      },
      {
        key: 'systemPrompt',
        label: '系统提示词',
        type: 'textarea',
        tooltip: '可选的系统级提示词',
      },
    ],
  },
]

/** 所有节点定义（合并） */
export const allNodeDefinitions: NodeTypeDefinition[] = [
  ...buildToolNodeDefinitions(),
  ...customNodeDefinitions,
]

/** 按类别分组 */
export function getNodeDefinitionsByCategory(): Record<string, NodeTypeDefinition[]> {
  const groups: Record<string, NodeTypeDefinition[]> = {}
  for (const def of allNodeDefinitions) {
    if (!groups[def.category]) groups[def.category] = []
    groups[def.category].push(def)
  }
  return groups
}

/** 按类型查找定义 */
export function getNodeDefinition(type: string): NodeTypeDefinition | undefined {
  return allNodeDefinitions.find((d) => d.type === type)
}

/** 搜索节点 */
export function searchNodeDefinitions(query: string): NodeTypeDefinition[] {
  const q = query.toLowerCase()
  return allNodeDefinitions.filter(
    (d) => d.label.toLowerCase().includes(q) || d.type.toLowerCase().includes(q),
  )
}
