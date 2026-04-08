<script setup lang="ts">
import { ref } from 'vue'
import { Settings, Sun, Moon, Globe, Plus, Trash2 } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useThemeStore, type Theme } from '@/stores/theme'
import { useFavoriteSiteStore } from '@/stores/favoriteSite'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const themeStore = useThemeStore()
const favoriteSiteStore = useFavoriteSiteStore()

// 左侧 tab 列表
const tabs = [
  { key: 'general', label: '常规' },
  { key: 'sites', label: '常用网站' }
]
const activeTab = ref('general')

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '亮色', icon: Sun },
  { value: 'dark', label: '暗色', icon: Moon }
]

// ====== 常用网站管理 ======
const newTitle = ref('')
const newUrl = ref('')

async function addSite() {
  const title = newTitle.value.trim()
  const url = newUrl.value.trim()
  if (!title || !url) return
  await favoriteSiteStore.createSite({ title, url })
  newTitle.value = ''
  newUrl.value = ''
}

async function removeSite(id: string) {
  await favoriteSiteStore.deleteSite(id)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-2xl max-h-[70vh] flex flex-col p-0 gap-0">
      <DialogHeader class="px-6 pt-6 pb-4 border-b">
        <DialogTitle class="flex items-center gap-2">
          <Settings class="w-4 h-4" />
          设置
        </DialogTitle>
      </DialogHeader>

      <div class="flex flex-1 min-h-0">
        <!-- 左侧垂直 Tabs -->
        <nav class="w-[140px] shrink-0 border-r p-2 flex flex-col gap-0.5">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="w-full text-left text-sm px-3 py-2 rounded-md transition-colors"
            :class="activeTab === tab.key
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-muted/50'"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </nav>

        <!-- 右侧设置内容 -->
        <div class="flex-1 p-6 overflow-y-auto">
          <!-- 常规 - 主题设置 -->
          <div v-if="activeTab === 'general'">
            <h3 class="text-sm font-medium mb-3">主题设置</h3>
            <div class="flex gap-2">
              <Button
                v-for="opt in themeOptions"
                :key="opt.value"
                :variant="themeStore.theme === opt.value ? 'default' : 'outline'"
                size="sm"
                class="gap-1.5"
                @click="themeStore.setTheme(opt.value)"
              >
                <component :is="opt.icon" class="w-3.5 h-3.5" />
                {{ opt.label }}
              </Button>
            </div>
          </div>

          <!-- 常用网站管理 -->
          <div v-else-if="activeTab === 'sites'">
            <h3 class="text-sm font-medium mb-3">常用网站</h3>
            <p class="text-xs text-muted-foreground mb-4">添加常用网站后，在新建/编辑账号时可快速选择网址。</p>

            <!-- 添加表单 -->
            <div class="flex gap-2 mb-4">
              <Input v-model="newTitle" placeholder="网站标题" class="w-36" @keydown.enter="addSite" />
              <Input v-model="newUrl" placeholder="网址 URL" class="flex-1" @keydown.enter="addSite" />
              <Button size="sm" :disabled="!newTitle.trim() || !newUrl.trim()" @click="addSite">
                <Plus class="w-4 h-4" />
              </Button>
            </div>

            <!-- 网站列表 -->
            <div class="flex flex-col gap-1.5">
              <div
                v-for="site in favoriteSiteStore.sites"
                :key="site.id"
                class="flex items-center gap-2 text-sm px-3 py-2 rounded-md border bg-card"
              >
                <Globe class="w-4 h-4 text-muted-foreground shrink-0" />
                <span class="font-medium truncate">{{ site.title }}</span>
                <span class="text-muted-foreground truncate text-xs flex-1">{{ site.url }}</span>
                <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" @click="removeSite(site.id)">
                  <Trash2 class="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
              <p v-if="!favoriteSiteStore.sites.length" class="text-xs text-muted-foreground text-center py-4">
                暂无常用网站，请添加
              </p>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
