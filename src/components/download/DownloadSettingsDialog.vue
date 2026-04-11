<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDownloadStore } from '@/stores/download'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Server, RefreshCw } from 'lucide-vue-next'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = useDownloadStore()
const editConfig = ref<Record<string, any>>({})

watch(() => props.open, (val) => {
  if (val) {
    editConfig.value = { ...store.config }
  }
})

function handleClose() {
  store.saveConfig(editConfig.value)
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
            <Input v-model="editConfig.host" placeholder="localhost" />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">端口</label>
            <Input v-model.number="editConfig.port" type="number" />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">RPC 密钥</label>
            <Input v-model="editConfig.secret" type="password" />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">aria2c 路径</label>
            <Input v-model="editConfig.aria2Path" placeholder="aria2c" />
          </div>
          <div class="col-span-2 space-y-1">
            <label class="text-xs text-muted-foreground">下载目录（留空使用系统默认）</label>
            <Input v-model="editConfig.downloadDir" placeholder="系统下载目录" />
          </div>
        </div>

        <Separator />

        <div class="flex items-center justify-between">
          <label class="text-sm">自动启动 aria2</label>
          <Switch v-model="editConfig.autoStart" />
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
