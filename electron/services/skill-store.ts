/**
 * Skill 存储服务
 *
 * 将 Skill 以 Markdown 文件形式持久化到 {userData}/skills/ 目录。
 * 每个 Skill 是一个独立的 .md 文件，格式如下：
 *
 * ---
 * name: skill-name
 * description: 一句话说明
 * created: 2026-04-16T10:00:00.000Z
 * updated: 2026-04-16T10:00:00.000Z
 * ---
 *
 * ## 步骤
 * 1. ...
 *
 * ## 代码
 * ```js
 * // ...
 * ```
 */

import { app } from 'electron'
import { join } from 'path'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from 'fs'

// ===== 类型 =====

export interface SkillMeta {
  name: string
  description: string
  created: string
  updated: string
}

export interface Skill extends SkillMeta {
  content: string
}

// ===== 存储路径 =====

function getSkillsDir(): string {
  const dir = join(app.getPath('userData'), 'skills')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function skillFilePath(name: string): string {
  return join(getSkillsDir(), `${sanitizeName(name)}.md`)
}

/** 将名称规范化为安全的文件名 */
function sanitizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff\-_]/g, '')
}

// ===== Frontmatter 解析 =====

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/

function parseFrontmatter(raw: string): { meta: SkillMeta; content: string } | null {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) return null

  const yaml = match[1]
  const content = match[2]

  const meta: Record<string, string> = {}
  for (const line of yaml.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    meta[key] = val
  }

  return {
    meta: {
      name: meta.name || '',
      description: meta.description || '',
      created: meta.created || new Date().toISOString(),
      updated: meta.updated || new Date().toISOString(),
    },
    content,
  }
}

function buildFrontmatter(meta: SkillMeta, content: string): string {
  return [
    '---',
    `name: ${meta.name}`,
    `description: ${meta.description}`,
    `created: ${meta.created}`,
    `updated: ${meta.updated}`,
    '---',
    '',
    content,
  ].join('\n')
}

// ===== 公开 API =====

/**
 * 保存或更新一个 Skill。
 * 同名则覆盖。
 */
export function writeSkill(
  name: string,
  description: string,
  content: string,
): Skill {
  const safeName = sanitizeName(name)
  if (!safeName) throw new Error('Skill 名称无效')

  const now = new Date().toISOString()

  // 如果已存在，保留 created 时间
  const existing = readSkillRaw(safeName)
  const created = existing?.meta.created ?? now

  const meta: SkillMeta = {
    name: safeName,
    description,
    created,
    updated: now,
  }

  const filePath = skillFilePath(safeName)
  writeFileSync(filePath, buildFrontmatter(meta, content), 'utf-8')

  return { ...meta, content }
}

/**
 * 按名称读取 Skill 完整内容。
 */
export function readSkill(name: string): Skill | null {
  const raw = readSkillRaw(sanitizeName(name))
  if (!raw) return null
  return { ...raw.meta, content: raw.content }
}

/**
 * 列出所有已保存的 Skill（名称 + 说明）。
 */
export function listSkills(): SkillMeta[] {
  const dir = getSkillsDir()
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'))

  const skills: SkillMeta[] = []
  for (const file of files) {
    const raw = readFileSync(join(dir, file), 'utf-8')
    const parsed = parseFrontmatter(raw)
    if (parsed) {
      skills.push(parsed.meta)
    }
  }

  return skills.sort((a, b) => b.updated.localeCompare(a.updated))
}

/**
 * 按名称模糊搜索 Skill。
 * 支持中文、英文、短横线连接的名称匹配。
 */
export function searchSkill(query: string): SkillMeta[] {
  const q = query.toLowerCase().trim()
  if (!q) return listSkills()

  return listSkills().filter((s) => {
    const name = s.name.toLowerCase()
    const desc = s.description.toLowerCase()
    return name.includes(q) || desc.includes(q)
  })
}

/**
 * 删除一个 Skill。
 */
export function deleteSkill(name: string): boolean {
  const filePath = skillFilePath(sanitizeName(name))
  if (!existsSync(filePath)) return false
  unlinkSync(filePath)
  return true
}

/**
 * 从 Skill 内容中提取所有 ```js / ```javascript 代码块。
 */
export function extractCodeBlocks(content: string): string[] {
  const blocks: string[] = []
  const re = /```(?:js|javascript)\r?\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    blocks.push(match[1].trim())
  }
  return blocks
}

/**
 * 将参数占位符 {{paramName}} 替换为实际值。
 */
export function replaceParams(code: string, params: Record<string, unknown>): string {
  return code.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = params[key]
    if (val === undefined) return `{{${key}}}`
    return typeof val === 'string' ? val : JSON.stringify(val)
  })
}

// ===== 内部辅助 =====

function readSkillRaw(name: string): { meta: SkillMeta; content: string } | null {
  const filePath = skillFilePath(name)
  if (!existsSync(filePath)) return null

  const raw = readFileSync(filePath, 'utf-8')
  return parseFrontmatter(raw)
}
