import { join } from 'path'
import { app } from 'electron'
import { JsonStore } from '../utils/json-store'

export interface ExecutionStep {
  nodeId: string
  nodeLabel: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'error'
  input?: any
  output?: any
  error?: string
}

export interface ExecutionLog {
  id: string
  workflowId: string
  startedAt: number
  finishedAt?: number
  status: 'running' | 'completed' | 'paused' | 'error'
  steps: ExecutionStep[]
}

const MAX_LOGS_PER_WORKFLOW = 50

export class ExecutionLogStore {
  private store: JsonStore<Record<string, ExecutionLog[]>>

  constructor() {
    const filePath = join(app.getPath('userData'), 'workflow-data', 'execution-logs.json')
    this.store = new JsonStore(filePath)
  }

  list(workflowId: string): ExecutionLog[] {
    return this.store.get(workflowId) || []
  }

  add(workflowId: string, log: ExecutionLog): ExecutionLog {
    const logs = this.list(workflowId)
    logs.unshift(log)
    if (logs.length > MAX_LOGS_PER_WORKFLOW) logs.length = MAX_LOGS_PER_WORKFLOW
    this.store.set(workflowId, logs)
    return log
  }

  delete(workflowId: string, logId: string): void {
    const logs = this.list(workflowId).filter((l) => l.id !== logId)
    this.store.set(workflowId, logs)
  }

  clear(workflowId: string): void {
    this.store.delete(workflowId)
  }
}

export const executionLogStore = new ExecutionLogStore()
