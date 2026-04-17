import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { JsonStore } from '../utils/json-store'
import type { WorkflowNode, WorkflowEdge } from './store'

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

const MAX_VERSIONS_PER_WORKFLOW = 100

export class WorkflowVersionStore {
  private store: JsonStore<Record<string, WorkflowVersion[]>>

  constructor() {
    const filePath = join(app.getPath('userData'), 'workflow-data', 'workflow-versions.json')
    this.store = new JsonStore(filePath)
  }

  list(workflowId: string): WorkflowVersion[] {
    return this.store.get(workflowId) || []
  }

  add(workflowId: string, name: string, nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowVersion {
    const versions = this.list(workflowId)
    const version: WorkflowVersion = {
      id: randomUUID(),
      workflowId,
      name,
      snapshot: {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      },
      createdAt: Date.now(),
    }
    versions.unshift(version)
    if (versions.length > MAX_VERSIONS_PER_WORKFLOW) versions.length = MAX_VERSIONS_PER_WORKFLOW
    this.store.set(workflowId, versions)
    return version
  }

  get(workflowId: string, versionId: string): WorkflowVersion | undefined {
    return this.list(workflowId).find((v) => v.id === versionId)
  }

  delete(workflowId: string, versionId: string): void {
    const versions = this.list(workflowId).filter((v) => v.id !== versionId)
    this.store.set(workflowId, versions)
  }

  clear(workflowId: string): void {
    this.store.delete(workflowId)
  }

  /** 生成下一个版本名称 */
  nextVersionName(workflowId: string): string {
    const count = this.list(workflowId).length
    return `v${count + 1}`
  }
}

export const workflowVersionStore = new WorkflowVersionStore()
