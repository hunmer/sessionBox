// src/types/command.ts

import type { Component } from 'vue'

/** 命令面板中的单个可选项 */
export interface CommandItem {
  /** 唯一标识 */
  id: string
  /** 显示名称 */
  label: string
  /** 副标题（如 URL、描述） */
  description?: string
  /** lucide 图标组件 */
  icon?: Component
  /** 右侧显示的快捷键提示 */
  shortcut?: string
  /** 额外搜索关键词（提升模糊匹配率） */
  keywords?: string[]
  /** 选中时执行的动作 */
  run: () => void | Promise<void>
}

/** 命令数据源提供者接口 */
export interface CommandProvider {
  /** 提供者唯一标识 */
  id: string
  /** 触发前缀（完整形式，如 'bookmark'） */
  prefix: string
  /** 触发前缀（简写形式，如 'bm'） */
  prefixShort?: string
  /** 分组标题 */
  label: string
  /** 分组图标 */
  icon: Component
  /** 根据关键词搜索并返回匹配项 */
  search(query: string): Promise<CommandItem[]>
}
