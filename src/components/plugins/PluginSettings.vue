<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePluginStore } from '@/stores/plugin'
import { createApp, defineComponent } from 'vue'

const pluginStore = usePluginStore()

const plugin = ref(
  pluginStore.plugins.find((p) => p.id === pluginStore.activeViewPluginId)
)

const containerRef = ref<HTMLElement | null>(null)
let dynamicApp: any = null

onMounted(async () => {
  if (!plugin.value) return

  const viewContent = await pluginStore.loadViewContent(plugin.value.id)
  if (!viewContent || !containerRef.value) return

  try {
    const moduleExports = new Function('module', 'exports', 'require', `
      const module = { exports: {} };
      const exports = module.exports;
      ${viewContent}
      return module.exports;
    `)()

    if (!moduleExports || !moduleExports.template) return

    const componentDef = {
      ...moduleExports,
      props: {
        ...(typeof moduleExports.props === 'object' && !Array.isArray(moduleExports.props) ? moduleExports.props : {}),
        pluginInfo: { type: Object, default: () => plugin.value }
      }
    }

    const DynamicComponent = defineComponent(componentDef)
    dynamicApp = createApp(DynamicComponent, {
      pluginInfo: {
        id: plugin.value.id,
        name: plugin.value.name,
        version: plugin.value.version,
        description: plugin.value.description
      }
    })

    dynamicApp.mount(containerRef.value)
  } catch (err) {
    console.error('[PluginSettings] 动态组件编译失败:', err)
  }
})

onBeforeUnmount(() => {
  if (dynamicApp) {
    dynamicApp.unmount()
    dynamicApp = null
  }
})
</script>

<template>
  <div v-if="plugin" class="border-t border-border bg-muted/30">
    <div class="flex items-center justify-between px-4 py-2 border-b border-border">
      <h3 class="text-sm font-medium">{{ plugin.name }} - 设置</h3>
      <Button variant="ghost" size="icon" class="h-7 w-7" @click="pluginStore.closeView()">
        <X class="w-4 h-4" />
      </Button>
    </div>
    <ScrollArea class="max-h-80">
      <div ref="containerRef" class="p-4" />
    </ScrollArea>
  </div>
</template>
