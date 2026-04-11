<script setup lang="ts">
import { computed } from 'vue'
import type { DownloadTask } from '@/stores/download'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible'
import { ChevronRight, Globe, Film, Music, Archive, Image, FileText } from 'lucide-vue-next'

const props = defineProps<{
  tasks: DownloadTask[]
  selectedSite: string | null
  selectedCategory: string | null
}>()

const emit = defineEmits<{
  'update:selectedSite': [value: string | null]
  'update:selectedCategory': [value: string | null]
}>()

// ====== 文件格式分类 ======

const FILE_CATEGORIES: Record<string, { label: string; icon: any; extensions: string[] }> = {
  video: {
    label: '视频',
    icon: Film,
    extensions: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts']
  },
  audio: {
    label: '音频',
    icon: Music,
    extensions: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus']
  },
  archive: {
    label: '压缩包',
    icon: Archive,
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.iso', '.dmg']
  },
  image: {
    label: '图片',
    icon: Image,
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff']
  },
  document: {
    label: '文档',
    icon: FileText,
    extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.md', '.rtf']
  }
}

/** 从文件名提取扩展名（小写） */
function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex === -1) return ''
  return filename.slice(dotIndex).toLowerCase()
}

/** 判断文件属于哪个分类 */
function getFileCategory(filename: string): string | null {
  const ext = getExtension(filename)
  if (!ext) return null
  for (const [category, config] of Object.entries(FILE_CATEGORIES)) {
    if (config.extensions.includes(ext)) return category
  }
  return null
}

// ====== 站点列表 ======

const siteList = computed(() => {
  const counts = new Map<string, number>()
  for (const task of props.tasks) {
    try {
      const hostname = new URL(task.url).hostname
      counts.set(hostname, (counts.get(hostname) || 0) + 1)
    } catch {
      counts.set('未知来源', (counts.get('未知来源') || 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([site, count]) => ({ site, count }))
    .sort((a, b) => b.count - a.count)
})

// ====== 分类计数 ======

const categoryCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const key of Object.keys(FILE_CATEGORIES)) {
    counts[key] = 0
  }
  for (const task of props.tasks) {
    const cat = getFileCategory(task.filename || task.url)
    if (cat && cat in counts) {
      counts[cat]++
    }
  }
  return counts
})
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <ScrollArea class="flex-1">
      <div class="p-3 space-y-4">
        <!-- 站点过滤 -->
        <Collapsible default-open>
          <CollapsibleTrigger class="flex items-center gap-1.5 w-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1">
            <ChevronRight class="w-3.5 h-3.5 transition-transform [[data-state=open]>&]:rotate-90" />
            <Globe class="w-3.5 h-3.5" />
            <span>站点</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="mt-1.5 space-y-0.5">
              <button
                class="flex items-center justify-between w-full rounded px-2 py-1.5 text-xs transition-colors"
                :class="selectedSite === null ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'"
                @click="emit('update:selectedSite', null)"
              >
                <span>全部站点</span>
                <span class="text-muted-foreground">{{ tasks.length }}</span>
              </button>
              <button
                v-for="{ site, count } in siteList"
                :key="site"
                class="flex items-center justify-between w-full rounded px-2 py-1.5 text-xs transition-colors"
                :class="selectedSite === site ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'"
                @click="emit('update:selectedSite', selectedSite === site ? null : site)"
              >
                <span class="truncate mr-2">{{ site }}</span>
                <span class="text-muted-foreground shrink-0">{{ count }}</span>
              </button>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <!-- 文件格式过滤 -->
        <Collapsible default-open>
          <CollapsibleTrigger class="flex items-center gap-1.5 w-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1">
            <ChevronRight class="w-3.5 h-3.5 transition-transform [[data-state=open]>&]:rotate-90" />
            <Film class="w-3.5 h-3.5" />
            <span>文件格式</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="mt-1.5 space-y-0.5">
              <button
                class="flex items-center justify-between w-full rounded px-2 py-1.5 text-xs transition-colors"
                :class="selectedCategory === null ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'"
                @click="emit('update:selectedCategory', null)"
              >
                <span>全部格式</span>
                <span class="text-muted-foreground">{{ tasks.length }}</span>
              </button>
              <button
                v-for="(config, key) in FILE_CATEGORIES"
                :key="key"
                class="flex items-center gap-2 w-full rounded px-2 py-1.5 text-xs transition-colors"
                :class="selectedCategory === key ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'"
                @click="emit('update:selectedCategory', selectedCategory === key ? null : key)"
              >
                <component :is="config.icon" class="w-3.5 h-3.5 shrink-0" />
                <span class="flex-1 text-left">{{ config.label }}</span>
                <span class="text-muted-foreground shrink-0">{{ categoryCounts[key] }}</span>
              </button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </ScrollArea>
  </div>
</template>
