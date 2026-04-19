// src/lib/workflow/types.ts

/** 工作流文件夹（树形结构） */
export interface WorkflowFolder {
  id: string
  name: string
  parentId: string | null // null = 根级
  order: number
  createdAt: number
}

/** 节点运行状态 */
export type NodeRunState = 'normal' | 'disabled' | 'skipped'

/** 选择器条件项 */
export interface ConditionItem {
  id: string
  variable: string
  operator: string
  value: string
}

/** 工作流节点 */
export interface WorkflowNode {
  id: string
  type: string // 节点类型标识
  label: string // 用户可编辑的节点名称
  position: { x: number; y: number }
  data: Record<string, any> // 节点参数
  nodeState?: NodeRunState // 节点运行状态，默认 'normal'
}

/** 工作流连线 */
export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

/** 工作流 */
export interface Workflow {
  id: string
  name: string
  folderId: string | null
  description?: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt: number
  updatedAt: number
}

/** 节点输出字段定义（支持嵌套） */
export interface OutputField {
  key: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'any'
  value?: string
  children?: OutputField[]
}

/** 节点属性表单字段定义 */
export interface NodeProperty {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'code' | 'conditions'
  required?: boolean
  readonly?: boolean
  default?: any
  options?: { label: string; value: string }[]
  tooltip?: string
}

/** 节点连接点配置 */
export interface NodeHandleConfig {
  source?: boolean // 是否显示输出连接点，默认 true
  target?: boolean // 是否显示输入连接点，默认 true
  /** 动态源连接点配置，设置后忽略 source */
  dynamicSource?: {
    dataKey: string // node data 中条件数组的 key
    extraCount?: number // 额外输出数量（如 else = 1）
  }
}

/** 节点注册表项 */
export interface NodeTypeDefinition {
  type: string
  label: string
  category: string
  icon: string
  description: string
  properties: NodeProperty[]
  handles?: NodeHandleConfig
}

/** 执行步骤记录 */
export interface ExecutionStep {
  nodeId: string
  nodeLabel: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'error' | 'skipped'
  input?: any
  output?: any
  error?: string
}

/** 执行日志 */
export interface ExecutionLog {
  id: string
  workflowId: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'paused' | 'error'
  steps: ExecutionStep[]
}

/** 工作流版本快照 */
export interface WorkflowVersion {
  id: string
  workflowId: string
  name: string
  snapshot: {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
  }
  createdAt: number
}
