<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
  InputGroupText,
} from '@/components/ui/input-group'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  ImagePlus, Send, Square, Trash2, Wrench, ScrollText,
  Copy, Check, Pencil, Loader2,
} from 'lucide-vue-next'
import type { ToolDisplayItem } from '@/types'

interface SkillItem {
  name: string
  description: string
  created: string
  updated: string
}

interface SkillFull {
  name: string
  description: string
  content: string
  updated: string
}

const props = defineProps<{
  isStreaming: boolean
  disabled?: boolean
  tools?: ToolDisplayItem[]
  enabledTools?: Record<string, boolean>
}>()

const emit = defineEmits<{
  send: [content: string, images: string[]]
  stop: []
  clear: []
  toggleTool: [toolName: string]
}>()

const inputText = ref('')
const images = ref<string[]>([])

const toolList = computed(() => props.tools ?? [])

/** 按分类分组工具列表 */
const groupedTools = computed(() => {
  const groups = new Map<string, ToolDisplayItem[]>()
  for (const tool of toolList.value) {
    const list = groups.get(tool.category) ?? []
    list.push(tool)
    groups.set(tool.category, list)
  }
  return Array.from(groups.entries())
})

/** 已启用工具数量 */
const enabledCount = computed(() => {
  return toolList.value.filter((t) => props.enabledTools?.[t.name] !== false).length
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function handleSend() {
  const text = inputText.value.trim()
  if (!text || props.isStreaming) return
  emit('send', text, images.value)
  inputText.value = ''
  images.value = []
}

function handleImageUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = true
  input.onchange = async () => {
    if (!input.files) return
    for (const file of Array.from(input.files)) {
      const base64 = await fileToBase64(file)
      images.value.push(base64)
    }
  }
  input.click()
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function removeImage(index: number) {
  images.value.splice(index, 1)
}

// ===== Skill 列表 =====
const skills = ref<SkillItem[]>([])
const copiedName = ref<string | null>(null)

async function loadSkills() {
  try {
    skills.value = await window.api.skill.list()
  } catch {
    skills.value = []
  }
}

onMounted(loadSkills)

async function copySkillName(name: string) {
  try {
    await navigator.clipboard.writeText(name)
    copiedName.value = name
    setTimeout(() => {
      copiedName.value = null
    }, 1500)
  } catch { /* ignore */ }
}

function onSkillDropdownOpen(open: boolean) {
  if (open) loadSkills()
}

// ===== Skill 编辑 =====
const editDialogOpen = ref(false)
const editForm = ref({ name: '', description: '', content: '' })
const editSaving = ref(false)

async function openEditDialog(name: string) {
  try {
    const skill: SkillFull | null = await window.api.skill.read(name)
    if (!skill) return
    editForm.value = {
      name: skill.name,
      description: skill.description,
      content: skill.content,
    }
    editDialogOpen.value = true
  } catch { /* ignore */ }
}

async function saveEdit() {
  if (!editForm.value.name.trim() || !editForm.value.description.trim()) return
  editSaving.value = true
  try {
    await window.api.skill.write(
      editForm.value.name,
      editForm.value.description,
      editForm.value.content,
    )
    editDialogOpen.value = false
    await loadSkills()
  } catch { /* ignore */ }
  editSaving.value = false
}

// ===== Skill 删除 =====
const deleteTarget = ref<SkillItem | null>(null)
const deleteConfirmOpen = computed({
  get: () => deleteTarget.value !== null,
  set: (v: boolean) => {
    if (!v) deleteTarget.value = null
  },
})

function requestDelete(skill: SkillItem) {
  deleteTarget.value = skill
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  deleteTarget.value = null
  try {
    await window.api.skill.delete(target.name)
    await loadSkills()
  } catch { /* ignore */ }
}
</script>

<template>
  <div class="p-3">
    <InputGroup>
      <!-- 图片预览 -->
      <InputGroupAddon
        v-if="images.length"
        align="block-start"
        class="flex-wrap gap-2"
      >
        <div
          v-for="(img, i) in images"
          :key="i"
          class="relative group"
        >
          <img
            :src="`data:image/png;base64,${img}`"
            class="w-12 h-12 rounded border object-cover"
          >
          <button
            class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            @click="removeImage(i)"
          >
            ×
          </button>
        </div>
      </InputGroupAddon>

      <!-- 输入框 -->
      <InputGroupTextarea
        v-model="inputText"
        :disabled="disabled"
        placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
        class="max-h-[200px] min-h-[36px] py-2"
        @keydown="handleKeydown"
      />

      <!-- 底部工具栏 -->
      <InputGroupAddon align="block-end">
        <!-- 清空对话 -->
        <InputGroupButton
          variant="ghost"
          size="icon-xs"
          :disabled="isStreaming"
          @click="$emit('clear')"
        >
          <Trash2 class="size-4" />
        </InputGroupButton>

        <!-- 图片上传 -->
        <InputGroupButton
          variant="ghost"
          size="icon-xs"
          :disabled="isStreaming"
          @click="handleImageUpload"
        >
          <ImagePlus class="size-4" />
        </InputGroupButton>

        <!-- 工具选择 -->
        <DropdownMenu v-if="toolList.length">
          <DropdownMenuTrigger as-child>
            <InputGroupButton
              variant="ghost"
              size="xs"
              :disabled="isStreaming"
              class="relative gap-1"
            >
              <Wrench class="size-3.5" />
              <span
                v-if="enabledCount < toolList.length"
                class="text-amber-500 text-[10px]"
              >
                {{ enabledCount }}
              </span>
            </InputGroupButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            class="w-64 max-h-80 overflow-y-auto"
          >
            <DropdownMenuLabel class="flex items-center justify-between">
              <span>工具列表</span>
              <span class="text-xs font-normal text-muted-foreground">
                {{ enabledCount }}/{{ toolList.length }}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <template
              v-for="([category, categoryTools], gi) in groupedTools"
              :key="category"
            >
              <DropdownMenuLabel
                v-if="gi > 0"
                class="text-xs text-muted-foreground pt-1"
              >
                {{ category }}
              </DropdownMenuLabel>
              <DropdownMenuItem
                v-for="tool in categoryTools"
                :key="tool.name"
                class="flex items-center justify-between gap-3"
                @select.prevent
              >
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-mono text-xs">{{ tool.name }}</span>
                  <span class="text-[11px] text-muted-foreground leading-tight">{{ tool.description }}</span>
                </div>
                <Switch
                  :model-value="enabledTools?.[tool.name] !== false"
                  class="shrink-0"
                  @update:model-value="emit('toggleTool', tool.name)"
                />
              </DropdownMenuItem>
              <DropdownMenuSeparator v-if="gi < groupedTools.length - 1" />
            </template>
          </DropdownMenuContent>
        </DropdownMenu>

        <!-- Skill 列表 -->
        <DropdownMenu @update:open="onSkillDropdownOpen">
          <DropdownMenuTrigger as-child>
            <InputGroupButton
              variant="ghost"
              size="icon-xs"
              :disabled="isStreaming"
            >
              <ScrollText class="size-4" />
            </InputGroupButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            class="w-72 max-h-80 overflow-y-auto"
          >
            <DropdownMenuLabel class="flex items-center justify-between">
              <span>Skill 列表</span>
              <span class="text-xs font-normal text-muted-foreground">{{ skills.length }}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <template v-if="skills.length">
              <DropdownMenuItem
                v-for="skill in skills"
                :key="skill.name"
                class="flex items-center justify-between gap-2"
                @select.prevent="copySkillName(skill.name)"
              >
                <div
                  class="flex flex-col gap-0.5 min-w-0 flex-1"
                  @click="copySkillName(skill.name)"
                >
                  <span class="font-mono text-xs">{{ skill.name }}</span>
                  <span class="text-[11px] text-muted-foreground leading-tight truncate">{{ skill.description }}</span>
                </div>
                <div class="flex items-center gap-0.5 shrink-0">
                  <button
                    class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="复制名称"
                    @click.stop="copySkillName(skill.name)"
                  >
                    <component
                      :is="copiedName === skill.name ? Check : Copy"
                      class="size-3"
                      :class="copiedName === skill.name && 'text-green-500'"
                    />
                  </button>
                  <button
                    class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="编辑"
                    @click.stop="openEditDialog(skill.name)"
                  >
                    <Pencil class="size-3" />
                  </button>
                  <button
                    class="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                    title="删除"
                    @click.stop="requestDelete(skill)"
                  >
                    <Trash2 class="size-3" />
                  </button>
                </div>
              </DropdownMenuItem>
            </template>
            <DropdownMenuItem
              v-else
              disabled
              class="text-muted-foreground text-xs justify-center"
            >
              暂无 Skill，对 AI 说"保存 skill"即可创建
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <InputGroupText class="ml-auto">
          {{ inputText.length }}
        </InputGroupText>

        <Separator
          orientation="vertical"
          class="!h-4"
        />

        <!-- 发送/停止 -->
        <InputGroupButton
          v-if="isStreaming"
          variant="destructive"
          size="icon-xs"
          class="rounded-full"
          @click="$emit('stop')"
        >
          <Square class="size-3.5" />
        </InputGroupButton>
        <InputGroupButton
          v-else
          variant="default"
          size="icon-xs"
          class="rounded-full"
          :disabled="!inputText.trim() || disabled"
          @click="handleSend"
        >
          <Send class="size-4" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>

    <!-- 编辑对话框 -->
    <Dialog v-model:open="editDialogOpen">
      <DialogContent class="max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑 Skill</DialogTitle>
          <DialogDescription>修改 Skill 的描述和内容，保存后立即生效。</DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <div class="space-y-1">
            <label class="text-xs font-medium text-muted-foreground">名称</label>
            <input
              v-model="editForm.name"
              class="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm font-mono"
              disabled
            >
          </div>
          <div class="space-y-1">
            <label class="text-xs font-medium text-muted-foreground">描述</label>
            <input
              v-model="editForm.description"
              class="w-full rounded-md border bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
          </div>
          <div class="space-y-1">
            <label class="text-xs font-medium text-muted-foreground">内容 (Markdown)</label>
            <textarea
              v-model="editForm.content"
              class="w-full rounded-md border bg-transparent px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring min-h-[200px] resize-y"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            @click="editDialogOpen = false"
          >
            取消
          </Button>
          <Button
            :disabled="editSaving"
            @click="saveEdit"
          >
            <Loader2
              v-if="editSaving"
              class="size-4 mr-1 animate-spin"
            />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 删除确认 -->
    <AlertDialog v-model:open="deleteConfirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除 Skill「{{ deleteTarget?.name }}」吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="confirmDelete"
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
