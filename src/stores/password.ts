import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PasswordEntry, PasswordField } from '../types'

const api = window.api

// ====== CSV 解析/生成工具 ======

/** CSV 字段转义：包含逗号、引号、换行时用双引号包裹 */
function escapeCsvField(value: string): string {
  if (!value) return ''
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

/** 解析单行 CSV，正确处理引号内的逗号 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current)
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current)
  return fields
}

/** 将 PasswordEntry 导出为 CSV 行（含标准列 + 自定义字段 JSON） */
function entryToCsvRow(entry: PasswordEntry): string {
  const { username, password, note, customFields } = extractStandardFields(entry.fields)
  const fieldsJson = customFields.length > 0 ? JSON.stringify(customFields) : ''
  return [
    escapeCsvField(entry.name),
    escapeCsvField(entry.siteOrigin),
    escapeCsvField(username),
    escapeCsvField(password),
    escapeCsvField(note),
    escapeCsvField(fieldsJson)
  ].join(',')
}

/** 从字段列表中提取标准列和剩余自定义字段 */
function extractStandardFields(fields: PasswordField[]): {
  username: string
  password: string
  note: string
  customFields: { name: string; type: string; value: string; protected?: boolean }[]
} {
  let username = ''
  let password = ''
  const noteParts: string[] = []
  const customFields: { name: string; type: string; value: string; protected?: boolean }[] = []

  const usedIndices = new Set<number>()

  // 优先匹配 "账号" 字段
  const accountIdx = fields.findIndex((f) => f.name === '账号' && f.type === 'text')
  if (accountIdx !== -1) {
    username = fields[accountIdx].value
    usedIndices.add(accountIdx)
  }

  // 优先匹配 "密码" 字段
  const pwdIdx = fields.findIndex((f) => f.name === '密码' && f.type === 'text')
  if (pwdIdx !== -1) {
    password = fields[pwdIdx].value
    usedIndices.add(pwdIdx)
  }

  // 回退：如果没找到账号/密码，取第一个非保护文本字段和第一个保护字段
  if (!username) {
    const idx = fields.findIndex((f) => f.type === 'text' && !f.protected && !usedIndices.has(fields.indexOf(f)))
    if (idx !== -1) {
      username = fields[idx].value
      usedIndices.add(idx)
    }
  }
  if (!password) {
    const idx = fields.findIndex((f) => f.type === 'text' && f.protected && !usedIndices.has(fields.indexOf(f)))
    if (idx !== -1) {
      password = fields[idx].value
      usedIndices.add(idx)
    }
  }

  // textarea 字段归入 note
  for (let i = 0; i < fields.length; i++) {
    if (usedIndices.has(i)) continue
    const f = fields[i]
    if (f.type === 'textarea') {
      if (f.value) noteParts.push(f.value)
    } else {
      customFields.push({
        name: f.name,
        type: f.type,
        value: f.value,
        protected: f.protected || undefined
      })
    }
  }

  return { username, password, note: noteParts.join('\n'), customFields }
}

/** CSV 列名 */
const CSV_HEADER = 'name,url,username,password,note,fields'

export const usePasswordStore = defineStore('password', () => {
  // ====== 状态 ======
  const entries = ref<PasswordEntry[]>([])

  // ====== 操作 ======

  async function loadEntries() {
    entries.value = await api.password.list()
  }

  async function createEntry(data: Omit<PasswordEntry, 'id'>) {
    const entry = await api.password.create(data)
    entries.value.push(entry)
    return entry
  }

  async function updateEntry(id: string, data: Partial<Omit<PasswordEntry, 'id'>>) {
    await api.password.update(id, data)
    const idx = entries.value.findIndex((e) => e.id === id)
    if (idx !== -1) {
      entries.value[idx] = { ...entries.value[idx], ...data, updatedAt: Date.now() }
    }
  }

  async function deleteEntry(id: string) {
    await api.password.delete(id)
    entries.value = entries.value.filter((e) => e.id !== id)
  }

  /** 获取指定站点的条目 */
  function getEntriesBySite(siteOrigin: string): PasswordEntry[] {
    return entries.value
      .filter((e) => e.siteOrigin === siteOrigin)
      .sort((a, b) => a.order - b.order)
  }

  /** 获取所有已保存的站点去重列表 */
  function getUniqueSites(): string[] {
    return [...new Set(entries.value.map((e) => e.siteOrigin))]
  }

  /** 根据 ID 查找条目 */
  function getEntryById(id: string): PasswordEntry | undefined {
    return entries.value.find((e) => e.id === id)
  }

  // ====== 导入导出 ======

  /** 导出所有密码为 CSV 字符串 */
  function generateExportCsv(): string {
    const rows = entries.value.map(entryToCsvRow)
    return [CSV_HEADER, ...rows].join('\n')
  }

  /** 保存 CSV 到文件 */
  async function exportPasswords(): Promise<boolean> {
    if (entries.value.length === 0) return false
    const csv = generateExportCsv()
    const result = await api.password.exportSaveFile(csv)
    return result.success
  }

  /** 从 CSV 字符串导入密码 */
  async function importPasswords(csv: string): Promise<number> {
    const lines = csv.split(/\r?\n/).filter((line) => line.trim())
    if (lines.length < 2) return 0

    // 跳过表头
    const dataLines = lines.slice(1)
    let imported = 0

    for (const line of dataLines) {
      const columns = parseCsvLine(line)
      const [name = '', url = '', username = '', password = '', note = '', fieldsJson = ''] = columns

      const trimmedUrl = url.trim()
      if (!trimmedUrl) continue

      // 构建字段列表
      const fields: PasswordField[] = []

      if (username) {
        fields.push({
          id: crypto.randomUUID(),
          name: '账号',
          type: 'text',
          value: username,
          protected: false
        })
      }

      if (password) {
        fields.push({
          id: crypto.randomUUID(),
          name: '密码',
          type: 'text',
          value: password,
          protected: true
        })
      }

      if (note) {
        fields.push({
          id: crypto.randomUUID(),
          name: '备注',
          type: 'textarea',
          value: note
        })
      }

      // 解析自定义字段 JSON
      if (fieldsJson) {
        try {
          const customFields = JSON.parse(fieldsJson)
          if (Array.isArray(customFields)) {
            for (const cf of customFields) {
              fields.push({
                id: crypto.randomUUID(),
                name: cf.name || '自定义',
                type: cf.type || 'text',
                value: cf.value || '',
                protected: cf.protected || undefined
              })
            }
          }
        } catch {
          // fields 列不是有效 JSON，忽略
        }
      }

      // URL 去重检查
      const siteName = (() => {
        try { return new URL(trimmedUrl).hostname } catch { return trimmedUrl }
      })()

      await createEntry({
        siteOrigin: trimmedUrl,
        siteName,
        name: name.trim() || siteName,
        fields,
        order: entries.value.filter((e) => e.siteOrigin === trimmedUrl).length + imported,
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      imported++
    }

    return imported
  }

  /** 打开文件对话框并导入 */
  async function importFromFile(): Promise<number> {
    const result = await api.password.importOpenFile()
    if (!result) return 0
    return importPasswords(result.csv)
  }

  // ====== 初始化 ======
  async function init() {
    await loadEntries()
  }

  return {
    entries,
    loadEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    getEntriesBySite,
    getUniqueSites,
    getEntryById,
    exportPasswords,
    importFromFile,
    init
  }
})
