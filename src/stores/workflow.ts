// src/stores/workflow.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Workflow, WorkflowFolder, WorkflowNode, ExecutionLog } from '@/lib/workflow/types'
import { WorkflowEngine, type EngineStatus } from '@/lib/workflow/engine'

const DRAFT_KEY = 'workflow-draft'

export const useWorkflowStore = defineStore('workflow', () => {
  // ====== 数据 ======
  const workflows = ref<Workflow[]>([])
  const workflowFolders = ref<WorkflowFolder[]>([])
  const currentWorkflow = ref<Workflow | null>(null)
  const selectedNodeId = ref<string | null>(null)

  // ====== 执行状态 ======
  const executionStatus = ref<EngineStatus>('idle')
  const executionLog = ref<ExecutionLog | null>(null)
  const executionContext = ref<Record<string, any>>({})
  const engine = ref<WorkflowEngine | null>(null)

  // ====== 单节点调试 ======
  const debugNodeStatus = ref<'idle' | 'running' | 'completed' | 'error'>('idle')
  const debugNodeResult = ref<{
    status: 'completed' | 'error'
    output?: any
    error?: string
    duration: number
  } | null>(null)
  const debugNodeId = ref<string | null>(null)

  // ====== 计算属性 ======
  const rootFolders = computed(() =>
    workflowFolders.value
      .filter((f) => f.parentId === null)
      .sort((a, b) => a.order - b.order),
  )

  const selectedNode = computed(() => {
    if (!selectedNodeId.value || !currentWorkflow.value) return null
    return currentWorkflow.value.nodes.find((n) => n.id === selectedNodeId.value) || null
  })

  // ====== 数据 CRUD ======
  async function loadData() {
    const api = (window as any).api
    workflows.value = await api.workflow.list()
    workflowFolders.value = await api.workflowFolder.list()
  }

  async function saveWorkflow(workflow: Workflow): Promise<void> {
    const api = (window as any).api
    const existing = workflows.value.find((w) => w.id === workflow.id)
    const now = Date.now()
    if (existing) {
      await api.workflow.update(workflow.id, { ...workflow, updatedAt: now })
      Object.assign(existing, { ...workflow, updatedAt: now })
    } else {
      const created = await api.workflow.create({ ...workflow, createdAt: now, updatedAt: now })
      workflows.value.push(created)
      currentWorkflow.value = created
    }
    clearDraft()
  }

  async function deleteWorkflow(id: string): Promise<void> {
    const api = (window as any).api
    await api.workflow.delete(id)
    workflows.value = workflows.value.filter((w) => w.id !== id)
    if (currentWorkflow.value?.id === id) {
      currentWorkflow.value = null
      clearDraft()
    }
  }

  async function createFolder(name: string, parentId: string | null = null): Promise<void> {
    const api = (window as any).api
    const folder = await api.workflowFolder.create({
      name,
      parentId,
      order: workflowFolders.value.filter((f) => f.parentId === parentId).length,
      createdAt: Date.now(),
    })
    workflowFolders.value.push(folder)
  }

  async function deleteFolder(id: string): Promise<void> {
    const api = (window as any).api
    await api.workflowFolder.delete(id)
    workflowFolders.value = workflowFolders.value.filter((f) => f.id !== id)
  }

  async function updateFolder(id: string, data: Partial<WorkflowFolder>): Promise<void> {
    const api = (window as any).api
    await api.workflowFolder.update(id, data)
    const idx = workflowFolders.value.findIndex((f) => f.id === id)
    if (idx !== -1) Object.assign(workflowFolders.value[idx], data)
  }

  // ====== 编辑操作 ======
  function newWorkflow(folderId: string | null = null) {
    currentWorkflow.value = {
      id: crypto.randomUUID(),
      name: '未命名工作流',
      folderId,
      nodes: [],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    selectedNodeId.value = null
    executionStatus.value = 'idle'
    executionLog.value = null
    executionContext.value = {}
    saveDraft()
  }

  function addNode(type: string, position: { x: number; y: number }): WorkflowNode {
    const node: WorkflowNode = {
      id: crypto.randomUUID(),
      type,
      label: type,
      position,
      data: {},
    }
    currentWorkflow.value!.nodes.push(node)
    return node
  }

  function removeNode(nodeId: string): void {
    if (!currentWorkflow.value) return
    currentWorkflow.value.nodes = currentWorkflow.value.nodes.filter((n) => n.id !== nodeId)
    currentWorkflow.value.edges = currentWorkflow.value.edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId,
    )
    if (selectedNodeId.value === nodeId) selectedNodeId.value = null
  }

  function cloneNode(nodeId: string): WorkflowNode | null {
    if (!currentWorkflow.value) return null
    const source = currentWorkflow.value.nodes.find((n) => n.id === nodeId)
    if (!source) return null
    const cloned: WorkflowNode = {
      id: crypto.randomUUID(),
      type: source.type,
      label: source.label,
      position: { x: source.position.x + 30, y: source.position.y + 30 },
      data: JSON.parse(JSON.stringify(source.data)),
    }
    currentWorkflow.value.nodes.push(cloned)
    return cloned
  }

  function updateNodeData(nodeId: string, data: Record<string, any>): void {
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (node) node.data = { ...node.data, ...data }
  }

  function updateNodePosition(nodeId: string, position: { x: number; y: number }): void {
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (node) node.position = position
  }

  function updateNodeLabel(nodeId: string, label: string): void {
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (node) node.label = label
  }

  function addEdge(source: string, target: string): void {
    if (!currentWorkflow.value) return
    if (currentWorkflow.value.edges.some((e) => e.source === source && e.target === target)) return
    currentWorkflow.value.edges.push({
      id: `e-${source}-${target}`,
      source,
      target,
    })
  }

  function removeEdge(edgeId: string): void {
    if (!currentWorkflow.value) return
    currentWorkflow.value.edges = currentWorkflow.value.edges.filter((e) => e.id !== edgeId)
  }

  // ====== 执行控制 ======
  async function startExecution(): Promise<void> {
    if (!currentWorkflow.value) return
    executionStatus.value = 'running'
    executionLog.value = null
    executionContext.value = {}

    engine.value = new WorkflowEngine(
      currentWorkflow.value.nodes,
      currentWorkflow.value.edges,
      {
        onLogUpdate: (log) => {
          executionLog.value = { ...log }
        },
        onNodeStatusChange: () => {},
      },
    )

    const log = await engine.value.start()
    executionStatus.value = engine.value.status as EngineStatus
    executionContext.value = engine.value.currentContext
    executionLog.value = log
  }

  function pauseExecution(): void {
    engine.value?.pause()
  }

  async function resumeExecution(): Promise<void> {
    if (!engine.value) return
    const log = await engine.value.resume()
    executionStatus.value = engine.value.status as EngineStatus
    executionContext.value = engine.value.currentContext
    executionLog.value = log
  }

  function stopExecution(): void {
    engine.value?.stop()
  }

  // ====== 单节点调试 ======
  async function debugSingleNode(nodeId: string): Promise<void> {
    if (!currentWorkflow.value) return
    const node = currentWorkflow.value.nodes.find((n) => n.id === nodeId)
    if (!node) return

    debugNodeStatus.value = 'running'
    debugNodeResult.value = null
    debugNodeId.value = nodeId

    const tempEngine = new WorkflowEngine([node], [])
    const result = await tempEngine.debugSingleNode(node, executionContext.value)

    debugNodeResult.value = result
    debugNodeStatus.value = result.status
  }

  // ====== 草稿持久化 ======
  function saveDraft(): void {
    if (!currentWorkflow.value) return
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(currentWorkflow.value))
    } catch { /* quota exceeded, ignore */ }
  }

  function restoreDraft(): boolean {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return false
      const draft = JSON.parse(raw) as Workflow
      if (!draft?.id) return false
      currentWorkflow.value = draft
      selectedNodeId.value = null
      executionStatus.value = 'idle'
      executionLog.value = null
      executionContext.value = {}
      return true
    } catch {
      return false
    }
  }

  function clearDraft(): void {
    localStorage.removeItem(DRAFT_KEY)
  }

  return {
    // 数据
    workflows,
    workflowFolders,
    currentWorkflow,
    selectedNodeId,
    // 计算属性
    rootFolders,
    selectedNode,
    // 执行状态
    executionStatus,
    executionLog,
    executionContext,
    // CRUD
    loadData,
    saveWorkflow,
    deleteWorkflow,
    createFolder,
    deleteFolder,
    updateFolder,
    // 编辑
    newWorkflow,
    addNode,
    removeNode,
    cloneNode,
    updateNodeData,
    updateNodePosition,
    updateNodeLabel,
    addEdge,
    removeEdge,
    // 执行
    startExecution,
    pauseExecution,
    resumeExecution,
    stopExecution,
    // 单节点调试
    debugNodeStatus,
    debugNodeResult,
    debugNodeId,
    debugSingleNode,
    // 草稿
    saveDraft,
    restoreDraft,
    clearDraft,
  }
})
