<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Puzzle, FolderOpen, RotateCcw, FolderInput } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'vue-sonner'
import { usePluginStore } from '@/stores/plugin'

const api = window.api
const pluginStore = usePluginStore()

const currentDir = ref('')
const defaultDir = ref('')
const isCustom = ref(false)
const saving = ref(false)

onMounted(loadDir)

async function loadDir() {
  const info = await api.plugin.getDir()
  currentDir.value = info.current
  defaultDir.value = info.default
  isCustom.value = info.isCustom
}

async function handlePick() {
  const selected = await api.plugin.pickDir()
  if (!selected) return
  if (selected === currentDir.value) {
    toast.info('所选目录与当前插件目录相同')
    return
  }
  await applyDir(selected)
}

async function handleReset() {
  await applyDir('')
}

async function applyDir(dir: string) {
  if (saving.value) return
  saving.value = true
  try {
    const res = await api.plugin.setDir(dir)
    if (!res.success) {
      toast.error(res.error || '插件目录设置失败')
      return
    }
    await loadDir()
    await pluginStore.init()
    toast.success(dir ? '插件目录已更新，插件已重新加载' : '已恢复默认插件目录，插件已重新加载')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <section>
      <h3 class="text-sm font-medium mb-3 flex items-center gap-2">
        <Puzzle class="w-4 h-4" />
        插件目录
      </h3>
      <div class="space-y-3">
        <div class="space-y-1">
          <label class="text-xs text-muted-foreground">
            插件加载目录{{ isCustom ? '（自定义）' : '（默认）' }}
          </label>
          <div class="flex gap-2">
            <Input
              :model-value="currentDir"
              readonly
              class="font-mono text-xs flex-1"
            />
            <Button
              variant="outline"
              :disabled="saving"
              @click="handlePick"
            >
              <FolderOpen class="w-4 h-4" />
              浏览
            </Button>
            <Button
              v-if="isCustom"
              variant="outline"
              :disabled="saving"
              @click="handleReset"
            >
              <RotateCcw class="w-4 h-4" />
              恢复默认
            </Button>
          </div>
        </div>
        <p class="text-xs text-muted-foreground">
          目录下每个子目录为一个插件（需包含 info.json 与 main.js）。切换目录后会卸载当前全部插件，并从新目录重新加载。
        </p>
      </div>
    </section>

    <section>
      <h3 class="text-sm font-medium mb-3 flex items-center gap-2">
        <FolderInput class="w-4 h-4" />
        管理
      </h3>
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label class="text-xs text-muted-foreground">在文件管理器中打开插件目录</label>
          <Button
            variant="outline"
            @click="pluginStore.openPluginsFolder()"
          >
            <FolderOpen class="w-4 h-4" />
            打开目录
          </Button>
        </div>
      </div>
    </section>
  </div>
</template>
