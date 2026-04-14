import type { CommandProvider, CommandItem } from '@/types/command'
import { Briefcase } from 'lucide-vue-next'
import { useWorkspaceStore } from '@/stores/workspace'

export function createWorkspaceProvider(): CommandProvider {
  return {
    id: 'workspace',
    prefix: 'workspace',
    prefixShort: 'ws',
    label: '工作区',
    icon: Briefcase,
    async search(query: string): Promise<CommandItem[]> {
      const workspaceStore = useWorkspaceStore()
      const q = query.toLowerCase()

      const filtered = q
        ? workspaceStore.workspaces.filter(
            (w) => w.title.toLowerCase().includes(q)
          )
        : workspaceStore.sortedWorkspaces

      return filtered.map((w) => ({
        id: `workspace-${w.id}`,
        label: w.title,
        description: workspaceStore.activeWorkspaceId === w.id ? '当前工作区' : undefined,
        icon: Briefcase,
        keywords: [w.title, w.color],
        run: () => {
          workspaceStore.activate(w.id)
        },
      }))
    },
  }
}
