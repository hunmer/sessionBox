<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Plus, Search, Trash2, Eye, EyeOff, Copy, Pencil,
  KeyRound, GripVertical, X, Check, TextCursorInput, AlignLeft, CheckSquare,
  Upload, Download
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle
} from '@/components/ui/resizable'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { usePasswordStore } from '@/stores/password'
import { useTabStore } from '@/stores/tab'
import { useNotification } from '@/composables/useNotification'
import type { PasswordEntry, PasswordField } from '@/types'

const passwordStore = usePasswordStore()
const tabStore = useTabStore()
const notify = useNotification()

// ====== 左侧站点列表 ======
const searchQuery = ref('')
const selectedSite = ref('')

const sites = computed(() => {
  const all = passwordStore.getUniqueSites()
  if (!searchQuery.value) return all.sort()
  const q = searchQuery.value.toLowerCase()
  return all.filter((s) => s.toLowerCase().includes(q)).sort()
})

// 初始化选中第一个站点
watch(
  () => sites.value,
  (list) => {
    if (!selectedSite.value && list.length > 0) {
      selectedSite.value = list[0]
    }
  },
  { immediate: true }
)

/** 每个站点的条目数量 */
function siteCount(origin: string): number {
  return passwordStore.entries.filter((e) => e.siteOrigin === origin).length
}

/** 从 origin 提取 hostname 显示 */
function hostname(origin: string): string {
  try {
    return new URL(origin).hostname
  } catch {
    return origin
  }
}

// ====== 右侧条目列表 ======
const siteEntries = computed(() => {
  if (!selectedSite.value) return []
  return passwordStore.getEntriesBySite(selectedSite.value)
})

// ====== 条目编辑对话框 ======
const dialogOpen = ref(false)
const editingEntry = ref<PasswordEntry | null>(null)

// 编辑表单状态
const formName = ref('')
const formFields = ref<FormFieldItem[]>([])
const formSiteOrigin = ref('')

interface FormFieldItem {
  id: string
  name: string
  type: 'text' | 'textarea' | 'checkbox'
  value: string
  protected: boolean
}

function openCreateDialog() {
  editingEntry.value = null
  formName.value = ''
  formSiteOrigin.value = selectedSite.value
  formFields.value = [
    { id: crypto.randomUUID(), name: '账号', type: 'text', value: '', protected: false },
    { id: crypto.randomUUID(), name: '密码', type: 'text', value: '', protected: true }
  ]
  dialogOpen.value = true
}

function openEditDialog(entry: PasswordEntry) {
  editingEntry.value = entry
  formName.value = entry.name
  formSiteOrigin.value = entry.siteOrigin
  formFields.value = entry.fields.map((f) => ({ ...f }))
  dialogOpen.value = true
}

function addField(type: 'text' | 'textarea' | 'checkbox') {
  const nameMap = { text: '文本', textarea: '长文本', checkbox: '复选框' }
  formFields.value.push({
    id: crypto.randomUUID(),
    name: nameMap[type],
    type,
    value: type === 'checkbox' ? 'false' : '',
    protected: false
  })
}

function removeField(index: number) {
  formFields.value.splice(index, 1)
}

async function handleSave() {
  const name = formName.value.trim() || '未命名'
  const origin = formSiteOrigin.value.trim()
  if (!origin) return

  const now = Date.now()

  if (editingEntry.value) {
    await passwordStore.updateEntry(editingEntry.value.id, {
      name,
      siteOrigin: origin,
      fields: formFields.value.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        value: f.value,
        protected: f.protected || undefined
      })),
      updatedAt: now
    })
  } else {
    await passwordStore.createEntry({
      siteOrigin: origin,
      siteName: hostname(origin),
      name,
      fields: formFields.value.map((f) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        value: f.value,
        protected: f.protected || undefined
      })),
      order: passwordStore.entries.filter((e) => e.siteOrigin === origin).length,
      createdAt: now,
      updatedAt: now
    })
  }

  dialogOpen.value = false
}

async function handleDeleteEntry(id: string) {
  await passwordStore.deleteEntry(id)
}

// ====== 字段值可见性 ======
const visibleFields = ref<Set<string>>(new Set())

function toggleVisibility(fieldId: string) {
  const next = new Set(visibleFields.value)
  if (next.has(fieldId)) next.delete(fieldId)
  else next.add(fieldId)
  visibleFields.value = next
}

async function copyToClipboard(value: string) {
  await navigator.clipboard.writeText(value)
}

// ====== 导入导出 ======
async function handleExport() {
  if (passwordStore.entries.length === 0) {
    notify.warning('没有可导出的密码')
    return
  }
  const success = await passwordStore.exportPasswords()
  if (success) {
    notify.success(`已导出 ${passwordStore.entries.length} 条密码`)
  }
}

async function handleImport() {
  const count = await passwordStore.importFromFile()
  if (count > 0) {
    notify.success(`成功导入 ${count} 条密码`)
  }
}
</script>

<template>
  <div class="h-full flex flex-col bg-background text-foreground">
    <!-- 顶部工具栏 -->
    <div class="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
      <KeyRound class="h-4 w-4 text-muted-foreground" />
      <h2 class="text-sm font-semibold flex-shrink-0">密码管理</h2>
      <div class="flex-1" />
      <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" @click="handleImport">
        <Upload class="w-3.5 h-3.5" />
        导入
      </Button>
      <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" @click="handleExport">
        <Download class="w-3.5 h-3.5" />
        导出
      </Button>
      <Button variant="ghost" size="sm" class="h-7 text-xs gap-1" @click="openCreateDialog">
        <Plus class="w-3.5 h-3.5" />
        添加备注
      </Button>
    </div>

    <!-- 左右分栏 -->
    <ResizablePanelGroup direction="horizontal" class="flex-1 min-h-0">
      <!-- 左侧站点列表 -->
      <ResizablePanel :default-size="25" :min-size="15" :max-size="40">
        <div class="h-full flex flex-col">
          <div class="px-3 py-2 border-b border-border">
            <div class="relative">
              <Search class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                v-model="searchQuery"
                class="h-7 text-xs pl-7"
                placeholder="搜索站点..."
              />
            </div>
          </div>
          <ScrollArea class="flex-1">
            <div v-if="sites.length === 0" class="flex items-center justify-center py-8">
              <p class="text-xs text-muted-foreground">暂无保存的站点</p>
            </div>
            <div v-else class="py-1">
              <div
                v-for="site in sites"
                :key="site"
                class="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors text-xs"
                :class="selectedSite === site ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'"
                @click="selectedSite = site"
              >
                <img
                  :src="`${site}/favicon.ico`"
                  alt=""
                  class="h-4 w-4 rounded-sm shrink-0"
                  @error="($event.target as HTMLImageElement).style.display = 'none'"
                />
                <span class="truncate flex-1">{{ hostname(site) }}</span>
                <span class="text-muted-foreground text-[10px] shrink-0">{{ siteCount(site) }}</span>
              </div>
            </div>
          </ScrollArea>
        </div>
      </ResizablePanel>

      <ResizableHandle />

      <!-- 右侧条目列表 -->
      <ResizablePanel>
        <div class="h-full flex flex-col">
          <div v-if="!selectedSite" class="flex items-center justify-center flex-1">
            <p class="text-xs text-muted-foreground">选择左侧站点查看备注</p>
          </div>

          <template v-else>
            <div class="flex items-center gap-2 px-4 py-2 border-b border-border">
              <span class="text-sm font-medium">{{ hostname(selectedSite) }}</span>
              <span class="text-xs text-muted-foreground">{{ siteEntries.length }} 条备注</span>
            </div>

            <ScrollArea class="flex-1">
              <div v-if="siteEntries.length === 0" class="flex flex-col items-center justify-center py-16 gap-3">
                <KeyRound class="h-12 w-12 text-muted-foreground/30" />
                <p class="text-sm text-muted-foreground">暂无备注信息</p>
                <Button size="sm" class="gap-1" @click="openCreateDialog">
                  <Plus class="h-3.5 w-3.5" />
                  添加第一条
                </Button>
              </div>

              <div v-else class="p-4 flex flex-col gap-3">
                <div
                  v-for="entry in siteEntries"
                  :key="entry.id"
                  class="rounded-lg border border-border p-3"
                >
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium">{{ entry.name }}</span>
                    <div class="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6"
                        @click="openEditDialog(entry)"
                      >
                        <Pencil class="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6 text-muted-foreground hover:text-destructive"
                        @click="handleDeleteEntry(entry.id)"
                      >
                        <Trash2 class="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <!-- 字段列表 -->
                  <div class="flex flex-col gap-1.5">
                    <div
                      v-for="field in entry.fields"
                      :key="field.id"
                      class="flex items-center gap-2 text-xs"
                    >
                      <span class="text-muted-foreground w-20 shrink-0 truncate text-right" :title="field.name">
                        {{ field.name }}
                      </span>

                      <!-- Checkbox -->
                      <template v-if="field.type === 'checkbox'">
                        <Checkbox
                          :checked="field.value === 'true'"
                          disabled
                          class="h-3.5 w-3.5"
                        />
                        <span class="text-muted-foreground">
                          {{ field.value === 'true' ? '是' : '否' }}
                        </span>
                      </template>

                      <!-- Text / Textarea -->
                      <template v-else>
                        <span class="flex-1 truncate font-mono text-[11px]">
                          {{ field.protected && !visibleFields.has(field.id) ? '••••••••' : (field.value || '-') }}
                        </span>
                        <div class="flex items-center gap-0.5 shrink-0">
                          <Button
                            v-if="field.protected"
                            variant="ghost"
                            size="icon"
                            class="h-5 w-5"
                            @click="toggleVisibility(field.id)"
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

                  <div class="mt-2 text-[10px] text-muted-foreground">
                    {{ new Date(entry.updatedAt).toLocaleString() }}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </template>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>

    <!-- 编辑对话框 -->
    <Dialog :open="dialogOpen" @update:open="dialogOpen = $event">
      <DialogContent class="sm:max-w-[520px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{{ editingEntry ? '编辑备注' : '添加备注' }}</DialogTitle>
        </DialogHeader>

        <div class="flex flex-col gap-3 py-2 overflow-y-auto flex-1">
          <!-- 站点 -->
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-muted-foreground">站点</label>
            <Input
              v-model="formSiteOrigin"
              placeholder="https://example.com"
              class="h-8 text-sm"
              :disabled="!!editingEntry"
            />
          </div>

          <!-- 名称 -->
          <div class="flex flex-col gap-1.5">
            <label class="text-xs text-muted-foreground">备注名称</label>
            <Input v-model="formName" placeholder="如：个人账号" class="h-8 text-sm" />
          </div>

          <Separator />

          <!-- 字段列表 -->
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-medium text-muted-foreground">字段</label>
              <div class="flex items-center gap-1">
                <Button variant="ghost" size="sm" class="h-6 text-[10px] gap-1" @click="addField('text')">
                  <TextCursorInput class="h-3 w-3" />
                  文本
                </Button>
                <Button variant="ghost" size="sm" class="h-6 text-[10px] gap-1" @click="addField('textarea')">
                  <AlignLeft class="h-3 w-3" />
                  长文本
                </Button>
                <Button variant="ghost" size="sm" class="h-6 text-[10px] gap-1" @click="addField('checkbox')">
                  <CheckSquare class="h-3 w-3" />
                  复选框
                </Button>
              </div>
            </div>

            <div
              v-for="(field, index) in formFields"
              :key="field.id"
              class="flex flex-col gap-1.5 rounded-md border border-border p-2"
            >
              <div class="flex items-center gap-2">
                <Input
                  v-model="field.name"
                  placeholder="字段名称"
                  class="h-7 text-xs flex-1"
                />
                <Select v-model="field.type">
                  <SelectTrigger class="h-7 text-xs w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">文本</SelectItem>
                    <SelectItem value="textarea">长文本</SelectItem>
                    <SelectItem value="checkbox">复选框</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  v-if="field.type !== 'checkbox'"
                  variant="ghost"
                  size="sm"
                  class="h-7 text-[10px] gap-1 shrink-0"
                  :class="field.protected ? 'text-primary' : 'text-muted-foreground'"
                  @click="field.protected = !field.protected"
                >
                  <KeyRound class="h-3 w-3" />
                  {{ field.protected ? '保护' : '保护' }}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                  @click="removeField(index)"
                >
                  <X class="h-3 w-3" />
                </Button>
              </div>

              <!-- 字段值输入 -->
              <template v-if="field.type === 'checkbox'">
                <div class="flex items-center gap-2">
                  <Checkbox
                    :checked="field.value === 'true'"
                    @update:checked="field.value = $event ? 'true' : 'false'"
                  />
                  <span class="text-xs text-muted-foreground">
                    {{ field.value === 'true' ? '已选中' : '未选中' }}
                  </span>
                </div>
              </template>
              <template v-else-if="field.type === 'textarea'">
                <textarea
                  v-model="field.value"
                  class="w-full min-h-[60px] text-xs rounded-md border border-input bg-transparent px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="输入内容..."
                />
              </template>
              <template v-else>
                <Input
                  v-model="field.value"
                  :type="field.protected ? 'password' : 'text'"
                  placeholder="输入值"
                  class="h-7 text-xs"
                />
              </template>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" @click="dialogOpen = false">取消</Button>
          <Button size="sm" @click="handleSave">
            {{ editingEntry ? '保存' : '添加' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
