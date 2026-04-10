<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Loader2, CheckCircle2, XCircle, Plus, Pencil, Trash2, Plug, Ban } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { useProxyStore } from '@/stores/proxy'
import type { Proxy } from '@/types'

type ProxyMode = NonNullable<Proxy['proxyMode']>
type ProxyType = NonNullable<Proxy['type']>

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const proxyStore = useProxyStore()

const editing = ref(false)
const editingId = ref<string | null>(null)

const formName = ref('')
const formEnabled = ref(true)
const formMode = ref<ProxyMode>('global')
const formType = ref<ProxyType>('socks5')
const formHost = ref('')
const formPort = ref(1080)
const formUser = ref('')
const formPass = ref('')
const formPacScript = ref('')
const formPacUrl = ref('')

const testing = ref(false)
const testResult = ref<{ ok: boolean; ip?: string; error?: string } | null>(null)
const deleteTarget = ref<Proxy | null>(null)

const proxyModes: { value: ProxyMode; label: string }[] = [
  { value: 'global', label: '全局' },
  { value: 'custom', label: '自定义' },
  { value: 'pac_url', label: 'PAC 地址' }
]

const proxyTypes: { value: ProxyType; label: string }[] = [
  { value: 'socks5', label: 'SOCKS5' },
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' }
]

const isGlobalMode = computed(() => formMode.value === 'global')
const isCustomMode = computed(() => formMode.value === 'custom')
const canSave = computed(() => {
  if (!formName.value.trim()) return false

  if (isGlobalMode.value) {
    return !!formHost.value.trim() && Number.isFinite(formPort.value) && formPort.value > 0
  }

  if (isCustomMode.value) {
    return !!formPacScript.value.trim()
  }

  return !!formPacUrl.value.trim()
})

watch(() => props.open, (val) => {
  if (val) {
    resetForm()
    testResult.value = null
  }
})

function resetForm() {
  editing.value = false
  editingId.value = null
  formName.value = ''
  formEnabled.value = true
  formMode.value = 'global'
  formType.value = 'socks5'
  formHost.value = ''
  formPort.value = 1080
  formUser.value = ''
  formPass.value = ''
  formPacScript.value = ''
  formPacUrl.value = ''
  testing.value = false
  testResult.value = null
}

function getProxySummary(proxy: Proxy): string {
  const proxyMode = proxy.proxyMode ?? 'global'

  if (proxyMode === 'custom') {
    return '自定义 PAC 脚本'
  }

  if (proxyMode === 'pac_url') {
    return proxy.pacUrl?.trim() || 'PAC URL 未设置'
  }

  return `${proxy.type ?? 'socks5'}://${proxy.host ?? ''}:${proxy.port ?? ''}`
}

function startEdit(proxy: Proxy) {
  editing.value = true
  editingId.value = proxy.id
  formName.value = proxy.name
  formEnabled.value = proxy.enabled !== false
  formMode.value = proxy.proxyMode ?? 'global'
  formType.value = proxy.type ?? 'socks5'
  formHost.value = proxy.host ?? ''
  formPort.value = proxy.port ?? 1080
  formUser.value = proxy.username ?? ''
  formPass.value = proxy.password ?? ''
  formPacScript.value = proxy.pacScript ?? ''
  formPacUrl.value = proxy.pacUrl ?? ''
  testResult.value = null
}

function startNew() {
  resetForm()
  editing.value = true
}

function buildPayload(): Omit<Proxy, 'id'> {
  const base: Omit<Proxy, 'id'> = {
    name: formName.value.trim(),
    enabled: formEnabled.value,
    proxyMode: formMode.value
  }

  if (isGlobalMode.value) {
    return {
      ...base,
      type: formType.value,
      host: formHost.value.trim(),
      port: formPort.value,
      username: formUser.value.trim() || undefined,
      password: formPass.value.trim() || undefined,
      pacScript: undefined,
      pacUrl: undefined
    }
  }

  if (isCustomMode.value) {
    return {
      ...base,
      pacScript: formPacScript.value.trim(),
      type: undefined,
      host: undefined,
      port: undefined,
      username: undefined,
      password: undefined,
      pacUrl: undefined
    }
  }

  return {
    ...base,
    pacUrl: formPacUrl.value.trim(),
    type: undefined,
    host: undefined,
    port: undefined,
    username: undefined,
    password: undefined,
    pacScript: undefined
  }
}

async function handleSave() {
  if (!canSave.value) return

  const data = buildPayload()

  if (editingId.value) {
    await proxyStore.updateProxy(editingId.value, data)
  } else {
    await proxyStore.createProxy(data)
  }

  resetForm()
}

async function handleTest() {
  testing.value = true
  testResult.value = null

  testResult.value = await window.api.proxy.testConfig(buildPayload())
  testing.value = false
}

async function handleDelete() {
  if (!deleteTarget.value) return
  await proxyStore.deleteProxy(deleteTarget.value.id)
  if (editingId.value === deleteTarget.value.id) resetForm()
  deleteTarget.value = null
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg max-h-[85vh] flex flex-col">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Plug class="w-4 h-4" />
          代理管理
        </DialogTitle>
      </DialogHeader>

      <div class="flex-1 min-h-0 flex flex-col gap-3">
        <ScrollArea class="flex-1 min-h-0 max-h-[200px]">
          <div v-if="proxyStore.proxies.length === 0" class="text-center py-6 text-muted-foreground text-sm">
            暂无代理配置
          </div>
          <div v-else class="flex flex-col gap-1 pr-2">
            <div
              v-for="proxy in proxyStore.proxies"
              :key="proxy.id"
              class="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 group"
              :class="[editingId === proxy.id ? 'bg-muted' : '', proxy.enabled === false ? 'opacity-60' : '']"
            >
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate flex items-center gap-1.5">
                  {{ proxy.name }}
                  <Ban v-if="proxy.enabled === false" class="w-3 h-3 text-destructive" />
                </div>
                <div class="text-xs text-muted-foreground truncate">
                  {{ getProxySummary(proxy) }}
                </div>
              </div>
              <Button variant="ghost" size="icon" class="h-7 w-7 opacity-0 group-hover:opacity-100" @click="startEdit(proxy)">
                <Pencil class="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" class="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive" @click="deleteTarget = proxy">
                <Trash2 class="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </ScrollArea>

        <div v-if="!editing" class="flex justify-center">
          <Button variant="outline" size="sm" @click="startNew">
            <Plus class="w-3.5 h-3.5 mr-1" />新建代理
          </Button>
        </div>

        <div v-if="editing" class="border rounded-md p-3 flex flex-col gap-3 bg-muted/30">
          <Input v-model="formName" placeholder="代理名称" />

          <div class="flex items-center justify-between">
            <label class="text-sm text-muted-foreground">启用代理</label>
            <Switch v-model:model-value="formEnabled" />
          </div>

          <div class="grid grid-cols-2 gap-2">
            <Select v-model="formMode">
              <SelectTrigger>
                <SelectValue placeholder="代理模式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="mode in proxyModes" :key="mode.value" :value="mode.value">
                  {{ mode.label }}
                </SelectItem>
              </SelectContent>
            </Select>

            <Select v-if="isGlobalMode" v-model="formType">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="type in proxyTypes" :key="type.value" :value="type.value">
                  {{ type.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <div v-else class="h-9 rounded-md border border-dashed border-muted-foreground/30 px-3 text-sm text-muted-foreground flex items-center">
              {{ isCustomMode ? '内联 PAC 脚本' : '远程 PAC 文件' }}
            </div>
          </div>

          <template v-if="isGlobalMode">
            <div class="flex gap-2">
              <Input v-model="formHost" placeholder="主机地址" class="flex-1" />
              <Input v-model.number="formPort" type="number" placeholder="端口" class="w-24" />
            </div>
            <div class="flex gap-2">
              <Input v-model="formUser" placeholder="用户名（可选）" class="flex-1" />
              <Input v-model="formPass" type="password" placeholder="密码（可选）" class="flex-1" />
            </div>
          </template>

          <template v-else-if="isCustomMode">
            <textarea
              v-model="formPacScript"
              rows="8"
              placeholder="输入 FindProxyForURL 内容，支持直接填写完整函数或函数体。"
              class="min-h-[180px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </template>

          <template v-else>
            <Input v-model="formPacUrl" placeholder="PAC URL，例如 https://example.com/proxy.pac" />
          </template>

          <div v-if="testResult" class="flex items-center gap-2 text-xs">
            <CheckCircle2 v-if="testResult.ok" class="w-4 h-4 text-green-500" />
            <XCircle v-else class="w-4 h-4 text-destructive" />
            <span v-if="testResult.ok" class="text-green-500">连接成功，IP: {{ testResult.ip }}</span>
            <span v-else class="text-destructive">{{ testResult.error }}</span>
          </div>

          <div class="flex justify-between pt-1">
            <Button variant="outline" size="sm" :disabled="testing || !canSave" @click="handleTest">
              <Loader2 v-if="testing" class="w-3.5 h-3.5 mr-1 animate-spin" />
              测试连接
            </Button>
            <div class="flex gap-2">
              <Button variant="ghost" size="sm" @click="resetForm">取消</Button>
              <Button size="sm" :disabled="!canSave" @click="handleSave">保存</Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog :open="!!deleteTarget" @update:open="deleteTarget = null">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除代理“{{ deleteTarget?.name }}”？绑定该代理的账号和分组会自动解除绑定。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction class="bg-destructive text-destructive-foreground hover:bg-destructive/90" @click="handleDelete">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContent>
  </Dialog>
</template>
