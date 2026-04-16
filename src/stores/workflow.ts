import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Workflow, WorkflowFolder, WorkflowNode, ExecutionLog } from '@/lib/workflow/types'
import { WorkflowEngine, type EngineStatus } from '@/lib/workflow/engine'

const DRAFT_KEY = 'workflow-draft'

export const useWorkflowStore = defineStore('workflow', () => {
  const api = () => (window as any).api

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

  // ====== 执行历史 ======
  const executionLogs = ref<ExecutionLog[]>([])
  const selectedExecutionLogId = ref<string | null>(null)

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

  const selectedExecutionLog = computed<ExecutionLog | null>(() => {
    const id = selectedExecutionLogId.value
    if (!id) return executionLog.value
    return executionLogs.value.find((l) => l.id === id) || executionLog.value
  })

  // ====== 执行历史管理 ======
  async function loadExecutionLogs(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) {
      executionLogs.value = []
      return
    }
    executionLogs.value = await api().executionLog.list(workflowId)
    if (selectedExecutionLogId.value && !executionLogs.value.find((l) => l.id === selectedExecutionLogId.value)) {
      selectedExecutionLogId.value = null
    }
  }

  async function deleteExecutionLog(logId: string): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    await api().executionLog.delete(workflowId, logId)
    executionLogs.value = executionLogs.value.filter((l) => l.id !== logId)
    if (selectedExecutionLogId.value === logId) selectedExecutionLogId.value = null
  }

  async function clearExecutionLogs(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    await api().executionLog.clear(workflowId)
    executionLogs.value = []
    selectedExecutionLogId.value = null
  }

  async function saveCurrentExecutionLog(): Promise<void> {
    const log = executionLog.value
    if (!log || log.status === 'running' || log.status === 'paused') return
    if (!log.id) log.id = `exec-${Date.now()}`
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    log.workflowId = workflowId
    await api().executionLog.save(workflowId, log)
  }

  // 切换工作流时加载历史
  watch(() => currentWorkflow.value?.id, () => {
    loadExecutionLogs()
  })

  // ====== 数据 CRUD ======
  async function loadData() {
    workflows.value = await api().workflow.list()
    workflowFolders.value = await api().workflowFolder.list()
  }

  async function saveWorkflow(workflow: Workflow): Promise<void> {
    const plain = JSON.parse(JSON.stringify(workflow)) as Workflow
    const existing = workflows.value.find((w) => w.id === plain.id)
    const now = Date.now()
    if (existing) {
      await api().workflow.update(plain.id, { ...plain, updatedAt: now })
      Object.assign(existing, { ...plain, updatedAt: now })
    } else {
      const created = await api().workflow.create({ ...plain, createdAt: now, updatedAt: now })
      workflows.value.push(created)
      currentWorkflow.value = created
    }
    clearDraft()
  }

  async function deleteWorkflow(id: string): Promise<void> {
    await api().workflow.delete(id)
    workflows.value = workflows.value.filter((w) => w.id !== id)
    if (currentWorkflow.value?.id === id) {
      currentWorkflow.value = null
      clearDraft()
    }
  }

  async function createFolder(name: string, parentId: string | null = null): Promise<void> {
    const folder = await api().workflowFolder.create({
      name,
      parentId,
      order: workflowFolders.value.filter((f) => f.parentId === parentId).length,
      createdAt: Date.now(),
    })
    workflowFolders.value.push(folder)
  }

  async function deleteFolder(id: string): Promise<void> {
    await api().workflowFolder.delete(id)
    workflowFolders.value = workflowFolders.value.filter((f) => f.id !== id)
  }

  async function updateFolder(id: string, data: Partial<WorkflowFolder>): Promise<void> {
    await api().workflowFolder.update(id, data)
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

  function addEdge(
    source: string,
    target: string,
    sourceHandle: string | null = null,
    targetHandle: string | null = null,
  ): void {
    if (!currentWorkflow.value) return

    if (
      currentWorkflow.value.edges.some(
        (e) =>
          e.source === source
          && e.target === target
          && (e.sourceHandle ?? null) === sourceHandle
          && (e.targetHandle ?? null) === targetHandle,
      )
    ) {
      return
    }

    currentWorkflow.value.edges.push({
      id: `e-${source}-${sourceHandle ?? 'default'}-${target}-${targetHandle ?? 'default'}`,
      source,
      target,
      sourceHandle,
      targetHandle,
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

    if (log.status === 'completed' || log.status === 'error') {
      log.id = `exec-${Date.now()}`
      log.workflowId = currentWorkflow.value.id
      executionLogs.value.unshift(log)
      if (executionLogs.value.length > 50) executionLogs.value.length = 50
      selectedExecutionLogId.value = log.id
      saveExecutionLogToDisk(log)
    }
  }

  async function saveExecutionLogToDisk(log: ExecutionLog): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    try {
      await api().executionLog.save(workflowId, log)
    } catch { /* ignore */ }
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

    if (log.status === 'completed' || log.status === 'error') {
      log.id = `exec-${Date.now()}`
      log.workflowId = currentWorkflow.value!.id
      executionLogs.value.unshift(log)
      if (executionLogs.value.length > 50) executionLogs.value.length = 50
      selectedExecutionLogId.value = log.id
      saveExecutionLogToDisk(log)
    }
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
    // 执行历史
    executionLogs,
    selectedExecutionLogId,
    selectedExecutionLog,
    loadExecutionLogs,
    deleteExecutionLog,
    clearExecutionLogs,
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
