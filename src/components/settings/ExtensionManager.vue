<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Loader2, Plus, Puzzle, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useExtensionStore } from '@/stores/extension'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

const extensionStore = useExtensionStore()

const isOpen = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  await extensionStore.init()
})

function open() {
  isOpen.value = true
  error.value = null
}

function close() {
  isOpen.value = false
}

async function addExtension() {
  isLoading.value = true
  error.value = null

  try {
    console.log('[ExtensionManager] Calling selectExtension...')
    const extension = await extensionStore.selectExtension()
    console.log('[ExtensionManager] selectExtension returned:', extension)

    if (!extension) {
      error.value = '未选择扩展或选择失败'
      return
    }

    await extensionStore.loadExtension(extension.id)
  } catch (errorCause) {
    console.error('[ExtensionManager] Error:', errorCause)
    error.value = errorCause instanceof Error ? errorCause.message : '添加扩展失败'
  } finally {
    isLoading.value = false
  }
}

async function toggleExtension(extensionId: string, enabled: boolean) {
  try {
    await extensionStore.updateExtension(extensionId, { enabled })
  } catch (errorCause) {
    error.value = errorCause instanceof Error ? errorCause.message : '更新扩展失败'
  }
}

async function deleteExtensionItem(extensionId: string) {
  if (!confirm('确定要删除此扩展吗？')) return

  isLoading.value = true
  error.value = null

  try {
    await extensionStore.deleteExtension(extensionId)
  } catch (errorCause) {
    error.value = errorCause instanceof Error ? errorCause.message : '删除扩展失败'
  } finally {
    isLoading.value = false
  }
}

defineExpose({ open, close })
</script>

<template>
  <Dialog :open="isOpen" @update:open="isOpen = $event">
    <DialogContent class="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Puzzle class="w-5 h-5" />
          扩展管理
        </DialogTitle>
        <DialogDescription>
          添加和管理 Chrome 扩展。已添加扩展会自动对所有 partition 生效。
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-auto space-y-4">
        <div v-if="error" class="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded">
          {{ error }}
        </div>

        <Button variant="outline" class="w-full" @click="addExtension" :disabled="isLoading">
          <Loader2 v-if="isLoading" class="w-4 h-4 mr-2 animate-spin" />
          <Plus v-else class="w-4 h-4 mr-2" />
          添加扩展
        </Button>

        <div v-if="extensionStore.extensions.length > 0" class="space-y-2">
          <label class="text-sm font-medium">已添加的扩展</label>
          <div class="border rounded-md divide-y">
            <div
              v-for="ext in extensionStore.extensions"
              :key="ext.id"
              class="flex items-center justify-between p-3"
            >
              <div class="flex items-center gap-3 min-w-0">
                <img
                  v-if="ext.icon"
                  :src="`extension-icon://${ext.id}`"
                  class="w-8 h-8 rounded object-contain"
                />
                <div v-else class="w-8 h-8 bg-secondary rounded flex items-center justify-center">
                  <Puzzle class="w-4 h-4 text-muted-foreground" />
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-medium">{{ ext.name }}</div>
                  <div class="text-xs text-muted-foreground">{{ ext.enabled ? '已启用' : '已禁用' }}</div>
                  <div class="text-xs text-muted-foreground truncate max-w-[260px]">
                    {{ ext.path }}
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <Switch
                  :checked="ext.enabled"
                  @update:checked="toggleExtension(ext.id, $event)"
                  :disabled="isLoading"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-muted-foreground hover:text-red-500"
                  @click="deleteExtensionItem(ext.id)"
                  :disabled="isLoading"
                >
                  <Trash2 class="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-8 text-muted-foreground">
          <Puzzle class="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p class="text-sm">暂无已添加的扩展</p>
          <p class="text-xs mt-1">点击上方按钮添加 Chrome 扩展</p>
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" @click="close">关闭</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
