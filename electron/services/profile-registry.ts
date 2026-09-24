import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DEFAULT_PROFILE_ID, DEFAULT_USER_DATA } from '../bootstrap'

export interface Profile {
  id: string
  name: string
  createdAt: number
  lastUsedAt?: number
}

// 注册表固定放在原始 userData 根目录，各 profile 进程都能读到同一份
const REGISTRY_FILE = join(DEFAULT_USER_DATA, 'profiles.json')

interface ProfileRegistry {
  profiles: Profile[]
}

function readRegistry(): ProfileRegistry {
  try {
    if (!existsSync(REGISTRY_FILE)) return { profiles: [] }
    const parsed = JSON.parse(readFileSync(REGISTRY_FILE, 'utf8')) as ProfileRegistry
    if (!Array.isArray(parsed?.profiles)) return { profiles: [] }
    return parsed
  } catch (error) {
    console.error('[ProfileRegistry] 读取 profiles.json 失败', error)
    return { profiles: [] }
  }
}

function writeRegistry(data: ProfileRegistry): void {
  try {
    writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch (error) {
    console.error('[ProfileRegistry] 写入 profiles.json 失败', error)
  }
}

export function listProfiles(): Profile[] {
  const data = readRegistry()
  if (!data.profiles.some((profile) => profile.id === DEFAULT_PROFILE_ID)) {
    data.profiles.unshift({ id: DEFAULT_PROFILE_ID, name: '默认环境', createdAt: 0 })
    writeRegistry(data)
  }
  return data.profiles
}

export function getProfile(id: string): Profile | null {
  return listProfiles().find((profile) => profile.id === id) ?? null
}

export function createProfile(name: string): Profile {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Profile 名称不能为空')
  const data = readRegistry()
  const profile: Profile = { id: randomUUID(), name: trimmed, createdAt: Date.now() }
  data.profiles.push(profile)
  writeRegistry(data)
  return profile
}

export function touchProfile(id: string): void {
  const data = readRegistry()
  const profile = data.profiles.find((item) => item.id === id)
  if (!profile) return
  profile.lastUsedAt = Date.now()
  writeRegistry(data)
}
