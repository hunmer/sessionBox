import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import dagre from '@dagrejs/dagre'
import { getWorkflow, updateWorkflow } from './workflow-store'

// ====== 节点类型定义（从 nodeRegistry 硬编码，避免跨进程导入） ======

interface NodeTypeDefinition {
  type: string
  label: string
  category: string
  description: string
}

const NODE_TYPE_DEFINITIONS: NodeTypeDefinition[] = [
  // 流程控制
  { type: 'start', label: '开始', category: '流程控制', description: '工作流入口节点，仅支持输出连接' },
  { type: 'end', label: '结束', category: '流程控制', description: '工作流出口节点，仅支持输入连接' },
  { type: 'run_code', label: '运行 JS 代码', category: '流程控制', description: '执行自定义 JavaScript 代码，可通过 context 访问上游数据' },
  { type: 'toast', label: 'Toast 消息', category: '流程控制', description: '显示 Toast 通知消息' },
  { type: 'agent_chat', label: 'AI 对话', category: 'AI', description: '调用 AI 处理文本，prompt 支持 $context 变量替换' },
  // 页面交互
  { type: 'click_element', label: '点击页面元素', category: '页面交互', description: '通过 CSS 选择器点击页面元素' },
  { type: 'input_text', label: '输入文字', category: '页面交互', description: '在输入框中输入文字' },
  { type: 'scroll_page', label: '滚动页面', category: '页面交互', description: '滚动页面到指定方向和距离' },
  { type: 'select_option', label: '选择下拉选项', category: '页面交互', description: '选择下拉框的选项' },
  { type: 'hover_element', label: '悬停元素', category: '页面交互', description: '鼠标悬停在元素上' },
  // 页面信息
  { type: 'get_page_content', label: '获取页面内容', category: '页面信息', description: '获取页面的文本内容' },
  { type: 'get_dom', label: '获取 DOM', category: '页面信息', description: '获取指定元素的 outerHTML' },
  { type: 'get_page_screenshot', label: '页面截图', category: '页面信息', description: '截取页面截图' },
  { type: 'get_page_summary', label: '页面摘要', category: '页面信息', description: '获取页面结构化摘要（标题、heading、链接、meta）' },
  { type: 'get_page_markdown', label: '页面 Markdown', category: '页面信息', description: '获取页面正文内容的 Markdown 表示' },
  { type: 'get_interactive_nodes', label: '获取交互节点', category: '页面信息', description: '获取页面中可见的交互节点简要列表' },
  { type: 'get_interactive_node_detail', label: '交互节点详情', category: '页面信息', description: '根据选择器获取单个交互节点的详细信息' },
  // 标签页管理
  { type: 'list_tabs', label: '列出标签页', category: '标签页管理', description: '列出所有打开的标签页' },
  { type: 'create_tab', label: '创建标签页', category: '标签页管理', description: '创建新标签页' },
  { type: 'navigate_tab', label: '导航标签页', category: '标签页管理', description: '在标签页中导航到指定 URL' },
  { type: 'switch_tab', label: '切换标签页', category: '标签页管理', description: '切换到指定标签页' },
  { type: 'close_tab', label: '关闭标签页', category: '标签页管理', description: '关闭指定标签页' },
  { type: 'get_active_tab', label: '获取当前标签页', category: '标签页管理', description: '获取当前激活的标签页信息' },
  // 窗口管理
  { type: 'create_window', label: '创建窗口', category: '窗口管理', description: '创建独立浏览器窗口' },
  { type: 'navigate_window', label: '导航窗口', category: '窗口管理', description: '导航独立窗口到指定 URL' },
  { type: 'close_window', label: '关闭窗口', category: '窗口管理', description: '关闭指定的独立浏览器窗口' },
  { type: 'list_windows', label: '列出窗口', category: '窗口管理', description: '列出所有打开的浏览器窗口' },
  { type: 'focus_window', label: '聚焦窗口', category: '窗口管理', description: '将指定窗口聚焦到前台' },
  { type: 'screenshot_window', label: '窗口截图', category: '窗口管理', description: '截取独立窗口的页面截图' },
  { type: 'get_window_detail', label: '窗口详情', category: '窗口管理', description: '获取窗口详细信息' },
  // 工作区管理
  { type: 'list_workspaces', label: '列出工作区', category: '工作区管理', description: '列出所有工作区' },
  { type: 'list_groups', label: '列出分组', category: '工作区管理', description: '列出所有分组' },
  { type: 'list_pages', label: '列出页面', category: '工作区管理', description: '列出所有页面' },
  // 技能管理
  { type: 'write_skill', label: '写入技能', category: '技能管理', description: '保存或更新一个 Skill' },
  { type: 'read_skill', label: '读取技能', category: '技能管理', description: '按名称读取 Skill 内容' },
  { type: 'list_skills', label: '列出技能', category: '技能管理', description: '列出所有已保存的 Skill' },
  { type: 'search_skill', label: '搜索技能', category: '技能管理', description: '按名称模糊搜索 Skill' },
  // 辅助工具
  { type: 'inject_js', label: '注入 JS', category: '辅助工具', description: '向指定 WebContents 注入并执行 JavaScript 代码' },
]

// ====== 接口定义 ======

export interface ToolResult {
  success: boolean
  message: string
  data?: any
}

export interface WorkflowChanges {
  upsertNodes: any[]
  deleteNodeIds: string[]
  upsertEdges: any[]
  deleteEdgeIds: string[]
}

interface ToolContext {
  args: any
  nodes: any[]
  edges: any[]
  changes: WorkflowChanges
}

interface ToolHandlerResult {
  result: ToolResult
  mutated: boolean
  nodes: any[]
  edges: any[]
}

type ToolHandler = (ctx: ToolContext) => ToolHandlerResult

function getArgWorkflowId(args: any): string {
  return typeof args?.workflow_id === 'string'
    ? args.workflow_id
    : (typeof args?.workflowId === 'string' ? args.workflowId : '')
}

function executeGetWorkflow(args: any): ToolResult {
  const workflowId = getArgWorkflowId(args)
  if (!workflowId) {
    return { success: false, message: '缺少必填参数: workflow_id' }
  }

  const workflow = getWorkflow(workflowId)
  if (!workflow) {
    return { success: false, message: `工作流 ${workflowId} 不存在` }
  }

  const nodes = JSON.parse(JSON.stringify(workflow.nodes))
  const edges = JSON.parse(JSON.stringify(workflow.edges))
  const summarize = args?.summarize !== false

  if (summarize) {
    return {
      success: true,
      message: '工作流文件摘要',
      data: {
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          folderId: workflow.folderId,
          nodeCount: nodes.length,
          edgeCount: edges.length,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
          nodes: nodes.map((n: any) => ({
            id: n.id,
            type: n.type,
            label: n.label,
            nodeState: n.nodeState,
          })),
          edges: edges.map((e: any) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
          })),
        },
      },
    }
  }

  return {
    success: true,
    message: '工作流文件完整数据',
    data: {
      workflow: {
        ...workflow,
        nodes,
        edges,
      },
    },
  }
}

// ====== Dagre 自动布局 ======

function autoLayout(nodes: any[], edges: any[]): any[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 80 })

  for (const node of nodes) {
    g.setNode(node.id, { width: 200, height: 80 })
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map((node) => {
    const pos = g.node(node.id)
    return {
      ...node,
      position: {
        x: pos.x - 100,
        y: pos.y - 40,
      },
    }
  })
}

// ====== 渲染进程通知 ======

function notifyRenderer(
  mainWindow: BrowserWindow,
  workflowId: string,
  changes: WorkflowChanges,
): void {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('on:workflow:updated', { workflowId, changes })
  }
}

// ====== 各工具处理函数 ======

function handleGetCurrentWorkflow(): ToolHandlerResult {
  return {
    result: {
      success: false,
      message: 'get_current_workflow 只能在渲染进程直接读取当前画布数据',
    },
    mutated: false,
    nodes: [],
    edges: [],
  }
}

function handleListNodeTypes(ctx: ToolContext): ToolHandlerResult {
  const { args } = ctx
  const category = args?.category
  const filtered = category
    ? NODE_TYPE_DEFINITIONS.filter((d) => d.category === category)
    : NODE_TYPE_DEFINITIONS
  return {
    result: {
      success: true,
      message: `共 ${filtered.length} 种节点类型`,
      data: { nodeTypes: filtered, categories: Array.from(new Set(NODE_TYPE_DEFINITIONS.map((d) => d.category))) },
    },
    mutated: false,
    nodes: ctx.nodes,
    edges: ctx.edges,
  }
}

function handleCreateNode(ctx: ToolContext): ToolHandlerResult {
  const { args, nodes, changes } = ctx
  const { type, label } = args || {}
  if (!type) {
    return { result: { success: false, message: '缺少必填参数: type' }, mutated: false, nodes, edges: ctx.edges }
  }
  const typeDef = NODE_TYPE_DEFINITIONS.find((d) => d.type === type)
  if (!typeDef) {
    return {
      result: {
        success: false,
        message: `未知节点类型: ${type}，可用类型: ${NODE_TYPE_DEFINITIONS.map((d) => d.type).join(', ')}`,
      },
      mutated: false,
      nodes,
      edges: ctx.edges,
    }
  }
  const nodeId = randomUUID()
  const newNode = {
    id: nodeId,
    type,
    label: label || typeDef.label,
    position: { x: 0, y: 0 },
    data: args?.data || {},
  }
  nodes.push(newNode)
  changes.upsertNodes.push(newNode)
  return {
    result: { success: true, message: `节点已创建: ${newNode.label} (${nodeId})`, data: { nodeId } },
    mutated: true,
    nodes,
    edges: ctx.edges,
  }
}

function handleUpdateNode(ctx: ToolContext): ToolHandlerResult {
  const { args, nodes, changes } = ctx
  const { nodeId, data } = args || {}
  if (!nodeId) {
    return { result: { success: false, message: '缺少必填参数: nodeId' }, mutated: false, nodes, edges: ctx.edges }
  }
  const nodeIdx = nodes.findIndex((n: any) => n.id === nodeId)
  if (nodeIdx === -1) {
    return { result: { success: false, message: `节点 ${nodeId} 不存在` }, mutated: false, nodes, edges: ctx.edges }
  }
  if (args?.label) {
    nodes[nodeIdx].label = args.label
  }
  if (data) {
    nodes[nodeIdx].data = { ...nodes[nodeIdx].data, ...data }
  }
  changes.upsertNodes.push(nodes[nodeIdx])
  return {
    result: {
      success: true,
      message: `节点已更新: ${nodeId}`,
      data: { node: nodes[nodeIdx] },
    },
    mutated: true,
    nodes,
    edges: ctx.edges,
  }
}

function handleDeleteNode(ctx: ToolContext): ToolHandlerResult {
  const { args, nodes, changes } = ctx
  let { edges } = ctx
  const { nodeId: delNodeId } = args || {}
  if (!delNodeId) {
    return { result: { success: false, message: '缺少必填参数: nodeId' }, mutated: false, nodes, edges }
  }
  const delNodeIdx = nodes.findIndex((n: any) => n.id === delNodeId)
  if (delNodeIdx === -1) {
    return { result: { success: false, message: `节点 ${delNodeId} 不存在` }, mutated: false, nodes, edges }
  }
  // 移除节点
  nodes.splice(delNodeIdx, 1)
  // 移除关联的边
  const relatedEdges = edges.filter(
    (e: any) => e.source === delNodeId || e.target === delNodeId,
  )
  edges = edges.filter((e: any) => e.source !== delNodeId && e.target !== delNodeId)
  changes.deleteNodeIds.push(delNodeId)
  changes.deleteEdgeIds.push(...relatedEdges.map((e: any) => e.id))
  return {
    result: {
      success: true,
      message: `节点 ${delNodeId} 已删除，同时删除 ${relatedEdges.length} 条关联边`,
      data: { deletedNodeId: delNodeId, deletedEdgeIds: relatedEdges.map((e: any) => e.id) },
    },
    mutated: true,
    nodes,
    edges,
  }
}

function handleCreateEdge(ctx: ToolContext): ToolHandlerResult {
  const { args, nodes, edges, changes } = ctx
  const { source, target, sourceHandle, targetHandle } = args || {}
  if (!source || !target) {
    return { result: { success: false, message: '缺少必填参数: source, target' }, mutated: false, nodes, edges }
  }
  // 验证 source/target 节点存在
  if (!nodes.find((n: any) => n.id === source)) {
    return { result: { success: false, message: `源节点 ${source} 不存在` }, mutated: false, nodes, edges }
  }
  if (!nodes.find((n: any) => n.id === target)) {
    return { result: { success: false, message: `目标节点 ${target} 不存在` }, mutated: false, nodes, edges }
  }
  // 检查重复边
  const sh = sourceHandle || 'default'
  const th = targetHandle || 'default'
  const duplicate = edges.find(
    (e: any) =>
      e.source === source &&
      e.target === target &&
      (e.sourceHandle || 'default') === sh &&
      (e.targetHandle || 'default') === th,
  )
  if (duplicate) {
    return { result: { success: false, message: `边已存在: ${duplicate.id}`, data: { edgeId: duplicate.id } }, mutated: false, nodes, edges }
  }
  const edgeId = `e-${source}-${sh}-${target}-${th}`
  const newEdge = { id: edgeId, source, target, sourceHandle: sh, targetHandle: th }
  edges.push(newEdge)
  changes.upsertEdges.push(newEdge)
  return {
    result: { success: true, message: `边已创建: ${edgeId}`, data: { edgeId } },
    mutated: true,
    nodes,
    edges,
  }
}

function handleDeleteEdge(ctx: ToolContext): ToolHandlerResult {
  const { args, nodes, edges, changes } = ctx
  const { edgeId } = args || {}
  if (!edgeId) {
    return { result: { success: false, message: '缺少必填参数: edgeId' }, mutated: false, nodes, edges }
  }
  const edgeIdx = edges.findIndex((e: any) => e.id === edgeId)
  if (edgeIdx === -1) {
    return { result: { success: false, message: `边 ${edgeId} 不存在` }, mutated: false, nodes, edges }
  }
  edges.splice(edgeIdx, 1)
  changes.deleteEdgeIds.push(edgeId)
  return {
    result: { success: true, message: `边 ${edgeId} 已删除`, data: { deletedEdgeId: edgeId } },
    mutated: true,
    nodes,
    edges,
  }
}

function handleBatchUpdate(ctx: ToolContext): ToolHandlerResult {
  const { args, nodes, edges } = ctx
  const { operations } = args || {}
  if (!Array.isArray(operations) || operations.length === 0) {
    return { result: { success: false, message: '缺少必填参数: operations (非空数组)' }, mutated: false, nodes, edges }
  }
  // 事务性执行：收集所有变更，全部成功后一次性写入
  const batchChanges: WorkflowChanges = {
    upsertNodes: [],
    deleteNodeIds: [],
    upsertEdges: [],
    deleteEdgeIds: [],
  }
  const batchResults: any[] = []
  try {
    for (const op of operations) {
      if (!op.tool) {
        throw new Error(`操作缺少 tool 字段: ${JSON.stringify(op)}`)
      }
      const opResult = executeSingleOp(op.tool, op.args || {}, nodes, edges, batchChanges)
      batchResults.push(opResult)
      if (!opResult.success) {
        throw new Error(`操作 ${op.tool} 失败: ${opResult.message}`)
      }
    }
  } catch (err: any) {
    return {
      result: { success: false, message: `批量操作中断: ${err.message}`, data: { results: batchResults } },
      mutated: false,
      nodes,
      edges,
    }
  }
  // 全部成功，应用变更
  ctx.changes.upsertNodes.push(...batchChanges.upsertNodes)
  ctx.changes.deleteNodeIds.push(...batchChanges.deleteNodeIds)
  ctx.changes.upsertEdges.push(...batchChanges.upsertEdges)
  ctx.changes.deleteEdgeIds.push(...batchChanges.deleteEdgeIds)
  return {
    result: {
      success: true,
      message: `批量操作完成，共 ${operations.length} 个操作`,
      data: { results: batchResults },
    },
    mutated: true,
    nodes,
    edges,
  }
}

function handleAutoLayout(ctx: ToolContext): ToolHandlerResult {
  const { nodes, edges, changes } = ctx
  if (nodes.length === 0) {
    return { result: { success: true, message: '工作流没有节点，无需布局', data: {} }, mutated: false, nodes, edges }
  }
  nodes = autoLayout(nodes, edges)
  changes.upsertNodes.push(...nodes)
  return {
    result: {
      success: true,
      message: `自动布局完成，${nodes.length} 个节点已重新排列`,
      data: { nodes },
    },
    mutated: true,
    nodes,
    edges,
  }
}

// ====== Handler Map ======

const WORKFLOW_TOOL_HANDLERS = new Map<string, ToolHandler>([
  ['get_current_workflow', () => handleGetCurrentWorkflow()],
  ['list_node_types', handleListNodeTypes],
  ['create_node', handleCreateNode],
  ['update_node', handleUpdateNode],
  ['delete_node', handleDeleteNode],
  ['create_edge', handleCreateEdge],
  ['delete_edge', handleDeleteEdge],
  ['batch_update', handleBatchUpdate],
  ['auto_layout', handleAutoLayout],
])

// ====== 主入口：执行工作流工具 ======

export async function executeWorkflowTool(
  name: string,
  args: any,
  workflowId: string,
  mainWindow: BrowserWindow,
): Promise<ToolResult> {
  if (name === 'get_workflow') {
    return executeGetWorkflow(args)
  }

  // 1. 获取工作流
  const workflow = getWorkflow(workflowId)
  if (!workflow) {
    return { success: false, message: `工作流 ${workflowId} 不存在` }
  }

  // 2. 深拷贝节点和边
  let nodes = JSON.parse(JSON.stringify(workflow.nodes))
  let edges = JSON.parse(JSON.stringify(workflow.edges))

  // 3. 初始化变更收集器
  const changes: WorkflowChanges = {
    upsertNodes: [],
    deleteNodeIds: [],
    upsertEdges: [],
    deleteEdgeIds: [],
  }

  // 4. 查找并执行对应 handler
  const handler = WORKFLOW_TOOL_HANDLERS.get(name)
  let result: ToolResult
  let mutated: boolean

  if (handler) {
    const handlerResult = handler({ args, nodes, edges, changes })
    result = handlerResult.result
    mutated = handlerResult.mutated
    nodes = handlerResult.nodes
    edges = handlerResult.edges
  } else {
    result = { success: false, message: `未知工作流工具: ${name}` }
    mutated = false
  }

  // 5. 如果有变更，持久化并通知渲染进程
  if (mutated) {
    updateWorkflow(workflowId, { nodes, edges, updatedAt: Date.now() })
    notifyRenderer(mainWindow, workflowId, changes)
  }

  return result
}

// ====== 单个操作执行（供 batch_update 使用） ======

function executeSingleOp(
  tool: string,
  args: any,
  nodes: any[],
  edges: any[],
  changes: WorkflowChanges,
): ToolResult {
  switch (tool) {
    case 'create_node': {
      const { type, label } = args || {}
      if (!type) return { success: false, message: '缺少必填参数: type' }
      const typeDef = NODE_TYPE_DEFINITIONS.find((d) => d.type === type)
      if (!typeDef) {
        return { success: false, message: `未知节点类型: ${type}` }
      }
      const nodeId = randomUUID()
      const newNode = {
        id: nodeId,
        type,
        label: label || typeDef.label,
        position: { x: 0, y: 0 },
        data: args?.data || {},
      }
      nodes.push(newNode)
      changes.upsertNodes.push(newNode)
      return { success: true, message: `节点已创建: ${newNode.label}`, data: { nodeId } }
    }

    case 'update_node': {
      const { nodeId, data } = args || {}
      if (!nodeId) return { success: false, message: '缺少必填参数: nodeId' }
      const nodeIdx = nodes.findIndex((n: any) => n.id === nodeId)
      if (nodeIdx === -1) return { success: false, message: `节点 ${nodeId} 不存在` }
      if (args?.label) nodes[nodeIdx].label = args.label
      if (data) nodes[nodeIdx].data = { ...nodes[nodeIdx].data, ...data }
      changes.upsertNodes.push(nodes[nodeIdx])
      return { success: true, message: `节点已更新: ${nodeId}`, data: { node: nodes[nodeIdx] } }
    }

    case 'delete_node': {
      const { nodeId } = args || {}
      if (!nodeId) return { success: false, message: '缺少必填参数: nodeId' }
      const nodeIdx = nodes.findIndex((n: any) => n.id === nodeId)
      if (nodeIdx === -1) return { success: false, message: `节点 ${nodeId} 不存在` }
      nodes.splice(nodeIdx, 1)
      const relatedEdgeIds: string[] = []
      for (let i = edges.length - 1; i >= 0; i--) {
        if (edges[i].source === nodeId || edges[i].target === nodeId) {
          relatedEdgeIds.push(edges[i].id)
          edges.splice(i, 1)
        }
      }
      changes.deleteNodeIds.push(nodeId)
      changes.deleteEdgeIds.push(...relatedEdgeIds)
      return {
        success: true,
        message: `节点 ${nodeId} 已删除`,
        data: { deletedNodeId: nodeId, deletedEdgeIds: relatedEdgeIds },
      }
    }

    case 'create_edge': {
      const { source, target, sourceHandle, targetHandle } = args || {}
      if (!source || !target) return { success: false, message: '缺少必填参数: source, target' }
      if (!nodes.find((n: any) => n.id === source)) return { success: false, message: `源节点 ${source} 不存在` }
      if (!nodes.find((n: any) => n.id === target)) return { success: false, message: `目标节点 ${target} 不存在` }
      const sh = sourceHandle || 'default'
      const th = targetHandle || 'default'
      const duplicate = edges.find(
        (e: any) =>
          e.source === source &&
          e.target === target &&
          (e.sourceHandle || 'default') === sh &&
          (e.targetHandle || 'default') === th,
      )
      if (duplicate) return { success: false, message: `边已存在: ${duplicate.id}` }
      const edgeId = `e-${source}-${sh}-${target}-${th}`
      const newEdge = { id: edgeId, source, target, sourceHandle: sh, targetHandle: th }
      edges.push(newEdge)
      changes.upsertEdges.push(newEdge)
      return { success: true, message: `边已创建: ${edgeId}`, data: { edgeId } }
    }

    case 'delete_edge': {
      const { edgeId } = args || {}
      if (!edgeId) return { success: false, message: '缺少必填参数: edgeId' }
      const edgeIdx = edges.findIndex((e: any) => e.id === edgeId)
      if (edgeIdx === -1) return { success: false, message: `边 ${edgeId} 不存在` }
      edges.splice(edgeIdx, 1)
      changes.deleteEdgeIds.push(edgeId)
      return { success: true, message: `边 ${edgeId} 已删除`, data: { deletedEdgeId: edgeId } }
    }

    default:
      return { success: false, message: `批量操作不支持的工具: ${tool}` }
  }
}
