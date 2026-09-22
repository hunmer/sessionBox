<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Loader2, Plus, Puzzle, RefreshCw, Store, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useExtensionStore } from '@/stores/extension'
import { useTabStore } from '@/stores/tab'

const extensionStore = useExtensionStore()
const tabStore = useTabStore()

const CHROME_WEB_STORE_URL = 'https://chromewebstore.google.com/'

function openWebStore() {
  tabStore.createTabInDefaultSession(CHROME_WEB_STORE_URL)
}

const isLoading = ref(false)
const error = ref<string | null>(null)

const enabledCount = computed(() => extensionStore.extensions.filter((e) => e.enabled).length)

onMounted(async () => {
  await extensionStore.init()
})

async function handleRefresh() {
  isLoading.value = true
  error.value = null
  try {
    await extensionStore.init()
    await extensionStore.refreshLoadedExtensions()
  } finally {
    isLoading.value = false
  }
}

async function addExtension() {
  isLoading.value = true
  error.value = null

  try {
    const extension = await extensionStore.selectExtension()

    if (!extension) {
      error.value = '未选择扩展或选择失败'
      return
    }

    await extensionStore.loadExtension(extension.id)
  } catch (errorCause) {
    error.value = errorCause instanceof Error ? errorCause.message : '添加扩展失败'
  } finally {
    isLoading.value = false
  }
}

async function toggleExtension(extensionId: string, enabled: boolean) {
  error.value = null

  try {
    await extensionStore.updateExtension(extensionId, { enabled })
    await extensionStore.refreshLoadedExtensions()
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
    await extensionStore.refreshLoadedExtensions()
  } catch (errorCause) {
    error.value = errorCause instanceof Error ? errorCause.message : '删除扩展失败'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-background text-foreground">
    <!-- 标题栏 -->
    <div class="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
      <Puzzle class="w-4 h-4 text-muted-foreground" />
      <h2 class="text-sm font-semibold flex-shrink-0">
        扩展管理
      </h2>
      <span class="text-xs text-muted-foreground">
        {{ enabledCount }}/{{ extensionStore.extensions.length }} 已启用
      </span>
      <div class="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        class="h-7 text-xs gap-1"
        @click="openWebStore"
      >
        <Store class="w-3.5 h-3.5" />
        扩展商店
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 text-xs gap-1"
        :disabled="isLoading"
        @click="addExtension"
      >
        <Loader2
          v-if="isLoading"
          class="w-3.5 h-3.5 animate-spin"
        />
        <Plus
          v-else
          class="w-3.5 h-3.5"
        />
        添加扩展
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 text-xs gap-1"
        @click="handleRefresh"
      >
        <RefreshCw
          class="w-3.5 h-3.5"
          :class="{ 'animate-spin': isLoading }"
        />
        刷新
      </Button>
    </div>

    <!-- 扩展列表 -->
    <div class="flex-1 min-h-0 overflow-auto">
      <div class="w-full p-6">
        <div
          v-if="error"
          class="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded mb-4"
        >
          {{ error }}
        </div>

        <div
          v-if="extensionStore.extensions.length > 0"
          class="border rounded-md divide-y"
        >
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
              >
              <div
                v-else
                class="w-8 h-8 bg-secondary rounded flex items-center justify-center"
              >
                <Puzzle class="w-4 h-4 text-muted-foreground" />
              </div>
              <div class="min-w-0">
                <div class="text-sm font-medium">
                  {{ ext.name }}
                </div>
                <div class="text-xs text-muted-foreground">
                  {{ ext.enabled ? '已启用' : '已禁用' }}
                </div>
                <div class="text-xs text-muted-foreground truncate max-w-[420px]">
                  {{ ext.path }}
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <Switch
                :model-value="ext.enabled"
                :disabled="isLoading"
                @update:model-value="toggleExtension(ext.id, $event)"
              />
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 text-muted-foreground hover:text-red-500"
                :disabled="isLoading"
                @click="deleteExtensionItem(ext.id)"
              >
                <Trash2 class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div
          v-else
          class="flex flex-col items-center justify-center py-20 text-muted-foreground"
        >
          <Puzzle class="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p class="text-sm">
            暂无已添加的扩展
          </p>
          <p class="text-xs mt-1">
            点击上方"添加扩展"按钮添加 Chrome 扩展
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
