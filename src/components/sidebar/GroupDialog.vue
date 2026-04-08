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

const props = defineProps<{
  open: boolean
  group?: Group | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [data: { name: string; proxyId?: string }]
}>()

const proxyStore = useProxyStore()
const name = ref('')
const NO_PROXY = '__none__'
const proxyId = ref(NO_PROXY)

const proxyOptions = computed(() => proxyStore.proxies)

watch(() => props.open, (val) => {
  if (val) {
    name.value = props.group?.name ?? ''
    proxyId.value = props.group?.proxyId || NO_PROXY
  }
})

function handleSave() {
  const trimmed = name.value.trim()
  if (!trimmed) return
  emit('save', { name: trimmed, proxyId: proxyId.value === NO_PROXY ? undefined : proxyId.value })
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
        <Input v-model="name" placeholder="分组名称" autofocus @keydown.enter="handleSave" />
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
      <DialogFooter>
        <Button variant="ghost" @click="emit('update:open', false)">取消</Button>
        <Button :disabled="!name.trim()" @click="handleSave">保存</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
