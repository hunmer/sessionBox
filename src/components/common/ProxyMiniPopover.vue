<script setup lang="ts">
import { computed } from 'vue'
import {
  Shield,
  ArrowRight,
  Check,
  Loader2,
  Globe,
  FileCode,
  Link
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useProxyStore } from '@/stores/proxy'
import { useTabStore } from '@/stores/tab'

const proxyStore = useProxyStore()
const tabStore = useTabStore()

const emit = defineEmits<{ 'open-full': [] }>()

const activeProxyInfo = computed(() => tabStore.activeProxyInfo)
const activeTabId = computed(() => tabStore.activeTabId)

/** 当前激活标签关联的代理 ID（可能是绑定链上的，也可能是临时覆盖的） */
const currentProxyId = computed(() => activeProxyInfo.value?.proxyId ?? null)

/** 是否处于临时覆盖状态 */
const isOverride = computed(() => activeProxyInfo.value?.isOverride ?? false)

/** 已启用的代理列表 */
const enabledProxies = computed(() =>
  proxyStore.proxies.filter(p => p.enabled !== false)
)

function getProxyLabel(proxy: { proxyMode?: string; host?: string; port?: number; pacUrl?: string }): string {
  if (proxy.proxyMode === 'pac_url') return proxy.pacUrl?.trim() || 'PAC URL'
  if (proxy.proxyMode === 'custom') return '自定义 PAC'
  const host = proxy.host?.trim()
  if (!host) return ''
  return proxy.port ? `${host}:${proxy.port}` : host
}

function getModeIcon(mode?: string) {
  if (mode === 'pac_url') return Link
  if (mode === 'custom') return FileCode
  return Globe
}

function getModeLabel(mode?: string) {
  if (mode === 'pac_url') return 'PAC URL'
  if (mode === 'custom') return '自定义'
  return '全局'
}

/** 正在应用的代理 ID（防止重复点击） */
const applyingProxyId = computed(() => {
  if (activeProxyInfo.value?.status === 'checking') return currentProxyId.value
  return null
})

async function handleSelectProxy(proxyId: string) {
  if (!activeTabId.value) return
  if (proxyId === currentProxyId.value) return

  await tabStore.applyProxy(activeTabId.value, proxyId)
}

async function handleResetProxy() {
  if (!activeTabId.value) return
  await tabStore.applyProxy(activeTabId.value, null)
}

function handleOpenFull() {
  emit('open-full')
}
</script>

<template>
  <div class="w-72">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between px-3 pt-2 pb-2">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Shield class="h-3.5 w-3.5 text-muted-foreground" />
        代理切换
        <Badge v-if="enabledProxies.length" variant="secondary" class="text-[10px] h-4">
          {{ enabledProxies.length }}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="h-6 gap-1 text-xs text-primary hover:text-primary"
        @click="handleOpenFull"
      >
        管理
        <ArrowRight class="h-3 w-3" />
      </Button>
    </div>
    <Separator />

    <!-- 当前状态 -->
    <div v-if="activeProxyInfo && activeProxyInfo.enabled" class="px-3 py-2">
      <div class="flex items-center gap-2">
        <Badge :variant="isOverride ? 'default' : 'secondary'" class="text-[10px] h-4 shrink-0">
          {{ isOverride ? '临时' : '绑定' }}
        </Badge>
        <span class="text-xs text-muted-foreground truncate">
          {{ activeProxyInfo.name }}
          <span v-if="activeProxyInfo.ip" class="text-[10px]">({{ activeProxyInfo.ip }})</span>
        </span>
      </div>
    </div>
    <Separator v-if="activeProxyInfo && activeProxyInfo.enabled" />

    <!-- 代理列表 -->
    <ScrollArea class="h-[320px]">
      <div v-if="enabledProxies.length === 0" class="flex items-center justify-center py-8">
        <p class="text-xs text-muted-foreground">暂无可用代理</p>
      </div>
      <div v-else class="py-1">
        <div
          v-for="proxy in enabledProxies"
          :key="proxy.id"
          class="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors"
          :class="{ 'bg-muted/30': proxy.id === currentProxyId }"
          @click="handleSelectProxy(proxy.id)"
        >
          <!-- 选中标记 -->
          <div class="shrink-0 w-5 h-5 flex items-center justify-center">
            <Loader2 v-if="applyingProxyId === proxy.id" class="h-3.5 w-3.5 animate-spin text-primary" />
            <Check v-else-if="proxy.id === currentProxyId" class="h-3.5 w-3.5 text-primary" />
          </div>

          <!-- 代理信息 -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <component :is="getModeIcon(proxy.proxyMode)" class="h-3 w-3 text-muted-foreground shrink-0" />
              <span class="text-xs truncate">{{ proxy.name }}</span>
            </div>
            <div class="text-[10px] text-muted-foreground truncate mt-0.5">
              {{ getProxyLabel(proxy) }}
            </div>
          </div>

          <!-- 模式标签 -->
          <Badge variant="outline" class="text-[10px] h-4 shrink-0">
            {{ getModeLabel(proxy.proxyMode) }}
          </Badge>
        </div>
      </div>
    </ScrollArea>

    <Separator />
    <!-- 底部操作 -->
    <div class="px-3 py-1.5 flex items-center justify-between">
      <span class="text-[10px] text-muted-foreground">
        共 {{ proxyStore.proxies.length }} 个代理
      </span>
      <Button
        v-if="isOverride"
        variant="ghost"
        size="sm"
        class="h-5 text-[10px] text-primary hover:text-primary px-1.5"
        @click="handleResetProxy"
      >
        恢复原始代理
      </Button>
    </div>
  </div>
</template>
