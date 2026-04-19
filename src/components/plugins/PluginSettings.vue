<script setup lang="ts">
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePluginStore } from '@/stores/plugin'
import { createApp, defineComponent } from 'vue'

const pluginStore = usePluginStore()

const containerRef = ref<HTMLElement | null>(null)
let dynamicApp: any = null

async function mountDynamicView(pluginId: string) {
  cleanupDynamicApp()
  const plugin = pluginStore.plugins.find((p) => p.id === pluginId)
  if (!plugin) return

  const viewContent = await pluginStore.loadViewContent(pluginId)

  await nextTick()

  if (!viewContent || !containerRef.value) return

  try {
    const wrappedCode = `
      var module = { exports: {} };
      var exports = module.exports;
      ${viewContent}
      return module.exports;
    `
    const result = new Function(wrappedCode)()

    if (!result || !result.template) return

    const componentDef = {
      ...result,
      props: {
        ...(typeof result.props === 'object' && !Array.isArray(result.props) ? result.props : {}),
        pluginInfo: { type: Object, default: () => plugin }
      }
    }

    const DynamicComponent = defineComponent(componentDef)
    dynamicApp = createApp(DynamicComponent, {
      pluginInfo: plugin
    })

    dynamicApp.mount(containerRef.value)
  } catch (err) {
    console.error('[PluginSettings] 动态组件编译失败:', err)
  }
}

function cleanupDynamicApp() {
  if (dynamicApp) {
    dynamicApp.unmount()
    dynamicApp = null
  }
}

watch(
  () => pluginStore.activeViewPluginId,
  (pluginId) => {
    if (pluginId) {
      mountDynamicView(pluginId)
    } else {
      cleanupDynamicApp()
    }
  }
)

onBeforeUnmount(() => {
  cleanupDynamicApp()
})
</script>

<template>
  <Dialog
    :open="pluginStore.activeViewPluginId !== null"
    @update:open="(val) => { if (!val) pluginStore.closeView() }"
  >
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {{ pluginStore.plugins.find(p => p.id === pluginStore.activeViewPluginId)?.name }} - 设置
        </DialogTitle>
      </DialogHeader>
      <div
        ref="containerRef"
        class="min-h-[120px]"
      />
    </DialogContent>
  </Dialog>
</template>
