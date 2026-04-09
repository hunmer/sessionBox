<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { useProxyStore } from '@/stores/proxy'
import type { Group } from '@/types'

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
]

const props = defineProps<{
  open: boolean
  group?: Group | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [data: { name: string; proxyId?: string; color?: string }]
}>()

const proxyStore = useProxyStore()
const name = ref('')
const NO_PROXY = '__none__'
const proxyId = ref(NO_PROXY)
const color = ref('')

const proxyOptions = computed(() => proxyStore.proxies)

watch(() => props.open, (val) => {
  if (val) {
    name.value = props.group?.name ?? ''
    proxyId.value = props.group?.proxyId || NO_PROXY
    color.value = props.group?.color ?? ''
  }
})

function handleSave() {
  const trimmed = name.value.trim()
  if (!trimmed) return
  emit('save', {
    name: trimmed,
    proxyId: proxyId.value === NO_PROXY ? undefined : proxyId.value,
    color: color.value || undefined
  })
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ group ? '编辑分组' : '新建分组' }}</DialogTitle>
      </DialogHeader>
      <div class="py-2 flex flex-col gap-3">
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">分组名称</label>
          <Input v-model="name" placeholder="请输入分组名称" autofocus @keydown.enter="handleSave" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">绑定代理</label>
          <Select v-model="proxyId">
            <SelectTrigger>
              <SelectValue placeholder="不绑定代理" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="NO_PROXY">不绑定代理</SelectItem>
              <SelectItem v-for="p in proxyOptions" :key="p.id" :value="p.id">
                {{ p.name }} ({{ p.type }}://{{ p.host }}:{{ p.port }})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <!-- 颜色选择 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">颜色</label>
          <div class="flex items-center gap-1.5 flex-wrap">
            <button
              v-for="c in PRESET_COLORS"
              :key="c"
              class="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
              :class="color === c ? 'border-foreground scale-110' : 'border-transparent'"
              :style="{ backgroundColor: c }"
              @click="color = color === c ? '' : c"
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" @click="emit('update:open', false)">取消</Button>
        <Button :disabled="!name.trim()" @click="handleSave">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
