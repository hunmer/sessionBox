import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { format } from 'node:util'

const MAX_LOG_SIZE = 5 * 1024 * 1024

export function pluginLogPath(userDataPath: string, pluginId: string): string {
  return join(userDataPath, 'logs', 'plugins', `plugin-${encodeURIComponent(pluginId)}.log`)
}

export function ensurePluginLog(userDataPath: string, pluginId: string): string {
  const path = pluginLogPath(userDataPath, pluginId)
  mkdirSync(join(userDataPath, 'logs', 'plugins'), { recursive: true })
  if (!existsSync(path)) writeFileSync(path, '', 'utf8')
  return path
}

export function writePluginLog(userDataPath: string, pluginId: string, level: string, message: string, ...args: unknown[]): void {
  const path = ensurePluginLog(userDataPath, pluginId)
  try {
    if (statSync(path).size > MAX_LOG_SIZE) {
      renameSync(path, `${path}.old`)
    }
  } catch {
    // Rotation failure must not prevent logging.
  }
  const text = format(message, ...args)
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer ***')
  appendFileSync(path, `${new Date().toISOString()} [${level}] ${text}\n`, 'utf8')
}
