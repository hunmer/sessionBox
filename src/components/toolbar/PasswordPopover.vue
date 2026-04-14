<script setup lang="ts">
import { ref, computed } from 'vue'
import { KeyRound, Plus, Eye, EyeOff, Copy, ArrowRight, Trash2, Pencil, Check, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { useTabStore } from '@/stores/tab'
import { usePasswordStore } from '@/stores/password'
import type { PasswordEntry, PasswordField } from '@/types'

const tabStore = useTabStore()
const passwordStore = usePasswordStore()

const emit = defineEmits<{ 'open-full': [] }>()

/** 从当前 tab URL 提取站点 origin */
const siteOrigin = computed(() => {
  const url = tabStore.activeTab?.url
  if (!url || url.startsWith('sessionbox://')) return ''
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
})

/** 当前站点的条目列表 */
const siteEntries = computed(() => {
  if (!siteOrigin.value) return []
  return passwordStore.getEntriesBySite(siteOrigin.value)
})

/** 每个条目的密码可见状态 */
const visibleFields = ref<Set<string>>(new Set())

function toggleFieldVisibility(fieldId: string) {
  const next = new Set(visibleFields.value)
  if (next.has(fieldId)) next.delete(fieldId)
  else next.add(fieldId)
  visibleFields.value = next
}

async function copyToClipboard(value: string) {
  await navigator.clipboard.writeText(value)
}

/** 快速添加条目 */
const isAdding = ref(false)
const newName = ref('')

function startAdd() {
  newName.value = ''
  isAdding.value = true
}

function cancelAdd() {
  isAdding.value = false
  newName.value = ''
}

async function confirmAdd() {
  if (!siteOrigin.value) return
  const name = newName.value.trim() || '新备注'
  const now = Date.now()
  const fieldId = () => crypto.randomUUID()

  await passwordStore.createEntry({
    siteOrigin: siteOrigin.value,
    siteName: new URL(siteOrigin.value).hostname,
    name,
    fields: [
      { id: fieldId(), name: '账号', type: 'text', value: '' },
      { id: fieldId(), name: '密码', type: 'text', value: '', protected: true }
    ],
    order: passwordStore.entries.filter((e) => e.siteOrigin === siteOrigin.value).length,
    createdAt: now,
    updatedAt: now
  })
  isAdding.value = false
}

async function handleDelete(id: string) {
  await passwordStore.deleteEntry(id)
}

function handleOpenFull() {
  tabStore.createTabForSite('sessionbox://passwords')
  emit('open-full')
}
</script>

<template>
  <div class="w-80">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between px-3 pt-2 pb-2">
      <div class="flex items-center gap-2 text-sm font-medium">
        <KeyRound class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="truncate max-w-[180px]">
          {{ siteOrigin ? new URL(siteOrigin).hostname : '当前站点' }}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        class="h-6 gap-1 text-xs text-primary hover:text-primary px-1"
        @click="handleOpenFull"
      >
        管理
        <ArrowRight class="h-3 w-3" />
      </Button>
    </div>
    <Separator />

    <!-- 条目列表 -->
    <ScrollArea class="max-h-[400px]">
      <div v-if="!siteOrigin" class="flex items-center justify-center py-8">
        <p class="text-xs text-muted-foreground">请先打开一个网站</p>
      </div>
      <div v-else-if="siteEntries.length === 0 && !isAdding" class="flex flex-col items-center justify-center py-8 gap-2">
        <KeyRound class="h-8 w-8 text-muted-foreground/40" />
        <p class="text-xs text-muted-foreground">暂无备注信息</p>
      </div>
      <div v-else class="py-1">
        <div
          v-for="entry in siteEntries"
          :key="entry.id"
          class="px-3 py-2"
        >
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-medium truncate">{{ entry.name }}</span>
            <Button
              variant="ghost"
              size="icon"
              class="h-5 w-5 text-muted-foreground hover:text-destructive"
              @click="handleDelete(entry.id)"
            >
              <Trash2 class="h-3 w-3" />
            </Button>
          </div>
          <!-- 字段列表 -->
          <div class="flex flex-col gap-1">
            <div
              v-for="field in entry.fields"
              :key="field.id"
              class="flex items-center gap-1.5 text-xs"
            >
              <span class="text-muted-foreground w-14 shrink-0 truncate text-right" :title="field.name">
                {{ field.name }}
              </span>

              <!-- Checkbox 类型 -->
              <template v-if="field.type === 'checkbox'">
                <Checkbox
                  :checked="field.value === 'true'"
                  disabled
                  class="h-3.5 w-3.5"
                />
              </template>

              <!-- Text/Textarea 类型 -->
              <template v-else>
                <span class="flex-1 truncate font-mono text-[11px]">
                  {{ field.protected && !visibleFields.has(field.id) ? '••••••••' : field.value || '-' }}
                </span>
                <div class="flex items-center gap-0.5 shrink-0">
                  <Button
                    v-if="field.protected"
                    variant="ghost"
                    size="icon"
                    class="h-5 w-5"
                    @click="toggleFieldVisibility(field.id)"
                  >
                    <Eye v-if="!visibleFields.has(field.id)" class="h-3 w-3" />
                    <EyeOff v-else class="h-3 w-3" />
                  </Button>
                  <Button
                    v-if="field.value"
                    variant="ghost"
                    size="icon"
                    class="h-5 w-5"
                    @click="copyToClipboard(field.value)"
                  >
                    <Copy class="h-3 w-3" />
                  </Button>
                </div>
              </template>
            </div>
          </div>

          <Separator class="mt-2" />
        </div>

        <!-- 添加表单 -->
        <div v-if="isAdding" class="px-3 py-2 flex items-center gap-1.5">
          <Input
            v-model="newName"
            placeholder="备注名称"
            class="h-7 text-xs flex-1"
            @keydown.enter="confirmAdd"
            @keydown.escape="cancelAdd"
          />
          <Button variant="ghost" size="icon" class="h-6 w-6" @click="confirmAdd">
            <Check class="h-3.5 w-3.5 text-green-600" />
          </Button>
          <Button variant="ghost" size="icon" class="h-6 w-6" @click="cancelAdd">
            <X class="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </ScrollArea>

    <Separator />
    <!-- 底部 -->
    <div class="px-3 py-1.5">
      <Button
        v-if="siteOrigin && !isAdding"
        variant="ghost"
        size="sm"
        class="w-full h-7 gap-1 text-xs text-primary hover:text-primary"
        @click="startAdd"
      >
        <Plus class="h-3 w-3" />
        添加备注
      </Button>
      <div v-else class="text-[10px] text-muted-foreground text-center">
        共 {{ siteEntries.length }} 条备注
      </div>
    </div>
  </div>
</template>
