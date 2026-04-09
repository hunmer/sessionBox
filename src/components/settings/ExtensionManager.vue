<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Puzzle, Trash2, Plus, Check, X, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useExtensionStore } from '@/stores/extension'
import { useAccountStore } from '@/stores/account'
import { useTabStore } from '@/stores/tab'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'

const extensionStore = useExtensionStore()
const accountStore = useAccountStore()
const tabStore = useTabStore()

const isOpen = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)

// 当前选中的账号
const currentAccountId = ref<string | null>(null)

/**
 * 初始化
 */
onMounted(async () => {
  await extensionStore.init()
})

/**
 * 打开对话框
 */
function open() {
  isOpen.value = true
  error.value = null
  // 默认选中当前标签页对应的账号
  currentAccountId.value = tabStore.activeTab?.accountId ?? null
}

/**
 * 关闭对话框
 */
function close() {
  isOpen.value = false
}

/**
 * 添加扩展
 */
async function addExtension() {
  isLoading.value = true
  error.value = null
  try {
    const extension = await extensionStore.selectExtension()
    if (extension && currentAccountId.value) {
      // 自动加载到当前账号
      await extensionStore.loadExtension(currentAccountId.value, extension.id)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '添加扩展失败'
  } finally {
    isLoading.value = false
  }
}

/**
 * 为账号加载扩展
 */
async function loadExtensionToAccount(accountId: string | null, extensionId: string) {
  if (!accountId) {
    error.value = '请先选择一个账号'
    return
  }

  isLoading.value = true
  error.value = null
  try {
    await extensionStore.loadExtension(accountId, extensionId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载扩展失败'
  } finally {
    isLoading.value = false
  }
}

/**
 * 从账号卸载扩展
 */
async function unloadExtensionFromAccount(accountId: string, extensionId: string) {
  isLoading.value = true
  error.value = null
  try {
    await extensionStore.unloadExtension(accountId, extensionId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '卸载扩展失败'
  } finally {
    isLoading.value = false
  }
}

/**
 * 删除扩展
 */
async function deleteExtensionItem(extensionId: string) {
  if (!confirm('确定要删除此扩展吗？')) return

  isLoading.value = true
  error.value = null
  try {
    await extensionStore.deleteExtension(extensionId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除扩展失败'
  } finally {
    isLoading.value = false
  }
}

/**
 * 判断扩展是否已加载到指定账号
 */
function isLoaded(accountId: string, extensionId: string): boolean {
  return extensionStore.isExtensionLoaded(accountId, extensionId)
}

// 暴露 open 方法
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
          添加和管理 Chrome 扩展，每个账号可以独立加载不同的扩展
        </DialogDescription>
      </DialogHeader>

      <div class="flex-1 overflow-auto space-y-4">
        <!-- 错误提示 -->
        <div v-if="error" class="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded">
          {{ error }}
        </div>

        <!-- 添加扩展按钮 -->
        <Button variant="outline" class="w-full" @click="addExtension" :disabled="isLoading">
          <Loader2 v-if="isLoading" class="w-4 h-4 mr-2 animate-spin" />
          <Plus v-else class="w-4 h-4 mr-2" />
          添加扩展
        </Button>

        <!-- 选择要管理的账号 -->
        <div class="space-y-2">
          <label class="text-sm font-medium">选择账号</label>
          <select
            v-model="currentAccountId"
            class="w-full h-9 px-3 text-sm border border-input bg-background rounded-md"
          >
            <option :value="null">-- 选择账号 --</option>
            <option v-for="account in accountStore.accounts" :key="account.id" :value="account.id">
              {{ account.name }}
            </option>
          </select>
        </div>

        <!-- 扩展列表 -->
        <div v-if="extensionStore.extensions.length > 0" class="space-y-2">
          <label class="text-sm font-medium">已添加的扩展</label>
          <div class="border rounded-md divide-y">
            <div
              v-for="ext in extensionStore.extensions"
              :key="ext.id"
              class="flex items-center justify-between p-3"
            >
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-secondary rounded flex items-center justify-center">
                  <Puzzle class="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <div class="text-sm font-medium">{{ ext.name }}</div>
                  <div class="text-xs text-muted-foreground truncate max-w-[200px]">
                    {{ ext.path }}
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <!-- 加载状态指示 -->
                <div v-if="currentAccountId" class="flex items-center gap-1 text-xs">
                  <Check v-if="isLoaded(currentAccountId, ext.id)" class="w-3 h-3 text-green-500" />
                  <X v-else class="w-3 h-3 text-muted-foreground" />
                  <span>{{ isLoaded(currentAccountId, ext.id) ? '已加载' : '未加载' }}</span>
                </div>

                <!-- 加载/卸载按钮 -->
                <Button
                  v-if="currentAccountId"
                  variant="ghost"
                  size="sm"
                  @click="isLoaded(currentAccountId, ext.id)
                    ? unloadExtensionFromAccount(currentAccountId!, ext.id)
                    : loadExtensionToAccount(currentAccountId!, ext.id)"
                  :disabled="isLoading"
                >
                  {{ isLoaded(currentAccountId, ext.id) ? '卸载' : '加载' }}
                </Button>

                <!-- 删除按钮 -->
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

        <!-- 空状态 -->
        <div v-else class="text-center py-8 text-muted-foreground">
          <Puzzle class="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p class="text-sm">暂无已添加的扩展</p>
          <p class="text-xs mt-1">点击上方按钮添加 Chrome 扩展</p>
        </div>
      </div>

      <!-- 底部关闭按钮 -->
      <div class="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" @click="close">关闭</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
