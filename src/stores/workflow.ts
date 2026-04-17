import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Workflow, WorkflowFolder, WorkflowNode, ExecutionLog } from '@/lib/workflow/types'
import { WorkflowEngine, type EngineStatus } from '@/lib/workflow/engine'
import { executeRendererWorkflowTool } from '@/lib/agent/workflow-renderer-tools'
import type { WorkflowToolExecuteRequest } from '../../preload'

const DRAFT_KEY = 'workflow-draft'

export interface WorkflowChanges {
  upsertNodes: any[]
  deleteNodeIds: string[]
  upsertEdges: any[]
  deleteEdgeIds: string[]
}

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

  // ====== Undo/Redo ======
  const MAX_HISTORY = 1000
  const undoStack = ref<string[]>([])
  const redoStack = ref<string[]>([])
  const operationLog = ref<{ description: string; timestamp: number }[]>([])

  function captureSnapshot(): string {
    if (!currentWorkflow.value) return ''
    return JSON.stringify({ nodes: currentWorkflow.value.nodes, edges: currentWorkflow.value.edges })
  }

  function applySnapshot(snapshot: string): void {
    if (!currentWorkflow.value || !snapshot) return
    const parsed = JSON.parse(snapshot)
    currentWorkflow.value.nodes = parsed.nodes
    currentWorkflow.value.edges = parsed.edges
  }

  function pushUndo(description: string): void {
    const snapshot = captureSnapshot()
    if (!snapshot) return
    undoStack.value.push(snapshot)
    if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift()
    redoStack.value = []
    operationLog.value.unshift({ description, timestamp: Date.now() })
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
  }

  function undo(): void {
    if (undoStack.value.length === 0) return
    const current = captureSnapshot()
    const prev = undoStack.value.pop()!
    redoStack.value.push(current)
    applySnapshot(prev)
    operationLog.value.unshift({ description: '撤销操作', timestamp: Date.now() })
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
  }

  function redo(): void {
    if (redoStack.value.length === 0) return
    const current = captureSnapshot()
    const next = redoStack.value.pop()!
    undoStack.value.push(current)
    applySnapshot(next)
    operationLog.value.unshift({ description: '重做操作', timestamp: Date.now() })
    if (operationLog.value.length > MAX_HISTORY) operationLog.value.length = MAX_HISTORY
  }

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

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

  /** 执行前验证：检查开始/结束节点存在且连通 */
  const executionValidationError = computed<string | null>(() => {
    if (!currentWorkflow.value) return '未加载工作流'

    const nodes = currentWorkflow.value.nodes
    const startNodes = nodes.filter((n) => n.type === 'start')
    const endNodes = nodes.filter((n) => n.type === 'end')

    if (startNodes.length === 0) return '缺少「开始」节点'
    if (endNodes.length === 0) return '缺少「结束」节点'
    if (startNodes.length > 1) return '只能有一个「开始」节点'
    if (endNodes.length > 1) return '只能有一个「结束」节点'

    // BFS 检查从开始节点是否能到达结束节点
    const edges = currentWorkflow.value.edges
    const visited = new Set<string>()
    const queue = [startNodes[0].id]
    visited.add(startNodes[0].id)

    while (queue.length > 0) {
      const current = queue.shift()!
      for (const edge of edges) {
        if (edge.source === current && !visited.has(edge.target)) {
          visited.add(edge.target)
          queue.push(edge.target)
        }
      }
    }

    if (!visited.has(endNodes[0].id)) return '「开始」与「结束」节点未连通'

    return null
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
    // 保存时自动创建版本快照
    await saveVersion()
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
    const startNodeId = crypto.randomUUID()
    const endNodeId = crypto.randomUUID()
    currentWorkflow.value = {
      id: crypto.randomUUID(),
      name: '未命名工作流',
      folderId,
      nodes: [
        { id: startNodeId, type: 'start', label: '开始', position: { x: 100, y: 250 }, data: {} },
        { id: endNodeId, type: 'end', label: '结束', position: { x: 600, y: 250 }, data: {} },
      ],
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
    pushUndo(`添加节点: ${type}`)
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
    pushUndo('删除节点')
    currentWorkflow.value.nodes = currentWorkflow.value.nodes.filter((n) => n.id !== nodeId)
    currentWorkflow.value.edges = currentWorkflow.value.edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId,
    )
    if (selectedNodeId.value === nodeId) selectedNodeId.value = null
  }

  function cloneNode(nodeId: string): WorkflowNode | null {
    if (!currentWorkflow.value) return null
    pushUndo('克隆节点')
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
    pushUndo('修改节点属性')
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (node) node.data = { ...node.data, ...data }
  }

  function updateNodePosition(nodeId: string, position: { x: number; y: number }): void {
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (node) node.position = position
  }

  function updateNodeLabel(nodeId: string, label: string): void {
    pushUndo('修改节点标签')
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (node) node.label = label
  }

  function updateNodeState(nodeId: string, nodeState: import('@/lib/workflow/types').NodeRunState): void {
    pushUndo('修改节点状态')
    const node = currentWorkflow.value?.nodes.find((n) => n.id === nodeId)
    if (node) node.nodeState = nodeState
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

    pushUndo('添加连线')

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
    pushUndo('删除连线')
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

  // ====== 版本管理 ======
  const versions = ref<any[]>([])

  async function loadVersions(): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) { versions.value = []; return }
    versions.value = await api().workflowVersion.list(workflowId)
  }

  async function saveVersion(name?: string): Promise<void> {
    const wf = currentWorkflow.value
    if (!wf) return
    const versionName = name || await api().workflowVersion.nextName(wf.id)
    const plainNodes = JSON.parse(JSON.stringify(wf.nodes))
    const plainEdges = JSON.parse(JSON.stringify(wf.edges))
    const version = await api().workflowVersion.add(wf.id, versionName, plainNodes, plainEdges)
    versions.value.unshift(version)
  }

  async function deleteVersion(versionId: string): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    await api().workflowVersion.delete(workflowId, versionId)
    versions.value = versions.value.filter((v) => v.id !== versionId)
  }

  async function restoreVersion(versionId: string): Promise<void> {
    const workflowId = currentWorkflow.value?.id
    if (!workflowId) return
    const version = await api().workflowVersion.get(workflowId, versionId)
    if (!version) return
    pushUndo('恢复版本')
    currentWorkflow.value!.nodes = JSON.parse(JSON.stringify(version.snapshot.nodes))
    currentWorkflow.value!.edges = JSON.parse(JSON.stringify(version.snapshot.edges))
  }

  // 切换工作流时加载版本并清空 undo/redo
  watch(() => currentWorkflow.value?.id, () => {
    loadVersions()
    undoStack.value = []
    redoStack.value = []
    operationLog.value = []
  })

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

  // ====== AI 助手增量更新 ======

  function summarizeChanges(changes: WorkflowChanges): string {
    const parts: string[] = []
    if (changes.upsertNodes.length) parts.push(`+${changes.upsertNodes.length}节点`)
    if (changes.deleteNodeIds.length) parts.push(`-${changes.deleteNodeIds.length}节点`)
    if (changes.upsertEdges.length) parts.push(`+${changes.upsertEdges.length}连线`)
    if (changes.deleteEdgeIds.length) parts.push(`-${changes.deleteEdgeIds.length}连线`)
    return parts.join(' ') || '无变更'
  }

  function mergeWorkflowChanges(changes: WorkflowChanges) {
    if (!currentWorkflow.value) return

    // 记录到 undo 栈
    pushUndo('AI 修改: ' + summarizeChanges(changes))

    // 增量更新节点
    for (const node of changes.upsertNodes) {
      const idx = currentWorkflow.value.nodes.findIndex(n => n.id === node.id)
      if (idx >= 0) {
        currentWorkflow.value.nodes[idx] = node
      } else {
        currentWorkflow.value.nodes.push(node)
      }
    }

    // 删除节点
    if (changes.deleteNodeIds.length > 0) {
      currentWorkflow.value.nodes = currentWorkflow.value.nodes
        .filter(n => !changes.deleteNodeIds.includes(n.id))
    }

    // 增量更新边
    for (const edge of changes.upsertEdges) {
      const idx = currentWorkflow.value.edges.findIndex(e => e.id === edge.id)
      if (idx >= 0) {
        currentWorkflow.value.edges[idx] = edge
      } else {
        currentWorkflow.value.edges.push(edge)
      }
    }

    // 删除边
    if (changes.deleteEdgeIds.length > 0) {
      currentWorkflow.value.edges = currentWorkflow.value.edges
        .filter(e => !changes.deleteEdgeIds.includes(e.id))
    }
  }

  function listenForFileUpdates() {
    const cleanup = (window as any).api.on('workflow:updated', (data: any) => {
      if (data.workflowId === currentWorkflow.value?.id && data.changes) {
        mergeWorkflowChanges(data.changes)
      }
    })
    return cleanup
  }

  function listenForWorkflowToolRequests() {
    const cleanup = (window as any).api.on('workflow-tool:execute', async (request: WorkflowToolExecuteRequest) => {
      const result = await executeRendererWorkflowTool(request.name, request.args || {})

      try {
        await (window as any).api.workflowTool.respond(request.requestId, result)
      } catch (error) {
        console.error('[workflow-store] failed to respond workflow tool request', error)
      }
    })

    return cleanup
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
    executionValidationError,
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
    updateNodeState,
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
    // Undo/Redo
    undo,
    redo,
    canUndo,
    canRedo,
    undoStack,
    redoStack,
    operationLog,
    // 版本管理
    versions,
    loadVersions,
    saveVersion,
    deleteVersion,
    restoreVersion,
    // 草稿
    saveDraft,
    restoreDraft,
    clearDraft,
    // AI 助手增量更新
    mergeWorkflowChanges,
    listenForFileUpdates,
    listenForWorkflowToolRequests,
  }
})
