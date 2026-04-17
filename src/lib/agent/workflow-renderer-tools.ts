import { useWorkflowStore } from '@/stores/workflow'
import type { Workflow, ExecutionLog } from '@/lib/workflow/types'

interface ToolResult {
  success: boolean
  message: string
  data?: unknown
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function summarizeWorkflow(workflow: Workflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    folderId: workflow.folderId,
    nodeCount: workflow.nodes.length,
    edgeCount: workflow.edges.length,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      nodeState: node.nodeState,
    })),
    edges: workflow.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    })),
  }
}

/** 内存中的异步执行记录，key 为 execution_id */
const asyncExecutions = new Map<string, {
  workflowId: string
  log: ExecutionLog
}>()

function getCurrentWorkflow(args: Record<string, unknown> = {}): ToolResult {
  const workflowStore = useWorkflowStore()
  const workflow = workflowStore.currentWorkflow
  if (!workflow) {
    return { success: false, message: '当前没有加载工作流画布' }
  }

  const plainWorkflow = clone(workflow)

  if (args.summarize === false) {
    return {
      success: true,
      message: '当前画布工作流完整数据',
      data: { workflow: plainWorkflow },
    }
  }

  return {
    success: true,
    message: '当前画布工作流摘要',
    data: { workflow: summarizeWorkflow(plainWorkflow) },
  }
}

function formatExecutionResult(log: ExecutionLog, nodeId?: string) {
  const steps = nodeId
    ? log.steps.filter((s) => s.nodeId === nodeId)
    : log.steps

  return steps.map((step) => ({
    nodeId: step.nodeId,
    nodeLabel: step.nodeLabel,
    status: step.status,
    startedAt: step.startedAt,
    finishedAt: step.finishedAt,
    duration: step.finishedAt ? step.finishedAt - step.startedAt : undefined,
    input: step.input,
    output: step.output,
    error: step.error,
  }))
}

export function executeRendererWorkflowTool(
  name: string,
  args: Record<string, unknown> = {},
): ToolResult | Promise<ToolResult> {
  switch (name) {
    case 'get_current_workflow':
      return getCurrentWorkflow(args)

    case 'execute_workflow_sync':
      return executeWorkflowSync()

    case 'execute_workflow_async':
      return executeWorkflowAsync()

    case 'get_workflow_result':
      return getWorkflowResult(args)

    default:
      return { success: false, message: `未知渲染进程工作流工具: ${name}` }
  }
}

async function executeWorkflowSync(): Promise<ToolResult> {
  const workflowStore = useWorkflowStore()
  const workflow = workflowStore.currentWorkflow
  if (!workflow) {
    return { success: false, message: '当前没有加载工作流画布' }
  }
  if (workflowStore.executionStatus === 'running') {
    return { success: false, message: '工作流正在执行中，请等待完成后再试' }
  }

  await workflowStore.startExecution()

  const log = workflowStore.executionLog
  if (!log) {
    return { success: false, message: '执行未返回日志' }
  }

  const executionId = `exec-sync-${Date.now()}`
  asyncExecutions.set(executionId, {
    workflowId: workflow.id,
    log: clone(log),
  })

  return {
    success: true,
    message: `工作流同步执行完成，状态: ${workflowStore.executionStatus}`,
    data: {
      executionId,
      status: workflowStore.executionStatus,
      steps: formatExecutionResult(log),
    },
  }
}

async function executeWorkflowAsync(): Promise<ToolResult> {
  const workflowStore = useWorkflowStore()
  const workflow = workflowStore.currentWorkflow
  if (!workflow) {
    return { success: false, message: '当前没有加载工作流画布' }
  }
  if (workflowStore.executionStatus === 'running') {
    return { success: false, message: '工作流正在执行中，请等待完成后再试' }
  }

  const executionId = `exec-async-${Date.now()}`

  // 先保存初始状态引用
  asyncExecutions.set(executionId, {
    workflowId: workflow.id,
    log: {
      id: executionId,
      workflowId: workflow.id,
      startedAt: Date.now(),
      status: 'running',
      steps: [],
    },
  })

  // 后台执行，不 await
  workflowStore.startExecution().then(() => {
    const record = asyncExecutions.get(executionId)
    if (record) {
      record.log = clone(workflowStore.executionLog!) || record.log
    }
  })

  return {
    success: true,
    message: '工作流异步执行已启动',
    data: { executionId, status: 'running' },
  }
}

function getWorkflowResult(args: Record<string, unknown>): ToolResult {
  const executionId = args.execution_id as string
  if (!executionId) {
    return { success: false, message: '缺少必填参数: execution_id' }
  }

  const record = asyncExecutions.get(executionId)
  if (!record) {
    return { success: false, message: `执行记录 ${executionId} 不存在` }
  }

  const nodeId = args.node_id as string | undefined
  const steps = formatExecutionResult(record.log, nodeId)

  // 从 workflowStore 获取实时状态（如果对应的执行仍在运行）
  const workflowStore = useWorkflowStore()
  if (workflowStore.executionStatus === 'running' && record.workflowId === workflowStore.currentWorkflow?.id) {
    const currentLog = workflowStore.executionLog
    if (currentLog) {
      record.log = clone(currentLog)
      return {
        success: true,
        message: `工作流执行中`,
        data: {
          executionId,
          status: 'running',
          steps: formatExecutionResult(currentLog, nodeId),
        },
      }
    }
  }

  return {
    success: true,
    message: `执行状态: ${record.log.status}`,
    data: {
      executionId,
      status: record.log.status,
      steps,
    },
  }
}
