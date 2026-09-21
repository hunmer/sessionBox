<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ArrowRight, Play, Video } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

interface Preset { id: string; name: string; stepCount: number; initialUrl?: string }
const emit = defineEmits<{ 'open-full': [] }>()
const presets = ref<Preset[]>([])
const tabs = ref<any[]>([])

onMounted(async () => {
  ;[presets.value, tabs.value] = await Promise.all([window.api.debugger.listActionPresets(), window.api.debugger.getTabs()])
})

async function execute(item: Preset) {
  const target = tabs.value.find(tab => !String(tab.url).startsWith('sessionbox://'))
  if (!target) return toast.error('没有可执行录制的网页标签页')
  const loaded = await window.api.debugger.loadActionPreset(item.id)
  if (!loaded?.success) return toast.error(loaded?.error || '读取录制失败')
  const result = await window.api.debugger.playActionRun(target.webContentsId, loaded.run)
  if (result?.success === false) return toast.error(result.error || '执行失败')
  toast.success(`正在执行“${item.name}”`)
}
</script>

<template>
  <div class="w-80">
    <div class="flex items-center justify-between px-3 py-2">
      <div class="flex items-center gap-2 text-sm font-medium"><Video class="h-4 w-4" />录制</div>
      <Button variant="ghost" size="sm" class="h-7 gap-1 text-xs text-primary" @click="emit('open-full')">打开新标签页<ArrowRight class="h-3 w-3" /></Button>
    </div>
    <ScrollArea class="h-72 border-t">
      <button v-for="item in presets" :key="item.id" class="flex w-full items-center gap-2 border-b px-3 py-2 text-left hover:bg-muted/60" @click="execute(item)">
        <Play class="h-3.5 w-3.5 shrink-0 text-primary" />
        <span class="min-w-0 flex-1 truncate text-xs">{{ item.name }}</span>
        <Badge variant="secondary" class="text-[10px]">{{ item.stepCount }} 步</Badge>
      </button>
      <div v-if="!presets.length" class="flex h-40 items-center justify-center text-xs text-muted-foreground">暂无已保存录制</div>
    </ScrollArea>
  </div>
</template>
