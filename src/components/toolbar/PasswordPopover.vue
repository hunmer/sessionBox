<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  KeyRound, Plus, Eye, EyeOff, Copy, ArrowRight, Trash2,
  Check, X, TextCursorInput, AlignLeft, CheckSquare
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
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

/** 站点 hostname 显示 */
const siteHostname = computed(() => {
  if (!siteOrigin.value) return '当前站点'
  try { return new URL(siteOrigin.value).hostname } catch { return siteOrigin.value }
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

// ====== 添加表单 ======

interface FormField {
  id: string
  name: string
  type: 'text' | 'textarea' | 'checkbox'
  value: string
  protected: boolean
}

const isAdding = ref(false)
const newName = ref('')
const formFields = ref<FormField[]>([])

function startAdd() {
  newName.value = ''
  formFields.value = [
    { id: crypto.randomUUID(), name: '账号', type: 'text', value: '', protected: false },
    { id: crypto.randomUUID(), name: '密码', type: 'text', value: '', protected: true }
  ]
  isAdding.value = true
}

function cancelAdd() {
  isAdding.value = false
}

function addField(type: 'text' | 'textarea' | 'checkbox') {
  const labelMap = { text: '文本', textarea: '长文本', checkbox: '复选框' }
  formFields.value.push({
    id: crypto.randomUUID(),
    name: labelMap[type],
    type,
    value: type === 'checkbox' ? 'false' : '',
    protected: false
  })
}

function removeField(index: number) {
  formFields.value.splice(index, 1)
}

async function confirmAdd() {
  if (!siteOrigin.value) return
  const name = newName.value.trim() || '新备注'
  const now = Date.now()

  await passwordStore.createEntry({
    siteOrigin: siteOrigin.value,
    siteName: new URL(siteOrigin.value).hostname,
    name,
    fields: formFields.value.map(f => ({
      id: f.id,
      name: f.name,
      type: f.type,
      value: f.value,
      protected: f.protected || undefined
    })),
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
  <div>
    <!-- 标题栏 -->
    <div class="flex items-center justify-between px-3 pt-2 pb-2">
      <div class="flex items-center gap-2 text-sm font-medium">
        <KeyRound class="h-3.5 w-3.5 text-muted-foreground" />
        <span class="truncate max-w-[180px]">
          {{ siteHostname }}
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

    <!-- 条目列表 / 添加表单 -->
    <ScrollArea class="max-h-[400px]">
      <!-- 无站点 -->
      <div
        v-if="!siteOrigin"
        class="flex items-center justify-center py-8"
      >
        <p class="text-xs text-muted-foreground">
          请先打开一个网站
        </p>
      </div>

      <!-- 添加表单 -->
      <div
        v-else-if="isAdding"
        class="p-3 flex flex-col gap-2.5"
      >
        <!-- 名称 -->
        <div class="flex flex-col gap-1">
          <label class="text-[10px] text-muted-foreground">备注名称</label>
          <Input
            v-model="newName"
            placeholder="如：个人账号"
            class="h-7 text-xs"
          />
        </div>

        <Separator />

        <!-- 字段列表 -->
        <div class="flex flex-col gap-2">
          <div
            v-for="(field, index) in formFields"
            :key="field.id"
            class="flex flex-col gap-1 rounded-md border border-border p-2"
          >
            <div class="flex items-center gap-1.5">
              <Input
                v-model="field.name"
                class="h-6 text-[11px] flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
                placeholder="字段名"
              />
              <Select v-model="field.type">
                <SelectTrigger class="h-6 text-[10px] w-16 border-0 px-1 shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">
                    文本
                  </SelectItem>
                  <SelectItem value="textarea">
                    长文本
                  </SelectItem>
                  <SelectItem value="checkbox">
                    复选框
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                v-if="field.type !== 'checkbox'"
                variant="ghost"
                size="icon"
                class="h-5 w-5 shrink-0"
                :class="field.protected ? 'text-primary' : 'text-muted-foreground'"
                @click="field.protected = !field.protected"
              >
                <KeyRound class="h-2.5 w-2.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="h-5 w-5 text-muted-foreground hover:text-destructive shrink-0"
                @click="removeField(index)"
              >
                <X class="h-2.5 w-2.5" />
              </Button>
            </div>
            <!-- 值输入 -->
            <template v-if="field.type === 'checkbox'">
              <div class="flex items-center gap-1.5 px-1">
                <Checkbox
                  :checked="field.value === 'true'"
                  @update:checked="field.value = $event ? 'true' : 'false'"
                />
                <span class="text-[10px] text-muted-foreground">
                  {{ field.value === 'true' ? '是' : '否' }}
                </span>
              </div>
            </template>
            <template v-else-if="field.type === 'textarea'">
              <textarea
                v-model="field.value"
                class="w-full min-h-[40px] text-[11px] rounded border border-input bg-transparent px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="输入内容..."
              />
            </template>
            <template v-else>
              <Input
                v-model="field.value"
                :type="field.protected ? 'password' : 'text'"
                placeholder="输入值"
                class="h-6 text-[11px]"
              />
            </template>
          </div>
        </div>

        <!-- 添加自定义字段 -->
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            class="h-6 text-[10px] gap-1"
            @click="addField('text')"
          >
            <TextCursorInput class="h-3 w-3" />
            文本
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-6 text-[10px] gap-1"
            @click="addField('textarea')"
          >
            <AlignLeft class="h-3 w-3" />
            长文本
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-6 text-[10px] gap-1"
            @click="addField('checkbox')"
          >
            <CheckSquare class="h-3 w-3" />
            复选框
          </Button>
        </div>

        <!-- 确认 / 取消 -->
        <div class="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            class="flex-1 h-7 text-xs"
            @click="cancelAdd"
          >
            取消
          </Button>
          <Button
            size="sm"
            class="flex-1 h-7 text-xs"
            @click="confirmAdd"
          >
            保存
          </Button>
        </div>
      </div>

      <!-- 空状态 -->
      <div
        v-else-if="siteEntries.length === 0"
        class="flex flex-col items-center justify-center py-8 gap-2"
      >
        <KeyRound class="h-8 w-8 text-muted-foreground/40" />
        <p class="text-xs text-muted-foreground">
          暂无备注信息
        </p>
      </div>

      <!-- 条目列表 -->
      <div
        v-else
        class="py-1"
      >
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
              <span
                class="text-muted-foreground w-14 shrink-0 truncate text-right"
                :title="field.name"
              >
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
                    <Eye
                      v-if="!visibleFields.has(field.id)"
                      class="h-3 w-3"
                    />
                    <EyeOff
                      v-else
                      class="h-3 w-3"
                    />
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
      <div
        v-else-if="!isAdding"
        class="text-[10px] text-muted-foreground text-center"
      >
        共 {{ siteEntries.length }} 条备注
      </div>
    </div>
  </div>
</template>
