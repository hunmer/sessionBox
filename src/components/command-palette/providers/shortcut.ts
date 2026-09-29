import type { Component } from 'vue'
import type { CommandProvider, CommandItem } from '@/types/command'
import { Keyboard, AppWindow, ArrowLeftRight, Eye, Wrench, Monitor } from 'lucide-vue-next'
import { useShortcutStore } from '@/stores/shortcut'
import { executeShortcutAction } from '@/lib/shortcut-action'
import { acceleratorToDisplay } from '@/lib/accelerator'

/** 分组 -> 图标 */
const GROUP_ICONS: Record<string, Component> = {
  tab: AppWindow,
  navigation: ArrowLeftRight,
  view: Eye,
  tools: Wrench,
  window: Monitor
}

/** 快捷键动作 Provider：数据来自共享 shortcut store，选中后复用快捷键执行路径 */
export function createShortcutCommandProvider(): CommandProvider {
  return {
    id: 'shortcut',
    prefix: 'sc',
    prefixShort: '键',
    label: '快捷键动作',
    icon: Keyboard,
    async search(query: string): Promise<CommandItem[]> {
      const store = useShortcutStore()
      if (!store.shortcuts.length) await store.load()

      const q = query.trim().toLowerCase()
      return store.shortcuts
        .filter(s => s.enabled && s.accelerator)
        .filter(s =>
          !q
          || s.label.toLowerCase().includes(q)
          || s.accelerator.toLowerCase().includes(q)
          || s.id.toLowerCase().includes(q)
        )
        .map(s => ({
          id: `shortcut-${s.id}`,
          label: s.label,
          description: store.groups.find(g => g.key === s.group)?.label,
          icon: GROUP_ICONS[s.group] ?? Keyboard,
          shortcut: acceleratorToDisplay(s.accelerator),
          keywords: [s.id],
          run: () => {
            executeShortcutAction(s.id)
          }
        }))
    }
  }
}
