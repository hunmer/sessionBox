<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { KeyRound, Server } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { toast } from 'vue-sonner'

const port = ref(19100)
const token = ref('')
async function load() { const config = await window.api.settings.getSessionApi(); port.value = config.port; token.value = config.token }
async function save() { await window.api.settings.setSessionApi({ port: port.value, token: token.value }); toast.success('SessionBox 服务配置已保存，重启服务后生效') }
onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-2"><Server class="w-5 h-5" /><h3 class="text-lg font-semibold">SessionBox HTTP 服务</h3></div>
    <p class="text-sm text-muted-foreground">供插件按页面 ID 获取 Cookie、打开页面和执行自动化操作。</p>
    <div class="space-y-4">
      <div class="space-y-1.5"><label class="text-sm font-medium">监听端口</label><Input v-model.number="port" type="number" min="1" max="65535" @change="save" /></div>
      <div class="space-y-1.5"><label class="text-sm font-medium flex items-center gap-2"><KeyRound class="w-4 h-4" />鉴权令牌</label><Input v-model="token" type="password" placeholder="留空表示不启用鉴权" @change="save" /></div>
    </div>
  </div>
</template>
