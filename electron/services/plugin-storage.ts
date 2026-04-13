import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

export class PluginStorage {
  private filePath: string
  private data: Record<string, any>

  constructor(pluginId: string, userDataPath: string) {
    const dir = join(userDataPath, 'plugin-data', pluginId)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.filePath = join(dir, 'storage.json')
    try {
      this.data = existsSync(this.filePath) ? JSON.parse(readFileSync(this.filePath, 'utf-8')) : {}
    } catch {
      this.data = {}
    }
  }

  async get(key: string): Promise<any> {
    return this.data[key]
  }

  async set(key: string, value: any): Promise<void> {
    this.data[key] = value
    this.save()
  }

  async delete(key: string): Promise<void> {
    delete this.data[key]
    this.save()
  }

  async clear(): Promise<void> {
    this.data = {}
    this.save()
  }

  async keys(): Promise<string[]> {
    return Object.keys(this.data)
  }

  private save(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
  }
}
