import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { JsonStore } from '../utils/json-store'
import type { Workflow, WorkflowFolder } from './store'

const userDataPath = app.getPath('userData')
const workflowsDir = join(userDataPath, 'workflows')

// ====== 文件夹：单个 JsonStore ======

interface WorkflowFolderStoreData {
  workflowFolders: WorkflowFolder[]
}

const folderDefaults: WorkflowFolderStoreData = {
  workflowFolders: [],
}

const folderStore = new JsonStore<WorkflowFolderStoreData>(
  join(userDataPath, 'workflow-folders.json'),
  folderDefaults
)

// ====== 工作流：每个独立文件 ======

function ensureDir(): void {
  if (!existsSync(workflowsDir)) mkdirSync(workflowsDir, { recursive: true })
}

function workflowPath(id: string): string {
  return join(workflowsDir, `${id}.json`)
}

function readWorkflowFile(id: string): Workflow | undefined {
  const path = workflowPath(id)
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return undefined
  }
}

function writeWorkflowFile(workflow: Workflow): void {
  ensureDir()
  writeFileSync(workflowPath(workflow.id), JSON.stringify(workflow, null, 2), 'utf-8')
}

function deleteWorkflowFile(id: string): void {
  const path = workflowPath(id)
  if (existsSync(path)) unlinkSync(path)
}

function readAllWorkflowFiles(): Workflow[] {
  ensureDir()
  const files = readdirSync(workflowsDir).filter((f) => f.endsWith('.json'))
  const workflows: Workflow[] = []
  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(workflowsDir, file), 'utf-8'))
      workflows.push(data)
    } catch {
      // 跳过损坏的文件
    }
  }
  return workflows
}

// ====== 辅助 ======

function collectChildFolderIds(folders: WorkflowFolder[], parentId: string): string[] {
  const children = folders.filter((f) => f.parentId === parentId)
  return children.reduce<string[]>(
    (acc, child) => [...acc, child.id, ...collectChildFolderIds(folders, child.id)],
    [],
  )
}

// ====== 文件夹 CRUD ======

export function listWorkflowFolders(): WorkflowFolder[] {
  const folders = folderStore.get('workflowFolders') ?? folderDefaults.workflowFolders
  return [...folders].sort((a, b) => a.order - b.order)
}

export function createWorkflowFolder(data: Omit<WorkflowFolder, 'id'>): WorkflowFolder {
  const folders = folderStore.get('workflowFolders') ?? []
  const folder: WorkflowFolder = { ...data, id: randomUUID() }
  folders.push(folder)
  folderStore.set('workflowFolders', folders)
  return folder
}

export function updateWorkflowFolder(id: string, data: Partial<Omit<WorkflowFolder, 'id'>>): void {
  const folders = folderStore.get('workflowFolders') ?? []
  const idx = folders.findIndex((f) => f.id === id)
  if (idx === -1) throw new Error(`工作流文件夹 ${id} 不存在`)
  folders[idx] = { ...folders[idx], ...data }
  folderStore.set('workflowFolders', folders)
}

export function deleteWorkflowFolder(id: string): void {
  const folders = folderStore.get('workflowFolders') ?? []
  const childIds = collectChildFolderIds(folders, id)
  const idsToDelete = new Set([id, ...childIds])
  folderStore.set('workflowFolders', folders.filter((f) => !idsToDelete.has(f.id)))
  // 删除文件夹下所有工作流文件
  for (const wid of idsToDelete) {
    const workflows = readAllWorkflowFiles().filter((w) => w.folderId === wid)
    for (const w of workflows) deleteWorkflowFile(w.id)
  }
}

// ====== 工作流 CRUD ======

export function listWorkflows(folderId?: string | null): Workflow[] {
  const items = readAllWorkflowFiles().sort((a, b) => a.updatedAt - b.updatedAt)
  if (folderId !== undefined) return items.filter((w) => w.folderId === folderId)
  return items
}

export function getWorkflow(id: string): Workflow | undefined {
  return readWorkflowFile(id)
}

export function createWorkflow(data: Omit<Workflow, 'id'>): Workflow {
  const item: Workflow = { ...data, id: randomUUID() }
  writeWorkflowFile(item)
  return item
}

export function updateWorkflow(id: string, data: Partial<Omit<Workflow, 'id'>>): void {
  const existing = readWorkflowFile(id)
  if (!existing) throw new Error(`工作流 ${id} 不存在`)
  const updated = { ...existing, ...data }
  writeWorkflowFile(updated)
}

export function deleteWorkflow(id: string): void {
  deleteWorkflowFile(id)
}
