<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CloudCog, Loader2, PlugZap, RefreshCw } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from 'vue-sonner'
import { runSync, type SyncRunResult, type SyncTypeKey } from '@/composables/useSync'
import { useContainerStore } from '@/stores/container'
import { useProxyStore } from '@/stores/proxy'
import { useBookmarkStore } from '@/stores/bookmark'

const api = window.api
const containerStore = useContainerStore()
const proxyStore = useProxyStore()
const bookmarkStore = useBookmarkStore()

const serverUrl = ref('')
const userId = ref('')
const lastSyncAt = ref(0)
const types = ref<Record<SyncTypeKey, boolean>>({
  bookmarks: true,
  history: true,
  extensions: true,
  plugins: true,
  proxies: true,
  containers: true,
})

const testing = ref(false)
const testResult = ref<string | null>(null)
const syncing = ref(false)
const result = ref<SyncRunResult | null>(null)

const TYPE_META: Array<{ key: SyncTypeKey; label: string; desc: string }> = [
  { key: 'bookmarks', label: '书签', desc: '书签与文件夹' },
  { key: 'history', label: '历史记录', desc: '浏览历史（最多 10000 条）' },
  { key: 'extensions', label: '浏览器扩展', desc: '仅同步扩展 ID 列表，不上传扩展文件' },
  { key: 'plugins', label: '插件', desc: '仅同步插件 ID 列表，不上传插件文件' },
  { key: 'proxies', label: '代理', desc: '代理配置（含凭据，明文存储于服务器）' },
  { key: 'containers', label: '容器', desc: '容器列表及各容器 Cookies' },
]

const canSync = computed(() => !!serverUrl.value.trim() && !!userId.value.trim() && !syncing.value)
const lastSyncText = computed(() =>
  lastSyncAt.value ? new Date(lastSyncAt.value).toLocaleString() : '从未同步',
)

async function loadConfig() {
  const config = await api.sync.getConfig()
  serverUrl.value = config.serverUrl
  userId.value = config.userId
  lastSyncAt.value = config.lastSyncAt
  types.value = { ...config.types }
}

async function saveConfig() {
  const config = await api.sync.setConfig({
    serverUrl: serverUrl.value,
    userId: userId.value,
    types: { ...types.value },
    lastSyncAt: lastSyncAt.value,
  })
  lastSyncAt.value = config.lastSyncAt
}

async function handleTestConnection() {
  testing.value = true
  testResult.value = null
  try {
    const res = await api.sync.testConnection(serverUrl.value)
    if (res.ok) {
      testResult.value = `连接成功（协议版本 ${res.version}）`
    } else {
      testResult.value = `连接失败：${res.error}`
    }
  } finally {
    testing.value = false
  }
}

async function handleSync() {
  if (!canSync.value) return
  syncing.value = true
  result.value = null
  try {
    await saveConfig()
    const run = await runSync({
      serverUrl: serverUrl.value.trim(),
      userId: userId.value.trim(),
      types: { ...types.value },
      lastSyncAt: lastSyncAt.value,
    })
    result.value = run
    // 同步可能更新了本地数据，刷新相关 store
    await Promise.all([
      containerStore.loadContainers(),
      proxyStore.loadProxies(),
      bookmarkStore.loadFolders(),
      bookmarkStore.loadBookmarks(),
    ])
    await loadConfig()
    if (run.ok) {
      toast.success('数据同步完成')
    } else {
      toast.error('部分数据同步失败，请查看结果')
    }
  } catch (error) {
    toast.error('同步失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    syncing.value = false
  }
}

onMounted(loadConfig)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-2">
      <CloudCog class="w-5 h-5" />
      <h3 class="text-lg font-semibold">
        数据同步
      </h3>
    </div>

    <p class="text-sm text-muted-foreground">
      绑定自建同步服务器后，可在不同设备间同步书签、历史、扩展/插件 ID、代理和容器（含 Cookies）。
      数据明文存储在服务器上，请仅在可信网络中使用。
    </p>

    <!-- 服务器绑定 -->
    <div class="space-y-4">
      <div class="space-y-1.5">
        <label class="text-sm font-medium">后端地址</label>
        <div class="flex gap-2">
          <Input
            v-model="serverUrl"
            placeholder="如 http://192.168.1.5:37400"
            @change="saveConfig"
          />
          <Button
            variant="outline"
            :disabled="testing || !serverUrl.trim()"
            @click="handleTestConnection"
          >
            <Loader2 v-if="testing" class="w-4 h-4 animate-spin" />
            <PlugZap v-else class="w-4 h-4" />
            测试连接
          </Button>
        </div>
        <p
          v-if="testResult"
          class="text-xs"
          :class="testResult.startsWith('连接成功') ? 'text-green-600' : 'text-red-500'"
        >
          {{ testResult }}
        </p>
      </div>

      <div class="space-y-1.5">
        <label class="text-sm font-medium">用户标识符</label>
        <Input
          v-model="userId"
          placeholder="如 my-laptop-sync（仅字母、数字、_ 、-）"
          @change="saveConfig"
        />
        <p class="text-xs text-muted-foreground">
          免密设计：同一标识符的设备互相同步，请保证标识符足够独特以防被他人猜到。
        </p>
      </div>
    </div>

    <!-- 同步项 -->
    <div class="space-y-3">
      <div class="text-sm font-medium">
        同步内容
      </div>
      <div
        v-for="meta in TYPE_META"
        :key="meta.key"
        class="flex items-center justify-between gap-4 rounded-md border p-3"
      >
        <div>
          <div class="text-sm">
            {{ meta.label }}
          </div>
          <div class="text-xs text-muted-foreground">
            {{ meta.desc }}
          </div>
        </div>
        <Switch
          :model-value="types[meta.key]"
          @update:model-value="(v: boolean) => { types[meta.key] = v; saveConfig() }"
        />
      </div>
    </div>

    <!-- 同步操作 -->
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <Button :disabled="!canSync" @click="handleSync">
          <Loader2 v-if="syncing" class="w-4 h-4 animate-spin" />
          <RefreshCw v-else class="w-4 h-4" />
          立即同步
        </Button>
        <span class="text-xs text-muted-foreground">上次同步：{{ lastSyncText }}</span>
      </div>

      <div
        v-if="result"
        class="space-y-1.5 rounded-md border p-3"
      >
        <div
          v-for="item in result.results"
          :key="item.type"
          class="flex items-start gap-2 text-xs"
        >
          <span
            class="mt-0.5 w-2 h-2 rounded-full shrink-0"
            :class="item.status === 'ok' ? 'bg-green-500' : 'bg-red-500'"
          />
          <span>{{ TYPE_META.find((m) => m.key === item.type)?.label ?? item.type }}：{{ item.message }}</span>
        </div>
        <div
          v-if="!result.results.length"
          class="text-xs text-muted-foreground"
        >
          未勾选任何同步内容
        </div>
      </div>
    </div>

    <p class="text-xs text-muted-foreground">
      后端服务启动方式：<code>node server/sync-server.mjs</code>（默认端口 37400，数据目录
      <code>server/data</code>）。合并策略：同 ID 数据双向合并，冲突时以较新的一次同步为准；暂不支持删除同步。
    </p>
  </div>
</template>
