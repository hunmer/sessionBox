<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDownloadStore } from '@/stores/download'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Server, RefreshCw } from 'lucide-vue-next'

const store = useDownloadStore()
const editConfig = ref<Record<string, any>>({})

watch(
  () => store.config,
  (config) => {
    if (config) {
      editConfig.value = { ...config }
    }
  },
  { immediate: true }
)

function saveField(key: string, value: unknown) {
  editConfig.value[key] = value
  store.saveConfig({ [key]: value })
}

async function handleToggleConnection() {
  if (store.connected) {
    await store.stop()
  } else {
    await store.start()
  }
}
</script>

<template>
  <div
    v-if="editConfig"
    class="space-y-6"
  >
    <!-- Aria2 连接 -->
    <section>
      <h3 class="text-sm font-medium mb-3">
        Aria2 连接
      </h3>
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">服务器地址</label>
            <Input
              :model-value="editConfig.host"
              placeholder="localhost"
              @update:model-value="saveField('host', $event)"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">端口</label>
            <Input
              :model-value="editConfig.port"
              type="number"
              @update:model-value="saveField('port', Number($event))"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">RPC 密钥</label>
            <Input
              :model-value="editConfig.secret"
              type="password"
              @update:model-value="saveField('secret', $event)"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">aria2c 路径</label>
            <Input
              :model-value="editConfig.aria2Path"
              placeholder="aria2c"
              @update:model-value="saveField('aria2Path', $event)"
            />
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Button
            size="sm"
            :disabled="store.loading"
            @click="handleToggleConnection"
          >
            <template v-if="store.connected">
              <Server class="w-3.5 h-3.5 mr-1" /> 停止
            </template>
            <template v-else>
              <Server class="w-3.5 h-3.5 mr-1" /> 启动
            </template>
          </Button>
          <Button
            size="sm"
            variant="outline"
            @click="store.checkConnection()"
          >
            <RefreshCw class="w-3.5 h-3.5 mr-1" /> 检测连接
          </Button>
          <span class="flex-1" />
          <span
            class="text-xs"
            :class="store.connected ? 'text-green-600' : 'text-muted-foreground'"
          >
            {{ store.connected ? '已连接' : '未连接' }}
          </span>
        </div>

        <div class="flex items-center justify-between">
          <label class="text-xs text-muted-foreground">自动启动 aria2</label>
          <Switch
            :model-value="editConfig.autoStart"
            @update:model-value="saveField('autoStart', $event)"
          />
        </div>
      </div>
    </section>

    <Separator />

    <!-- 下载路径 -->
    <section>
      <h3 class="text-sm font-medium mb-3">
        下载路径
      </h3>
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label class="text-xs text-muted-foreground">总是询问下载位置</label>
          <Switch
            :model-value="editConfig.alwaysAsk"
            @update:model-value="saveField('alwaysAsk', $event)"
          />
        </div>
        <div class="space-y-1">
          <label class="text-xs text-muted-foreground">下载目录（留空使用系统默认）</label>
          <Input
            :model-value="editConfig.downloadDir"
            placeholder="系统下载目录"
            :disabled="editConfig.alwaysAsk"
            @update:model-value="saveField('downloadDir', $event)"
          />
        </div>
      </div>
    </section>

    <Separator />

    <!-- 下载通知 -->
    <section>
      <h3 class="text-sm font-medium mb-3">
        下载通知
      </h3>
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label class="text-xs text-muted-foreground">开始下载时通知</label>
          <Switch
            :model-value="editConfig.notifyOnStart"
            @update:model-value="saveField('notifyOnStart', $event)"
          />
        </div>
        <div class="flex items-center justify-between">
          <label class="text-xs text-muted-foreground">下载成功时通知</label>
          <Switch
            :model-value="editConfig.notifyOnSuccess"
            @update:model-value="saveField('notifyOnSuccess', $event)"
          />
        </div>
        <div class="flex items-center justify-between">
          <label class="text-xs text-muted-foreground">下载失败时通知</label>
          <Switch
            :model-value="editConfig.notifyOnFailure"
            @update:model-value="saveField('notifyOnFailure', $event)"
          />
        </div>
      </div>
    </section>
  </div>
</template>
