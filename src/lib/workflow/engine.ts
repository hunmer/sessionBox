// src/lib/workflow/engine.ts
import { toRaw } from 'vue'
import type { WorkflowNode, WorkflowEdge, ExecutionLog, ExecutionStep } from './types'
import { getNodeDefinition } from './nodeRegistry'

export type EngineStatus = 'idle' | 'running' | 'paused' | 'error'

export class WorkflowEngine {
  private nodes: WorkflowNode[]
  private edges: WorkflowEdge[]
  private context: Record<string, any>
  private _status: EngineStatus = 'idle'
  private executionOrder: WorkflowNode[] = []
  private currentIndex = 0
  private pauseRequested = false
  private stopRequested = false
  private startTime = 0
  private steps: ExecutionStep[] = []
  private onLogUpdate?: (log: ExecutionLog) => void
  private onNodeStatusChange?: (nodeId: string, status: ExecutionStep['status']) => void

  constructor(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    callbacks?: {
      onLogUpdate?: (log: ExecutionLog) => void
      onNodeStatusChange?: (nodeId: string, status: ExecutionStep['status']) => void
    },
  ) {
    this.nodes = nodes
    this.edges = edges
    this.context = {}
    this.onLogUpdate = callbacks?.onLogUpdate
    this.onNodeStatusChange = callbacks?.onNodeStatusChange
  }

  get status(): EngineStatus {
    return this._status
  }

  get currentContext(): Record<string, any> {
    return { ...this.context }
  }

  get currentLog(): ExecutionLog {
    return {
      id: '',
      workflowId: '',
      startedAt: this.startTime,
      status:
        this._status === 'running'
          ? 'running'
          : this._status === 'paused'
            ? 'paused'
            : this._status,
      steps: [...this.steps],
      finishedAt:
        this._status !== 'running' && this._status !== 'paused' ? Date.now() : undefined,
    }
  }

  async start(): Promise<ExecutionLog> {
    this.reset()
    this.executionOrder = this.buildExecutionOrder()
    if (this.executionOrder.length === 0) {
      this._status = 'error'
      return this.currentLog
    }
    this._status = 'running'
    this.startTime = Date.now()
    this.emitLogUpdate()
    await this.runFromIndex(0)
    return this.currentLog
  }

  pause(): void {
    if (this._status === 'running') {
      this.pauseRequested = true
    }
  }

  async resume(): Promise<ExecutionLog> {
    if (this._status !== 'paused') return this.currentLog
    this._status = 'running'
    this.pauseRequested = false
    this.emitLogUpdate()
    await this.runFromIndex(this.currentIndex)
    return this.currentLog
  }

  stop(): void {
    this.stopRequested = true
  }

  /** 调试单个节点 —— 不重置状态，复用已有 context 做变量解析 */
  async debugSingleNode(
    node: WorkflowNode,
    existingContext: Record<string, any> = {},
  ): Promise<{ status: 'completed' | 'error'; output?: any; error?: string; duration: number }> {
    this.context = { ...existingContext }
    if (!this.context.__data__) this.context.__data__ = {}
    const startTime = Date.now()
    try {
      const result = await this.dispatchNode(node)
      return { status: 'completed', output: result, duration: Date.now() - startTime }
    } catch (err: any) {
      return { status: 'error', error: err?.message || String(err), duration: Date.now() - startTime }
    }
  }

  private reset(): void {
    this.context = { __data__: {} }
    this.steps = []
    this.currentIndex = 0
    this.pauseRequested = false
    this.stopRequested = false
    this._status = 'idle'
    this.startTime = 0
  }

  private async runFromIndex(startIndex: number): Promise<void> {
    for (let i = startIndex; i < this.executionOrder.length; i++) {
      if (this.stopRequested) {
        this._status = 'error'
        this.emitLogUpdate()
        return
      }

      if (this.pauseRequested) {
        this.currentIndex = i
        this._status = 'paused'
        this.pauseRequested = false
        this.emitLogUpdate()
        return
      }

      this.currentIndex = i
      const node = this.executionOrder[i]
      const nodeState = node.nodeState || 'normal'

      // 禁用状态：中止执行
      if (nodeState === 'disabled') {
        this.recordSkippedStep(node, '节点已禁用，工作流中止')
        this._status = 'error'
        this.emitLogUpdate()
        return
      }

      // 跳过状态：跳过该节点，继续执行下一个
      if (nodeState === 'skipped') {
        this.recordSkippedStep(node, '节点已跳过')
        continue
      }

      await this.executeNode(node)
    }

    this._status = this.stopRequested ? 'error' : 'completed'
    this.emitLogUpdate()
  }

  /** 记录被跳过/禁用的节点步骤 */
  private recordSkippedStep(node: WorkflowNode, reason: string): void {
    const step: ExecutionStep = {
      nodeId: node.id,
      nodeLabel: node.label,
      startedAt: Date.now(),
      finishedAt: Date.now(),
      status: 'skipped',
      error: reason,
    }
    this.steps.push(step)
    this.onNodeStatusChange?.(node.id, 'skipped')
    this.emitLogUpdate()
  }

  private async executeNode(node: WorkflowNode): Promise<void> {
    const step: ExecutionStep = {
      nodeId: node.id,
      nodeLabel: node.label,
      startedAt: Date.now(),
      status: 'running',
    }
    this.steps.push(step)
    this.onNodeStatusChange?.(node.id, 'running')
    this.emitLogUpdate()

    try {
      const result = await this.dispatchNode(node)
      step.finishedAt = Date.now()
      step.status = 'completed'
      step.output = result
      this.context[node.id] = result
      // 同时写入 __data__ 以支持 {{ __data__["nodeId"].field }} 语法
      if (!this.context.__data__) this.context.__data__ = {}
      this.context.__data__[node.id] = result
      this.onNodeStatusChange?.(node.id, 'completed')
    } catch (err: any) {
      step.finishedAt = Date.now()
      step.status = 'error'
      step.error = err?.message || String(err)
      this._status = 'error'
      this.onNodeStatusChange?.(node.id, 'error')
    }

    this.emitLogUpdate()
  }

  private async dispatchNode(node: WorkflowNode): Promise<any> {
    const def = getNodeDefinition(node.type)
    if (!def) throw new Error(`未知节点类型: ${node.type}`)

    const resolvedData = this.resolveContextVariables(node.data)

    switch (node.type) {
      case 'start':
        return null
      case 'end':
        return null
      case 'run_code':
        return this.executeCode(resolvedData.code || '')
      case 'toast':
        return this.executeToast(resolvedData.message || '', resolvedData.type || 'info')
      case 'agent_chat':
        return this.executeAgentChat(resolvedData.prompt || '', resolvedData.systemPrompt || '')
      default:
        return this.executeBrowserTool(node.type, resolvedData)
    }
  }

  private executeCode(code: string): any {
    const fn = new Function('context', code)
    return fn(this.context)
  }

  private executeToast(message: string, type: string): any {
    try {
      // vue-sonner 动态导入
      const { toast } = require('vue-sonner') as { toast: Record<string, (msg: string) => void> }
      const toastFn = toast[type] || toast.info
      toastFn(message)
    } catch {
      console.log(`[Toast ${type}] ${message}`)
    }
    return { message, type }
  }

  private async executeAgentChat(prompt: string, systemPrompt: string): Promise<any> {
    throw new Error('agent_chat 节点需要集成 AI provider，待后续实现')
  }

  private async executeBrowserTool(toolType: string, params: Record<string, any>): Promise<any> {
    const api = (window as any).api
    if (!api?.agent?.execTool) {
      throw new Error(`agent.execTool IPC 通道不可用，无法执行工具: ${toolType}`)
    }
    // Vue reactive Proxy 无法通过 IPC 结构化克隆，需先转为纯对象
    const rawParams = JSON.parse(JSON.stringify(params, (_, v) => toRaw(v)))
    return api.agent.execTool(toolType, rawParams)
  }

  private resolveContextVariables(data: Record<string, any>): Record<string, any> {
    const resolved: Record<string, any> = {}
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        // 先解析 __data__ 格式: {{ __data__["nodeId"].field.path }}
        let str = value.replace(
          /\{\{\s*__data__\["([^"]+)"\]\.([^}]+?)\s*\}\}/g,
          (_, nodeId, fieldPath) => {
            const data = this.context.__data__?.[nodeId]
            if (data == null) return ''
            return String(this.getNestedValue(data, fieldPath) ?? '')
          },
        )
        // 再解析 context 格式: {{ context.nodeId.field }}
        str = str.replace(/\{\{context\.([^}]+)\}\}/g, (_, path) => {
          return String(this.getContextValue(path) ?? '')
        })
        resolved[key] = str
      } else {
        resolved[key] = value
      }
    }
    return resolved
  }

  /** 按点号路径获取嵌套值 */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.')
    let current = obj
    for (const part of parts) {
      if (current == null) return undefined
      current = current[part]
    }
    return current
  }

  private getContextValue(path: string): any {
    const parts = path.split('.')
    let current: any = this.context
    for (const part of parts) {
      if (current == null) return undefined
      current = current[part]
    }
    return current
  }

  private buildExecutionOrder(): WorkflowNode[] {
    const nodeMap = new Map(this.nodes.map((n) => [n.id, n]))
    const inDegree = new Map(this.nodes.map((n) => [n.id, 0]))

    for (const edge of this.edges) {
      const deg = inDegree.get(edge.target) ?? 0
      inDegree.set(edge.target, deg + 1)
    }

    const queue: string[] = []
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id)
    }

    const order: WorkflowNode[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      const node = nodeMap.get(id)
      if (node) order.push(node)

      for (const edge of this.edges) {
        if (edge.source === id) {
          const deg = (inDegree.get(edge.target) ?? 1) - 1
          inDegree.set(edge.target, deg)
          if (deg === 0) queue.push(edge.target)
        }
      }
    }

    return order
  }

  private emitLogUpdate(): void {
    this.onLogUpdate?.(this.currentLog)
  }
}
