/**
 * 浏览器 Agent 工具定义。
 *
 * 业务工具仍由主进程执行；模型侧默认只暴露工具发现工具，
 * 按「分类 -> 工具列表 -> 工具详情 -> 执行」逐层获取能力信息。
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

export type ToolCategoryName = 'workflow' | 'tab' | 'auto' | 'skill' | 'workspace' | 'page' | 'dom' | 'utils'
export type ToolRiskLevel = 'low' | 'medium' | 'high'
export type DiscoveryStage = 'category_list' | 'tool_list' | 'tool_detail' | 'execute'
export type DiscoveryNextAction =
  | 'select_category'
  | 'select_tool'
  | 'get_tool_detail'
  | 'execute'
  | 'none'

/** 工具元数据（用于 UI 展示和分层披露，不依赖 targetTabId） */
export interface ToolMeta {
  name: string
  description: string
  category: string
  discoveryCategory: ToolCategoryName
  tags: string[]
  riskLevel: ToolRiskLevel
  suitableFor: string[]
}

export interface ToolCategoryInfo {
  name: ToolCategoryName
  scenario: string
  suitable_for: string[]
  not_suitable_for: string[]
}

export interface ToolDiscoveryResponse<TData = Record<string, unknown>> {
  stage: DiscoveryStage
  need_next: boolean
  next_action: DiscoveryNextAction
  data: TData
  message: string
}

type EnabledToolFilter = ReadonlySet<string> | string[] | undefined

export const TOOL_CATEGORY_INFOS: ToolCategoryInfo[] = [
  {
    name: 'workflow',
    scenario: '多步骤编排、跨工具联动和任务流调度。',
    suitable_for: ['顺序执行多个动作', '条件分支和循环', '协调多个工具完成复杂任务'],
    not_suitable_for: ['单一页面点击', '单个 DOM 操作', '只做标签页切换'],
  },
  {
    name: 'tab',
    scenario: '浏览器标签页管理。',
    suitable_for: ['打开新标签页', '切换标签页', '关闭标签页', '获取标签页列表'],
    not_suitable_for: ['页面元素交互', '页面内容解析', '自动化工作流'],
  },
  {
    name: 'auto',
    scenario: '自动执行、批量执行和无人值守执行。',
    suitable_for: ['批量处理', '定时任务', '自动登录后执行', '自动重复操作'],
    not_suitable_for: ['单次人工交互', '精细 DOM 定位', '页面级信息读取'],
  },
  {
    name: 'skill',
    scenario: '高层抽象能力，类似任务技能包。',
    suitable_for: ['业务任务封装', '复用型能力', '上层语义动作'],
    not_suitable_for: ['低层页面操作', '原子 DOM 点击', '标签页管理'],
  },
  {
    name: 'workspace',
    scenario: '上下文、资源和项目空间管理。',
    suitable_for: ['文件/任务/会话管理', '项目环境切换', '资源加载', '数据缓存'],
    not_suitable_for: ['页面点击', 'DOM 查询', '浏览器标签页操作'],
  },
  {
    name: 'page',
    scenario: '页面级操作，介于 tab 和 dom 之间。',
    suitable_for: ['页面跳转', '刷新页面', '获取页面标题和 URL', '页面截图', '页面整体状态读取'],
    not_suitable_for: ['精确定位某个元素', '复杂组件内部交互'],
  },
  {
    name: 'dom',
    scenario: '页面 DOM 级别操作，是最细粒度的交互层。',
    suitable_for: ['查找元素', '点击按钮', '输入文本', '读取元素文本', '判断元素状态'],
    not_suitable_for: ['标签页管理', '项目/工作区管理', '工作流编排'],
  },
  {
    name: 'utils',
    scenario: '通用辅助工具，提供流程控制与辅助能力。',
    suitable_for: ['等待页面加载', '延迟执行下一步', '流程中插入固定等待', '等待 AJAX 请求完成'],
    not_suitable_for: ['页面元素交互', '标签页管理', 'DOM 操作', '工作流编排'],
  },
]

/** 所有浏览器业务工具的元数据列表 */
export const BROWSER_TOOL_LIST: ToolMeta[] = [
  {
    name: 'click_element',
    description: '点击页面元素',
    category: '页面交互',
    discoveryCategory: 'dom',
    tags: ['action', 'click', 'interaction'],
    riskLevel: 'medium',
    suitableFor: ['点击按钮', '点击链接', '触发页面元素交互'],
  },
  {
    name: 'input_text',
    description: '在输入框中输入文字',
    category: '页面交互',
    discoveryCategory: 'dom',
    tags: ['action', 'input', 'form'],
    riskLevel: 'medium',
    suitableFor: ['填写表单', '输入搜索词', '编辑文本框内容'],
  },
  {
    name: 'scroll_page',
    description: '滚动页面',
    category: '页面交互',
    discoveryCategory: 'page',
    tags: ['action', 'scroll', 'viewport'],
    riskLevel: 'low',
    suitableFor: ['浏览页面上下文', '加载懒加载内容', '调整视口位置'],
  },
  {
    name: 'select_option',
    description: '选择下拉框选项',
    category: '页面交互',
    discoveryCategory: 'dom',
    tags: ['action', 'select', 'form'],
    riskLevel: 'medium',
    suitableFor: ['选择 select 下拉框选项', '填写表单枚举项'],
  },
  {
    name: 'hover_element',
    description: '鼠标悬停在元素上',
    category: '页面交互',
    discoveryCategory: 'dom',
    tags: ['action', 'hover', 'interaction'],
    riskLevel: 'low',
    suitableFor: ['触发悬浮菜单', '查看 tooltip', '展开 hover 状态内容'],
  },
  {
    name: 'get_page_content',
    description: '获取页面文本内容',
    category: '页面信息',
    discoveryCategory: 'page',
    tags: ['read', 'text', 'content'],
    riskLevel: 'low',
    suitableFor: ['读取页面整体文本', '快速提取页面可见内容'],
  },
  {
    name: 'get_dom',
    description: '获取指定元素 HTML',
    category: '页面信息',
    discoveryCategory: 'dom',
    tags: ['read', 'html', 'selector'],
    riskLevel: 'low',
    suitableFor: ['查看元素结构', '调试 CSS 选择器', '读取局部 HTML'],
  },
  {
    name: 'get_page_screenshot',
    description: '截取页面截图',
    category: '页面信息',
    discoveryCategory: 'page',
    tags: ['read', 'screenshot', 'visual'],
    riskLevel: 'low',
    suitableFor: ['获取页面视觉状态', '确认页面布局', '保存当前页面截图'],
  },
  {
    name: 'list_tabs',
    description: '列出所有标签页',
    category: '标签页管理',
    discoveryCategory: 'tab',
    tags: ['read', 'tab', 'list'],
    riskLevel: 'low',
    suitableFor: ['查看当前打开的标签页', '定位目标标签页'],
  },
  {
    name: 'create_tab',
    description: '创建新标签页',
    category: '标签页管理',
    discoveryCategory: 'tab',
    tags: ['action', 'tab', 'create'],
    riskLevel: 'medium',
    suitableFor: ['打开新页面', '创建新的浏览上下文'],
  },
  {
    name: 'navigate_tab',
    description: '导航到指定 URL',
    category: '标签页管理',
    discoveryCategory: 'page',
    tags: ['action', 'navigate', 'url'],
    riskLevel: 'medium',
    suitableFor: ['让当前标签页跳转 URL', '打开指定网页'],
  },
  {
    name: 'switch_tab',
    description: '切换标签页',
    category: '标签页管理',
    discoveryCategory: 'tab',
    tags: ['action', 'tab', 'switch'],
    riskLevel: 'low',
    suitableFor: ['切换到指定标签页', '改变当前操作目标'],
  },
  {
    name: 'close_tab',
    description: '关闭标签页',
    category: '标签页管理',
    discoveryCategory: 'tab',
    tags: ['action', 'tab', 'destructive'],
    riskLevel: 'high',
    suitableFor: ['关闭明确指定的标签页', '清理不需要的页面'],
  },
  {
    name: 'create_window',
    description: '创建独立浏览器窗口',
    category: '窗口管理',
    discoveryCategory: 'tab',
    tags: ['action', 'window', 'create'],
    riskLevel: 'medium',
    suitableFor: ['在独立窗口中打开页面', '隔离会话浏览'],
  },
  {
    name: 'navigate_window',
    description: '导航窗口到指定 URL',
    category: '窗口管理',
    discoveryCategory: 'page',
    tags: ['action', 'window', 'navigate'],
    riskLevel: 'medium',
    suitableFor: ['在独立窗口中跳转 URL'],
  },
  {
    name: 'close_window',
    description: '关闭独立浏览器窗口',
    category: '窗口管理',
    discoveryCategory: 'tab',
    tags: ['action', 'window', 'destructive'],
    riskLevel: 'high',
    suitableFor: ['关闭指定的独立窗口'],
  },
  {
    name: 'list_windows',
    description: '列出所有打开的窗口',
    category: '窗口管理',
    discoveryCategory: 'tab',
    tags: ['read', 'window', 'list'],
    riskLevel: 'low',
    suitableFor: ['查看所有窗口列表', '定位目标窗口'],
  },
  {
    name: 'focus_window',
    description: '聚焦窗口到前台',
    category: '窗口管理',
    discoveryCategory: 'tab',
    tags: ['action', 'window', 'focus'],
    riskLevel: 'low',
    suitableFor: ['将窗口显示到前台', '恢复最小化的窗口'],
  },
  {
    name: 'screenshot_window',
    description: '截取窗口截图',
    category: '窗口管理',
    discoveryCategory: 'page',
    tags: ['read', 'window', 'screenshot'],
    riskLevel: 'low',
    suitableFor: ['截取独立窗口的页面截图'],
  },
  {
    name: 'get_window_detail',
    description: '获取窗口详细信息',
    category: '窗口管理',
    discoveryCategory: 'tab',
    tags: ['read', 'window', 'detail'],
    riskLevel: 'low',
    suitableFor: ['查看窗口标题、URL、尺寸等详细信息'],
  },
  {
    name: 'list_workspaces',
    description: '列出所有工作区',
    category: '工作区管理',
    discoveryCategory: 'workspace',
    tags: ['read', 'workspace', 'list'],
    riskLevel: 'low',
    suitableFor: ['查看工作区列表', '确认项目空间上下文'],
  },
  {
    name: 'list_groups',
    description: '列出所有分组',
    category: '工作区管理',
    discoveryCategory: 'workspace',
    tags: ['read', 'group', 'list'],
    riskLevel: 'low',
    suitableFor: ['查看分组列表', '确认页面所属分组'],
  },
  {
    name: 'list_pages',
    description: '列出所有页面',
    category: '工作区管理',
    discoveryCategory: 'workspace',
    tags: ['read', 'page-resource', 'list'],
    riskLevel: 'low',
    suitableFor: ['查看已保存页面', '定位页面资源'],
  },
  {
    name: 'get_page_summary',
    description: '获取页面结构化摘要（标题、heading、链接、meta）',
    category: '页面信息',
    discoveryCategory: 'page',
    tags: ['read', 'summary', 'structure'],
    riskLevel: 'low',
    suitableFor: ['快速理解页面结构', '获取标题 URL heading 链接等摘要'],
  },
  {
    name: 'get_page_markdown',
    description: '获取页面正文内容的 Markdown 表示',
    category: '页面信息',
    discoveryCategory: 'page',
    tags: ['read', 'markdown', 'article'],
    riskLevel: 'low',
    suitableFor: ['阅读文章正文', '提取文档内容', '生成页面摘要'],
  },
  {
    name: 'get_interactive_nodes',
    description: '获取页面中可见的交互节点简要列表（name, text, selector）',
    category: '页面信息',
    discoveryCategory: 'dom',
    tags: ['query', 'locator', 'read'],
    riskLevel: 'low',
    suitableFor: ['查找按钮', '查找输入框', '获取可交互元素选择器'],
  },
  {
    name: 'get_interactive_node_detail',
    description: '根据选择器获取单个交互节点的详细信息',
    category: '页面信息',
    discoveryCategory: 'dom',
    tags: ['query', 'detail', 'selector'],
    riskLevel: 'low',
    suitableFor: ['确认元素是否可见', '读取元素属性', '验证点击目标'],
  },
  {
    name: 'get_active_tab',
    description: '获取当前对话选中的目标标签页信息',
    category: '标签页管理',
    discoveryCategory: 'tab',
    tags: ['read', 'tab', 'active'],
    riskLevel: 'low',
    suitableFor: ['确认当前操作标签页', '获取目标 tabId'],
  },
  {
    name: 'write_skill',
    description: '保存或更新一个 Skill（Markdown 格式）',
    category: '技能管理',
    discoveryCategory: 'skill',
    tags: ['action', 'skill', 'write'],
    riskLevel: 'medium',
    suitableFor: ['创建技能', '保存复用任务步骤', '更新技能内容'],
  },
  {
    name: 'read_skill',
    description: '按名称读取 Skill 内容',
    category: '技能管理',
    discoveryCategory: 'skill',
    tags: ['read', 'skill', 'detail'],
    riskLevel: 'low',
    suitableFor: ['查看技能内容', '确认技能实现'],
  },
  {
    name: 'list_skills',
    description: '列出所有已保存的 Skill（名称 + 说明）',
    category: '技能管理',
    discoveryCategory: 'skill',
    tags: ['read', 'skill', 'list'],
    riskLevel: 'low',
    suitableFor: ['查看可用技能', '选择技能执行'],
  },
  {
    name: 'search_skill',
    description: '按名称模糊搜索 Skill',
    category: '技能管理',
    discoveryCategory: 'skill',
    tags: ['read', 'skill', 'search'],
    riskLevel: 'low',
    suitableFor: ['按关键词查找技能', '不确定完整技能名时搜索'],
  },
  {
    name: 'delay',
    description: '延迟等待指定时间后继续执行，用于等待页面加载、AJAX 完成或动画结束',
    category: '辅助工具',
    discoveryCategory: 'utils',
    tags: ['wait', 'delay', 'sleep', 'timing'],
    riskLevel: 'low',
    suitableFor: ['等待页面加载完成', '等待 AJAX 请求返回', '等待动画结束', '流程中插入固定间隔'],
  },
  {
    name: 'inject_js',
    description: '向指定 WebContents 注入并执行 JavaScript 代码',
    category: '页面交互',
    discoveryCategory: 'page',
    tags: ['action', 'javascript', 'inject', 'execute'],
    riskLevel: 'high',
    suitableFor: ['注入自定义脚本', '执行页面内 JS 操作', '动态修改页面行为'],
  },
]

export const DISCOVERY_TOOL_NAMES = [
  'list_categories',
  'list_tools_by_category',
  'get_tool_detail',
  'execute_tool',
] as const

const TOOL_EXAMPLE_INPUTS: Record<string, Record<string, unknown>> = {
  click_element: { selector: '#submitBtn' },
  input_text: { selector: '#searchInput', text: 'SessionBox' },
  scroll_page: { direction: 'down', amount: 500 },
  select_option: { selector: '#country', value: 'CN' },
  hover_element: { selector: '.menu-item' },
  get_page_content: {},
  get_dom: { selector: 'main' },
  get_page_screenshot: { format: 'jpeg' },
  list_tabs: {},
  create_tab: { url: 'https://example.com' },
  navigate_tab: { url: 'https://example.com' },
  switch_tab: { tabId: 'tab-1' },
  close_tab: { tabId: 'tab-1' },
  create_window: { url: 'https://example.com' },
  navigate_window: { windowId: 2, url: 'https://example.com' },
  close_window: { windowId: 2 },
  list_windows: {},
  focus_window: { windowId: 2 },
  screenshot_window: { windowId: 2 },
  get_window_detail: { windowId: 2 },
  list_workspaces: {},
  list_groups: {},
  list_pages: {},
  get_page_summary: {},
  get_page_markdown: { maxLength: 10000 },
  get_interactive_nodes: { viewportOnly: true },
  get_interactive_node_detail: { selector: '#submitBtn' },
  get_active_tab: {},
  write_skill: {
    name: 'open-example',
    description: '打开示例页面',
    content: '打开 https://example.com 并读取标题。',
  },
  read_skill: { name: 'open-example' },
  list_skills: {},
  search_skill: { name: 'example' },
  delay: { milliseconds: 2000, reason: '等待页面加载完成' },
  inject_js: { webContentId: 5, code: 'return document.title' },
}

const GENERIC_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean', description: '工具是否执行成功。读取类工具可能直接返回结果对象。' },
    result: { type: 'object', description: '工具执行结果。' },
    error: { type: 'string', description: '失败原因。' },
  },
}

/** DOM 交互工具：点击、输入、滚动、选择、悬停 */
function createDomInteractionTools(tabIdField: { type: 'string'; description: string }): ToolDefinition[] {
  return [
    { name: 'click_element', description: '点击页面上的元素。通过 CSS 选择器定位目标元素。', input_schema: { type: 'object', properties: { selector: { type: 'string', description: 'CSS 选择器，例如 "#login-btn", ".submit-button"' }, tabId: tabIdField }, required: ['selector'] } },
    { name: 'input_text', description: '在输入框中输入文字。', input_schema: { type: 'object', properties: { text: { type: 'string', description: '要输入的文字' }, selector: { type: 'string', description: 'CSS 选择器定位输入框' }, tabId: tabIdField }, required: ['text'] } },
    { name: 'scroll_page', description: '滚动页面。', input_schema: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down', 'left', 'right'], description: '滚动方向' }, amount: { type: 'number', description: '滚动像素数', default: 300 }, tabId: tabIdField }, required: ['direction'] } },
    { name: 'select_option', description: '选择下拉框的选项。', input_schema: { type: 'object', properties: { selector: { type: 'string', description: 'select 元素的 CSS 选择器' }, value: { type: 'string', description: '要选中的选项值' }, tabId: tabIdField }, required: ['selector', 'value'] } },
    { name: 'hover_element', description: '鼠标悬停在元素上。', input_schema: { type: 'object', properties: { selector: { type: 'string', description: 'CSS 选择器' }, tabId: tabIdField }, required: ['selector'] } },
  ]
}

/** 页面信息工具：获取内容、DOM、截图、摘要、Markdown */
function createPageInfoTools(tabIdField: { type: 'string'; description: string }): ToolDefinition[] {
  return [
    { name: 'get_page_content', description: '获取页面的文本内容。', input_schema: { type: 'object', properties: { tabId: tabIdField } } },
    { name: 'get_dom', description: '获取指定元素的 outerHTML。', input_schema: { type: 'object', properties: { selector: { type: 'string', description: 'CSS 选择器' }, tabId: tabIdField }, required: ['selector'] } },
    { name: 'get_page_screenshot', description: '截取页面截图。', input_schema: { type: 'object', properties: { tabId: tabIdField, format: { type: 'string', enum: ['png', 'jpeg'], description: '截图格式' } } } },
    { name: 'get_page_summary', description: '获取页面结构化摘要，包括标题、URL、description、headings、links（最多 50 条）和 meta 信息。', input_schema: { type: 'object', properties: { tabId: tabIdField } } },
    { name: 'get_page_markdown', description: '获取页面正文内容的 Markdown 表示。使用 Readability 提取正文，再转为 Markdown。适合阅读文章、博客、文档类页面。', input_schema: { type: 'object', properties: { tabId: tabIdField, maxLength: { type: 'number', description: 'Markdown 内容最大字符数，默认 10000', default: 10000 } } } },
  ]
}

/** 标签页管理工具 */
function createTabTools(tabIdField: { type: 'string'; description: string }): ToolDefinition[] {
  return [
    { name: 'list_tabs', description: '列出所有打开的标签页。', input_schema: { type: 'object', properties: {} } },
    { name: 'create_tab', description: '创建新标签页。', input_schema: { type: 'object', properties: { url: { type: 'string', description: '要打开的 URL' }, pageId: { type: 'string', description: '已有页面 ID' } }, required: ['url'] } },
    { name: 'navigate_tab', description: '在标签页中导航到指定 URL。', input_schema: { type: 'object', properties: { url: { type: 'string', description: '目标 URL' }, tabId: tabIdField }, required: ['url'] } },
    { name: 'switch_tab', description: '切换到指定标签页。', input_schema: { type: 'object', properties: { tabId: { type: 'string', description: '要切换到的标签页 ID' } }, required: ['tabId'] } },
    { name: 'close_tab', description: '关闭指定标签页。（破坏性操作，请谨慎使用）', input_schema: { type: 'object', properties: { tabId: { type: 'string', description: '要关闭的标签页 ID' } }, required: ['tabId'] } },
    { name: 'get_active_tab', description: '获取当前对话中用户选中的目标标签页信息（BrowserViewPicker 中选择的标签页）。返回标签页 ID、标题、URL 等信息。当不确定应操作哪个标签页时，应先调用此工具确认目标。', input_schema: { type: 'object', properties: {} } },
  ]
}

/** 窗口管理工具 */
function createWindowTools(): ToolDefinition[] {
  const wid = { type: 'number' as const, description: '目标窗口 ID' }
  return [
    { name: 'create_window', description: '创建独立浏览器窗口。用于在独立 BrowserWindow 中打开页面。', input_schema: { type: 'object', properties: { url: { type: 'string', description: '要打开的 URL' }, pageId: { type: 'string', description: '已有页面 ID，用于关联容器' }, containerId: { type: 'string', description: '容器 ID，用于 Session 隔离' }, title: { type: 'string', description: '窗口标题' }, width: { type: 'number', description: '窗口宽度，默认 1280' }, height: { type: 'number', description: '窗口高度，默认 800' } }, required: ['url'] } },
    { name: 'navigate_window', description: '导航独立窗口到指定 URL。', input_schema: { type: 'object', properties: { windowId: wid, url: { type: 'string', description: '目标 URL' } }, required: ['windowId', 'url'] } },
    { name: 'close_window', description: '关闭指定的独立浏览器窗口。（破坏性操作）', input_schema: { type: 'object', properties: { windowId: wid }, required: ['windowId'] } },
    { name: 'list_windows', description: '列出所有打开的浏览器窗口。', input_schema: { type: 'object', properties: {} } },
    { name: 'focus_window', description: '将指定窗口聚焦到前台。如果窗口最小化则恢复。', input_schema: { type: 'object', properties: { windowId: wid }, required: ['windowId'] } },
    { name: 'screenshot_window', description: '截取独立窗口的页面截图。', input_schema: { type: 'object', properties: { windowId: wid }, required: ['windowId'] } },
    { name: 'get_window_detail', description: '获取窗口详细信息（标题、URL、尺寸、状态等）。', input_schema: { type: 'object', properties: { windowId: wid }, required: ['windowId'] } },
  ]
}

/** 工作区/分组/页面资源管理工具 */
function createWorkspaceTools(): ToolDefinition[] {
  return [
    { name: 'list_workspaces', description: '列出所有工作区。', input_schema: { type: 'object', properties: {} } },
    { name: 'list_groups', description: '列出所有分组。', input_schema: { type: 'object', properties: {} } },
    { name: 'list_pages', description: '列出所有页面。', input_schema: { type: 'object', properties: {} } },
  ]
}

/** DOM 查询工具：交互节点列表与详情 */
function createDomQueryTools(tabIdField: { type: 'string'; description: string }): ToolDefinition[] {
  return [
    { name: 'get_interactive_nodes', description: '获取页面中可见的交互节点简要列表（按钮、链接、输入框等），每个节点仅返回 name、text、selector。用于快速定位目标元素，再用 get_interactive_node_detail 获取详情。默认仅返回视口内元素。', input_schema: { type: 'object', properties: { tabId: tabIdField, viewportOnly: { type: 'boolean', description: '是否仅返回视口内元素，默认 true', default: true } } } },
    { name: 'get_interactive_node_detail', description: '根据 CSS 选择器获取单个交互节点的详细信息，包括 tag、role、name、text、rect、visible、clickable、attributes、styles 等。先用 get_interactive_nodes 定位目标，再用本工具查看详情。', input_schema: { type: 'object', properties: { selector: { type: 'string', description: 'CSS 选择器，来自 get_interactive_nodes 返回的 selector' }, tabId: tabIdField }, required: ['selector'] } },
  ]
}

/** 技能管理工具 */
function createSkillTools(): ToolDefinition[] {
  return [
    { name: 'write_skill', description: '保存或更新一个 Skill。Skill 以 Markdown 格式存储，包含名称、说明和内容（步骤 + 代码）。`js` 代码块可直接写可执行代码，不要求注释；保存时会自动补齐统一返回对象，确保执行结果至少返回 { success: true/false }。当用户说"保存 skill"或"创建技能"时使用。如果同名 Skill 已存在则覆盖。', input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Skill 名称，使用小写英文 + 短横线，如 "scrape-product"、"batch-download"。作为唯一标识和文件名。' }, description: { type: 'string', description: 'Skill 的一句话说明，用于 list/search 时展示。' }, content: { type: 'string', description: 'Skill 的 Markdown 正文，包含步骤、代码片段、参数说明等。支持 ```js 代码块，执行时会提取运行。代码块无需写注释；若未显式 return，保存时也会自动包装为返回对象。' } }, required: ['name', 'description', 'content'] } },
    { name: 'read_skill', description: '按名称读取 Skill 的完整内容。返回 Markdown 正文。当用户说"查看 skill"、"读取技能"时使用。', input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Skill 名称' } }, required: ['name'] } },
    { name: 'list_skills', description: '列出所有已保存的 Skill，返回名称和说明。当用户说"列出 skill"、"有哪些技能"时使用。', input_schema: { type: 'object', properties: {} } },
    { name: 'search_skill', description: '按名称模糊搜索 Skill。返回匹配的 Skill 列表（名称 + 说明）。当用户说"搜索 skill"或不确定完整名称时使用。', input_schema: { type: 'object', properties: { name: { type: 'string', description: '搜索关键词（支持模糊匹配）' } }, required: ['name'] } },
  ]
}

/** 辅助工具：延迟等待、JS 注入 */
function createUtilityTools(): ToolDefinition[] {
  return [
    { name: 'delay', description: '延迟等待指定毫秒数后继续执行。用于等待页面加载、AJAX 请求返回、动画结束等场景。不依赖标签页。', input_schema: { type: 'object', properties: { milliseconds: { type: 'number', description: '等待时长（毫秒），范围 100-30000，默认 1000。建议根据场景选择：页面导航后等 2000-5000ms，动画结束后等 300-500ms。', default: 1000 }, reason: { type: 'string', description: '等待原因说明（可选），用于日志记录，例如 "等待搜索结果加载"。' } }, required: ['milliseconds'] } },
    { name: 'inject_js', description: '向指定 WebContents 注入并执行 JavaScript 代码，返回代码执行结果。高风险工具，请确认代码安全后再执行。', input_schema: { type: 'object', properties: { webContentId: { type: 'number', description: '目标 WebContents ID（Electron webContents.id）' }, code: { type: 'string', description: '要执行的 JavaScript 代码，代码在页面上下文中运行，可使用 document、window 等对象。支持 return 返回结果。' } }, required: ['webContentId', 'code'] } },
  ]
}

/**
 * 创建真正的浏览器业务工具集。
 * @param _targetTabId 默认目标标签页 ID，由执行层兜底处理。
 */
export function createBrowserTools(_targetTabId: string | null): ToolDefinition[] {
  const tabIdField = { type: 'string' as const, description: '目标标签页 ID' }

  return [
    ...createDomInteractionTools(tabIdField),
    ...createPageInfoTools(tabIdField),
    ...createTabTools(tabIdField),
    ...createWindowTools(),
    ...createWorkspaceTools(),
    ...createDomQueryTools(tabIdField),
    ...createSkillTools(),
    ...createUtilityTools(),
  ]
}

/** 创建模型可见的工具发现工具集。 */
export function createToolDiscoveryTools(): ToolDefinition[] {
  return [
    {
      name: 'list_categories',
      description: '列出可用能力分类及场景说明。只返回分类信息，不返回工具名、参数或 schema。',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'list_tools_by_category',
      description: '按分类列出轻量工具清单。只返回工具名、简介、标签、适用场景和风险等级，不返回参数 schema。',
      input_schema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: TOOL_CATEGORY_INFOS.map((category) => category.name),
            description: '能力分类名称',
          },
        },
        required: ['category'],
      },
    },
    {
      name: 'get_tool_detail',
      description: '按工具名获取完整工具用法，包括参数定义、输入输出、示例、约束和注意事项。',
      input_schema: {
        type: 'object',
        properties: {
          tool_name: { type: 'string', description: '工具名，必须来自 list_tools_by_category 返回结果。' },
        },
        required: ['tool_name'],
      },
    },
    {
      name: 'execute_tool',
      description: '执行已通过 get_tool_detail 查看过详情的业务工具。只有参数完整且风险可接受时才调用。',
      input_schema: {
        type: 'object',
        properties: {
          tool_name: { type: 'string', description: '要执行的业务工具名。' },
          args: {
            type: 'object',
            description: '业务工具参数，必须符合 get_tool_detail 返回的 input_schema。',
            properties: {},
          },
        },
        required: ['tool_name'],
      },
    },
  ]
}

export function isDiscoveryToolName(name: string): boolean {
  return (DISCOVERY_TOOL_NAMES as readonly string[]).includes(name)
}

export function isToolCategoryName(name: string): name is ToolCategoryName {
  return TOOL_CATEGORY_INFOS.some((category) => category.name === name)
}

export function isBrowserBusinessToolName(name: string): boolean {
  return BROWSER_TOOL_LIST.some((tool) => tool.name === name)
}

export function buildCategoryListResponse(): ToolDiscoveryResponse<{ categories: ToolCategoryInfo[] }> {
  return {
    stage: 'category_list',
    need_next: true,
    next_action: 'select_category',
    data: {
      categories: TOOL_CATEGORY_INFOS,
    },
    message: '请先根据任务选择能力分类。',
  }
}

export function buildToolListResponse(
  category: string,
  enabledToolNames?: EnabledToolFilter,
): ToolDiscoveryResponse<{
  category: string
  tools: Array<{
    name: string
    summary: string
    tags: string[]
    suitable_for: string[]
    risk_level: ToolRiskLevel
  }>
}> {
  if (!isToolCategoryName(category)) {
    return {
      stage: 'tool_list',
      need_next: true,
      next_action: 'select_category',
      data: { category, tools: [] },
      message: `未知能力分类：${category}。请先调用 list_categories 查看可用分类。`,
    }
  }

  const tools = BROWSER_TOOL_LIST
    .filter((tool) => tool.discoveryCategory === category && isToolEnabled(tool.name, enabledToolNames))
    .map((tool) => ({
      name: tool.name,
      summary: tool.description,
      tags: tool.tags,
      suitable_for: tool.suitableFor,
      risk_level: tool.riskLevel,
    }))

  return {
    stage: 'tool_list',
    need_next: tools.length > 0,
    next_action: tools.length > 0 ? 'select_tool' : 'select_category',
    data: {
      category,
      tools,
    },
    message: tools.length > 0
      ? '请从工具列表中选择工具；需要参数时继续调用 get_tool_detail。'
      : '当前分类没有可用工具，或工具已被禁用。',
  }
}

export function buildToolDetailResponse(
  toolName: string,
  enabledToolNames?: EnabledToolFilter,
): ToolDiscoveryResponse<Record<string, unknown>> {
  const meta = BROWSER_TOOL_LIST.find((tool) => tool.name === toolName)
  const definition = createBrowserTools(null).find((tool) => tool.name === toolName)

  if (!meta || !definition) {
    return {
      stage: 'tool_detail',
      need_next: true,
      next_action: 'select_tool',
      data: {},
      message: `未知工具：${toolName}。请先调用 list_tools_by_category 查看可用工具。`,
    }
  }

  if (!isToolEnabled(toolName, enabledToolNames)) {
    return {
      stage: 'tool_detail',
      need_next: true,
      next_action: 'select_tool',
      data: {},
      message: `工具 ${toolName} 当前未启用，不能查看详情或执行。`,
    }
  }

  return {
    stage: 'tool_detail',
    need_next: true,
    next_action: 'execute',
    data: {
      name: definition.name,
      category: meta.discoveryCategory,
      description: definition.description,
      input_schema: definition.input_schema,
      output_schema: GENERIC_OUTPUT_SCHEMA,
      examples: [
        {
          input: TOOL_EXAMPLE_INPUTS[toolName] ?? {},
          output: { success: true, result: {} },
        },
      ],
      constraints: buildToolConstraints(meta, definition),
      notes: buildToolNotes(meta),
    },
    message: '请根据 input_schema 提供完整参数后调用 execute_tool。',
  }
}

function isToolEnabled(name: string, enabledToolNames?: EnabledToolFilter): boolean {
  if (!enabledToolNames) return true
  return Array.isArray(enabledToolNames)
    ? enabledToolNames.includes(name)
    : enabledToolNames.has(name)
}

function buildToolConstraints(meta: ToolMeta, definition: ToolDefinition): string[] {
  const constraints = ['参数必须符合 input_schema。']

  if (definition.input_schema.required?.length) {
    constraints.push(`必填参数：${definition.input_schema.required.join(', ')}。`)
  }
  if (meta.riskLevel === 'high') {
    constraints.push('高风险工具，执行前必须确认目标明确且用户意图清晰。')
  }
  if (meta.discoveryCategory === 'dom') {
    constraints.push('CSS 选择器应尽量唯一定位目标元素。')
  }
  if (meta.discoveryCategory === 'tab') {
    constraints.push('涉及指定标签页时，应优先确认 tabId。')
  }

  return constraints
}

function buildToolNotes(meta: ToolMeta): string[] {
  const notes = [`风险等级：${meta.riskLevel}。`]

  if (meta.riskLevel !== 'low') {
    notes.push('如果参数不足，不要猜测执行，应先获取更多上下文或追问用户。')
  }
  if (meta.name === 'close_tab') {
    notes.push('关闭标签页属于破坏性操作，应在用户明确要求时执行。')
  }
  if (meta.name === 'get_page_screenshot') {
    notes.push('截图结果可能以图片内容返回。')
  }
  if (meta.name === 'create_tab') {
    notes.push('当前执行层对创建标签页可能返回 not yet supported 提示。')
  }

  return notes
}
