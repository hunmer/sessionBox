import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { JsonStore } from '../utils/json-store'
import type { PasswordEntry } from './store'

interface PasswordStoreData {
  passwords: PasswordEntry[]
}

const defaults: PasswordStoreData = {
  passwords: [],
}

export const passwordStore = new JsonStore<PasswordStoreData>(
  join(app.getPath('userData'), 'password-store.json'),
  defaults
)

// ====== 密码/笔记管理 ======

export function listPasswords(): PasswordEntry[] {
  const passwords = passwordStore.get('passwords') ?? defaults.passwords
  return [...passwords].sort((a, b) => a.order - b.order)
}

export function listPasswordsBySite(siteOrigin: string): PasswordEntry[] {
  return (passwordStore.get('passwords') ?? [])
    .filter((p) => p.siteOrigin === siteOrigin)
    .sort((a, b) => a.order - b.order)
}

export function createPassword(data: Omit<PasswordEntry, 'id'>): PasswordEntry {
  const passwords = passwordStore.get('passwords') ?? []
  const entry: PasswordEntry = { ...data, id: randomUUID() }
  passwords.push(entry)
  passwordStore.set('passwords', passwords)
  return entry
}

export function updatePassword(id: string, data: Partial<Omit<PasswordEntry, 'id'>>): void {
  const passwords = passwordStore.get('passwords') ?? []
  const idx = passwords.findIndex((p) => p.id === id)
  if (idx === -1) throw new Error(`密码条目 ${id} 不存在`)
  passwords[idx] = { ...passwords[idx], ...data, updatedAt: Date.now() }
  passwordStore.set('passwords', passwords)
}

export function deletePassword(id: string): void {
  const passwords = (passwordStore.get('passwords') ?? []).filter((p) => p.id !== id)
  passwordStore.set('passwords', passwords)
}

export function clearAllPasswords(): void {
  passwordStore.set('passwords', [])
}
