import { useWorkflowStore } from '@/stores/workflow'
import type { Workflow } from '@/lib/workflow/types'

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

export function executeRendererWorkflowTool(
  name: string,
  args: Record<string, unknown> = {},
): ToolResult {
  switch (name) {
    case 'get_current_workflow':
      return getCurrentWorkflow(args)
    default:
      return { success: false, message: `未知渲染进程工作流工具: ${name}` }
  }
}
