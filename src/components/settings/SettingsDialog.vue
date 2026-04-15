<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Settings, User, Palette, Settings2, LayoutList, Keyboard, Globe, Info, Download, Search, Box, Rocket
} from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import SettingsGeneral from './SettingsGeneral.vue'
import SettingsSites from './SettingsSites.vue'
import SettingsAbout from './SettingsAbout.vue'
import SettingsTabs from './SettingsTabs.vue'
import SettingsShortcut from './SettingsShortcut.vue'
import SettingsUser from './SettingsUser.vue'
import SettingsTheme from './SettingsTheme.vue'
import SettingsDownload from './SettingsDownload.vue'
import SettingsSearch from './SettingsSearch.vue'
import SettingsContainer from './SettingsContainer.vue'
import SettingsStartup from './SettingsStartup.vue'

const props = defineProps<{ open: boolean; initialTab?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const tabs = [
  { key: 'user', label: '用户', icon: User },
  { key: 'theme', label: '主题', icon: Palette },
  { key: 'general', label: '常规', icon: Settings2 },
  { key: 'startup', label: '启动', icon: Rocket },
  { key: 'tabs', label: '标签页', icon: LayoutList },
  { key: 'containers', label: '容器', icon: Box },
  { key: 'shortcuts', label: '快捷键', icon: Keyboard },
  { key: 'sites', label: '网站', icon: Globe },
  { key: 'download', label: '下载', icon: Download },
  { key: 'search', label: '搜索', icon: Search },
  { key: 'about', label: '关于', icon: Info }
]
const activeTab = ref('general')

watch(() => props.open, (open) => {
  if (open && props.initialTab) {
    activeTab.value = props.initialTab
  }
})
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
        <nav class="w-[140px] shrink-0 border-r p-2 flex flex-col gap-0.5">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="w-full text-left text-sm px-3 py-2 rounded-md transition-colors flex items-center gap-2"
            :class="activeTab === tab.key
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-muted-foreground hover:bg-muted/50'"
            @click="activeTab = tab.key"
          >
            <component :is="tab.icon" class="w-4 h-4 shrink-0" />
            {{ tab.label }}
          </button>
        </nav>

        <div class="flex-1 p-6 overflow-y-auto">
          <SettingsUser v-if="activeTab === 'user'" />
          <SettingsTheme v-else-if="activeTab === 'theme'" />
          <SettingsGeneral v-else-if="activeTab === 'general'" />
          <SettingsStartup v-else-if="activeTab === 'startup'" />
          <SettingsTabs v-else-if="activeTab === 'tabs'" />
          <SettingsContainer v-else-if="activeTab === 'containers'" />
          <SettingsShortcut v-else-if="activeTab === 'shortcuts'" />
          <SettingsSites v-else-if="activeTab === 'sites'" />
          <SettingsDownload v-else-if="activeTab === 'download'" />
          <SettingsSearch v-else-if="activeTab === 'search'" />
          <SettingsAbout v-else-if="activeTab === 'about'" />
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
