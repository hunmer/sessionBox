<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDownloadStore, type Aria2Config } from '@/stores/download'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Server, RefreshCw } from 'lucide-vue-next'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = useDownloadStore()
const editConfig = ref<Partial<Aria2Config>>({})

watch(() => props.open, (val) => {
  if (val) {
    editConfig.value = store.config ? { ...store.config } : {}
  }
})

function updateField<Key extends keyof Aria2Config>(key: Key, value: Aria2Config[Key]) {
  editConfig.value[key] = value
}

async function handleClose() {
  if (Object.keys(editConfig.value).length > 0) {
    await store.saveConfig(editConfig.value)
  }
  emit('update:open', false)
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
  <Dialog :open="open" @update:open="(val) => val || handleClose()">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>下载设置</DialogTitle>
      </DialogHeader>

      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">服务器地址</label>
            <Input
              :model-value="editConfig.host"
              placeholder="localhost"
              @update:model-value="updateField('host', String($event))"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">端口</label>
            <Input
              :model-value="editConfig.port"
              type="number"
              @update:model-value="updateField('port', Number($event))"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">RPC 密钥</label>
            <Input
              :model-value="editConfig.secret"
              type="password"
              @update:model-value="updateField('secret', String($event))"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">aria2c 路径</label>
            <Input
              :model-value="editConfig.aria2Path"
              placeholder="aria2c"
              @update:model-value="updateField('aria2Path', String($event))"
            />
          </div>
          <div class="col-span-2 space-y-1">
            <label class="text-xs text-muted-foreground">下载目录（留空使用系统默认）</label>
            <Input
              :model-value="editConfig.downloadDir"
              placeholder="系统下载目录"
              @update:model-value="updateField('downloadDir', String($event))"
            />
          </div>
        </div>

        <Separator />

        <div class="flex items-center justify-between">
          <label class="text-sm">自动启动 aria2</label>
          <Switch
            :model-value="editConfig.autoStart"
            @update:model-value="updateField('autoStart', $event)"
          />
        </div>

        <Separator />

        <div class="flex items-center gap-2">
          <Button size="sm" @click="handleToggleConnection" :disabled="store.loading">
            <template v-if="store.connected">
              <Server class="w-3.5 h-3.5 mr-1" /> 停止
            </template>
            <template v-else>
              <Server class="w-3.5 h-3.5 mr-1" /> 启动
            </template>
          </Button>
          <Button size="sm" variant="outline" @click="store.checkConnection()">
            <RefreshCw class="w-3.5 h-3.5 mr-1" /> 检测连接
          </Button>
          <span class="flex-1" />
          <span class="text-xs" :class="store.connected ? 'text-green-600' : 'text-muted-foreground'">
            {{ store.connected ? '已连接' : '未连接' }}
          </span>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
