import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { JsonStore } from '../utils/json-store'
import type { Workflow, WorkflowFolder } from './store'

interface WorkflowStoreData {
  workflows: Workflow[]
  workflowFolders: WorkflowFolder[]
}

const defaults: WorkflowStoreData = {
  workflows: [],
  workflowFolders: [],
}

export const workflowStore = new JsonStore<WorkflowStoreData>(
  join(app.getPath('userData'), 'workflow-store.json'),
  defaults
)

// ====== 工作流文件夹操作 ======

function collectChildFolderIds(folders: WorkflowFolder[], parentId: string): string[] {
  const children = folders.filter((f) => f.parentId === parentId)
  return children.reduce<string[]>(
    (acc, child) => [...acc, child.id, ...collectChildFolderIds(folders, child.id)],
    [],
  )
}

export function listWorkflowFolders(): WorkflowFolder[] {
  const folders = workflowStore.get('workflowFolders') ?? defaults.workflowFolders
  return [...folders].sort((a, b) => a.order - b.order)
}

export function createWorkflowFolder(data: Omit<WorkflowFolder, 'id'>): WorkflowFolder {
  const folders = workflowStore.get('workflowFolders') ?? []
  const folder: WorkflowFolder = { ...data, id: randomUUID() }
  folders.push(folder)
  workflowStore.set('workflowFolders', folders)
  return folder
}

export function updateWorkflowFolder(id: string, data: Partial<Omit<WorkflowFolder, 'id'>>): void {
  const folders = workflowStore.get('workflowFolders') ?? []
  const idx = folders.findIndex((f) => f.id === id)
  if (idx === -1) throw new Error(`工作流文件夹 ${id} 不存在`)
  folders[idx] = { ...folders[idx], ...data }
  workflowStore.set('workflowFolders', folders)
}

export function deleteWorkflowFolder(id: string): void {
  const folders = workflowStore.get('workflowFolders') ?? []
  const childIds = collectChildFolderIds(folders, id)
  const idsToDelete = [id, ...childIds]
  workflowStore.set('workflowFolders', folders.filter((f) => !idsToDelete.includes(f.id)))
  const workflows = (workflowStore.get('workflows') ?? []).filter((w) => !idsToDelete.includes(w.folderId))
  workflowStore.set('workflows', workflows)
}

// ====== 工作流操作 ======

export function listWorkflows(folderId?: string | null): Workflow[] {
  const items = workflowStore.get('workflows') ?? defaults.workflows
  const sorted = [...items].sort((a, b) => a.updatedAt - b.updatedAt)
  if (folderId !== undefined) return sorted.filter((w) => w.folderId === folderId)
  return sorted
}

export function getWorkflow(id: string): Workflow | undefined {
  return (workflowStore.get('workflows') ?? []).find((w) => w.id === id)
}

export function createWorkflow(data: Omit<Workflow, 'id'>): Workflow {
  const items = workflowStore.get('workflows') ?? []
  const item: Workflow = { ...data, id: randomUUID() }
  items.push(item)
  workflowStore.set('workflows', items)
  return item
}

export function updateWorkflow(id: string, data: Partial<Omit<Workflow, 'id'>>): void {
  const items = workflowStore.get('workflows') ?? []
  const idx = items.findIndex((w) => w.id === id)
  if (idx === -1) throw new Error(`工作流 ${id} 不存在`)
  items[idx] = { ...items[idx], ...data }
  workflowStore.set('workflows', items)
}

export function deleteWorkflow(id: string): void {
  const items = (workflowStore.get('workflows') ?? []).filter((w) => w.id !== id)
  workflowStore.set('workflows', items)
}
