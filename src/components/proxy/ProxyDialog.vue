<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Loader2, CheckCircle2, XCircle, Plus, Pencil, Trash2, Plug } from 'lucide-vue-next'
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
import { useProxyStore } from '@/stores/proxy'
import type { Proxy } from '@/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const proxyStore = useProxyStore()

// ====== 编辑状态 ======
const editing = ref(false)
const editingId = ref<string | null>(null)

const formName = ref('')
const formType = ref<'socks5' | 'http' | 'https'>('socks5')
const formHost = ref('')
const formPort = ref(1080)
const formUser = ref('')
const formPass = ref('')

// 测试状态
const testing = ref(false)
const testResult = ref<{ ok: boolean; ip?: string; error?: string } | null>(null)

// 删除确认
const deleteTarget = ref<Proxy | null>(null)

const proxyTypes: { value: 'socks5' | 'http' | 'https'; label: string }[] = [
  { value: 'socks5', label: 'SOCKS5' },
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' }
]

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
  formType.value = 'socks5'
  formHost.value = ''
  formPort.value = 1080
  formUser.value = ''
  formPass.value = ''
  testResult.value = null
}

function startEdit(proxy: Proxy) {
  editing.value = true
  editingId.value = proxy.id
  formName.value = proxy.name
  formType.value = proxy.type
  formHost.value = proxy.host
  formPort.value = proxy.port
  formUser.value = proxy.username ?? ''
  formPass.value = proxy.password ?? ''
  testResult.value = null
}

function startNew() {
  resetForm()
  editing.value = true
}

async function handleSave() {
  const name = formName.value.trim()
  if (!name || !formHost.value.trim()) return

  const data = {
    name,
    type: formType.value,
    host: formHost.value.trim(),
    port: formPort.value,
    username: formUser.value.trim() || undefined,
    password: formPass.value.trim() || undefined
  }

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

  // 如果正在编辑已有代理，直接测试 ID；否则用配置测试
  if (editingId.value) {
    testResult.value = await proxyStore.testProxy(editingId.value)
  } else {
    testResult.value = await window.api.proxy.testConfig({
      name: formName.value,
      type: formType.value,
      host: formHost.value.trim(),
      port: formPort.value,
      username: formUser.value.trim() || undefined,
      password: formPass.value.trim() || undefined
    })
  }
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
        <!-- 代理列表 -->
        <ScrollArea class="flex-1 min-h-0 max-h-[200px]">
          <div v-if="proxyStore.proxies.length === 0" class="text-center py-6 text-muted-foreground text-sm">
            暂无代理配置
          </div>
          <div v-else class="flex flex-col gap-1 pr-2">
            <div
              v-for="proxy in proxyStore.proxies"
              :key="proxy.id"
              class="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 group"
              :class="editingId === proxy.id ? 'bg-muted' : ''"
            >
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ proxy.name }}</div>
                <div class="text-xs text-muted-foreground">
                  {{ proxy.type }}://{{ proxy.host }}:{{ proxy.port }}
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

        <!-- 分割线 + 新建按钮 -->
        <div v-if="!editing" class="flex justify-center">
          <Button variant="outline" size="sm" @click="startNew">
            <Plus class="w-3.5 h-3.5 mr-1" />新建代理
          </Button>
        </div>

        <!-- 编辑表单 -->
        <div v-if="editing" class="border rounded-md p-3 flex flex-col gap-2.5 bg-muted/30">
          <div class="flex gap-2">
            <Input v-model="formName" placeholder="代理名称" class="flex-1" />
            <Select v-model="formType">
              <SelectTrigger class="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="t in proxyTypes" :key="t.value" :value="t.value">
                  {{ t.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex gap-2">
            <Input v-model="formHost" placeholder="主机地址" class="flex-1" />
            <Input v-model.number="formPort" type="number" placeholder="端口" class="w-24" />
          </div>
          <div class="flex gap-2">
            <Input v-model="formUser" placeholder="用户名（可选）" class="flex-1" />
            <Input v-model="formPass" type="password" placeholder="密码（可选）" class="flex-1" />
          </div>

          <!-- 测试结果 -->
          <div v-if="testResult" class="flex items-center gap-2 text-xs">
            <CheckCircle2 v-if="testResult.ok" class="w-4 h-4 text-green-500" />
            <XCircle v-else class="w-4 h-4 text-destructive" />
            <span v-if="testResult.ok" class="text-green-500">连接成功，IP: {{ testResult.ip }}</span>
            <span v-else class="text-destructive">{{ testResult.error }}</span>
          </div>

          <div class="flex justify-between pt-1">
            <Button variant="outline" size="sm" :disabled="testing" @click="handleTest">
              <Loader2 v-if="testing" class="w-3.5 h-3.5 mr-1 animate-spin" />
              测试连接
            </Button>
            <div class="flex gap-2">
              <Button variant="ghost" size="sm" @click="resetForm">取消</Button>
              <Button size="sm" :disabled="!formName.trim() || !formHost.trim()" @click="handleSave">保存</Button>
            </div>
          </div>
        </div>
      </div>

      <!-- 删除确认 -->
      <AlertDialog :open="!!deleteTarget" @update:open="deleteTarget = null">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除代理「{{ deleteTarget?.name }}」？绑定此代理的账号和分组将自动解除绑定。
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
