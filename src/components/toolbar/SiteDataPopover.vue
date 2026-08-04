<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Info, Cookie, Database, HardDrive, Trash2, RefreshCw } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useTabStore } from '@/stores/tab'
import type { SiteDataInfo } from '@/types'

const emit = defineEmits<{ cleared: [] }>()

const tabStore = useTabStore()
const api = window.api

const info = ref<SiteDataInfo | null>(null)
const loading = ref(false)
const clearing = ref(false)
const confirmOpen = ref(false)

/** 当前 tab 是否为可清理的有效网站 */
const hasSite = computed(() => {
  const url = tabStore.activeTab?.url
  return !!url && !url.startsWith('sessionbox://') && !!tabStore.activeTabId
})

const hostname = computed(() => info.value?.hostname || '当前站点')

/** 总占用占配额的百分比（用于进度条） */
const usagePercent = computed(() => {
  const { usageBytes, quotaBytes } = info.value ?? {}
  if (!quotaBytes) return 0
  return Math.min(100, Math.round((usageBytes ?? 0) / quotaBytes * 100))
})

/** 字节格式化 */
function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let val = bytes
  let idx = 0
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024
    idx++
  }
  // B 显示整数，其余保留 1 位小数
  return idx === 0 ? `${val} ${units[idx]}` : `${val.toFixed(1)} ${units[idx]}`
}

async function loadInfo() {
  if (!hasSite.value || !tabStore.activeTabId) {
    info.value = null
    return
  }
  loading.value = true
  try {
    info.value = await api.siteData.getInfo(tabStore.activeTabId)
  } catch {
    info.value = null
  } finally {
    loading.value = false
  }
}

async function handleClear() {
  if (!tabStore.activeTabId) return
  clearing.value = true
  try {
    const res = await api.siteData.clear(tabStore.activeTabId)
    if (res.success) {
      toast.success('已清理当前站点数据')
      emit('cleared')
      // 刷新由主进程完成，这里仅刷新展示数据
      setTimeout(loadInfo, 500)
    } else {
      toast.error('清理失败')
    }
  } catch {
    toast.error('清理失败')
  } finally {
    clearing.value = false
    confirmOpen.value = false
  }
}

// popover 打开时（组件挂载即视为打开）加载一次
watch(() => tabStore.activeTabId, loadInfo, { immediate: true })
</script>

<template>
  <div>
    <!-- 标题栏 -->
    <div class="flex items-center gap-2 px-3 pt-2 pb-2">
      <Info class="h-3.5 w-3.5 text-muted-foreground" />
      <span class="text-sm font-medium truncate max-w-[220px]">
        {{ hostname }}
      </span>
    </div>
    <Separator />

    <!-- 无站点 -->
    <div
      v-if="!hasSite"
      class="flex items-center justify-center py-8"
    >
      <p class="text-xs text-muted-foreground">
        请先打开一个网站
      </p>
    </div>

    <!-- 信息列表 -->
    <div
      v-else
      class="p-3 flex flex-col gap-2.5 min-w-[260px]"
    >
      <!-- Cookie 数量 -->
      <div class="flex items-center gap-2.5">
        <Cookie class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span class="text-xs text-muted-foreground flex-1">Cookie 数量</span>
        <span class="text-xs font-mono">{{ info?.cookieCount ?? 0 }}</span>
      </div>

      <!-- localStorage 大小 -->
      <div class="flex items-center gap-2.5">
        <Database class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span class="text-xs text-muted-foreground flex-1">localStorage</span>
        <span class="text-xs font-mono">{{ formatBytes(info?.storageBytes) }}</span>
      </div>

      <!-- 总占用（含 IndexedDB / Cache / SW） -->
      <div class="flex items-center gap-2.5">
        <HardDrive class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span class="text-xs text-muted-foreground flex-1">总占用</span>
        <span class="text-xs font-mono">{{ formatBytes(info?.usageBytes) }}</span>
      </div>

      <!-- 配额进度条 -->
      <div
        v-if="info?.quotaBytes"
        class="flex flex-col gap-1 pt-0.5"
      >
        <Progress
          :model-value="usagePercent"
          class="h-1.5"
        />
        <div class="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>配额使用 {{ usagePercent }}%</span>
          <span>{{ formatBytes(info?.quotaBytes) }}</span>
        </div>
      </div>
    </div>

    <Separator />

    <!-- 底部操作 -->
    <div class="px-3 py-1.5">
      <Button
        variant="ghost"
        size="sm"
        class="w-full h-7 gap-1 text-xs"
        :disabled="!hasSite || loading"
        @click="loadInfo"
      >
        <RefreshCw
          class="h-3 w-3"
          :class="loading ? 'animate-spin' : ''"
        />
        刷新
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="w-full h-7 gap-1 text-xs text-destructive hover:text-destructive"
        :disabled="!hasSite || clearing"
        @click="confirmOpen = true"
      >
        <Trash2 class="h-3 w-3" />
        一键清理当前站点
      </Button>
      <p class="text-[10px] text-muted-foreground text-center mt-1">
        清理 Cookie / localStorage / IndexedDB / Cache
      </p>
    </div>

    <!-- 清理确认 -->
    <AlertDialog v-model:open="confirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>清理当前站点数据？</AlertDialogTitle>
          <AlertDialogDescription>
            将清除 {{ hostname }} 的 Cookie、localStorage、IndexedDB、Cache 等数据，清理后页面会自动刷新。此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="clearing">取消</AlertDialogCancel>
          <AlertDialogAction
            :disabled="clearing"
            @click="handleClear"
          >
            {{ clearing ? '清理中...' : '确认清理' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
