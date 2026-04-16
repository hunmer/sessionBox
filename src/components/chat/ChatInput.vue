<script setup lang="ts">
import { ref, computed } from 'vue'
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
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { ImagePlus, Send, Square, Trash2, Wrench } from 'lucide-vue-next'
import { useChatStore } from '@/stores/chat'
import { BROWSER_TOOL_LIST } from '@/lib/agent/tools'
import type { ToolMeta } from '@/lib/agent/tools'

const props = defineProps<{
  isStreaming: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  send: [content: string, images: string[]]
  stop: []
  clear: []
}>()

const chatStore = useChatStore()

const inputText = ref('')
const images = ref<string[]>([])

/** 按分类分组工具列表 */
const groupedTools = computed(() => {
  const groups = new Map<string, ToolMeta[]>()
  for (const tool of BROWSER_TOOL_LIST) {
    const list = groups.get(tool.category) ?? []
    list.push(tool)
    groups.set(tool.category, list)
  }
  return Array.from(groups.entries())
})

/** 已启用工具数量 */
const enabledCount = computed(() => {
  return BROWSER_TOOL_LIST.filter((t) => chatStore.enabledTools[t.name] !== false).length
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
</script>

<template>
  <div class="p-3">
    <InputGroup>
      <!-- 图片预览 -->
      <InputGroupAddon v-if="images.length" align="block-start" class="flex-wrap gap-2">
        <div v-for="(img, i) in images" :key="i" class="relative group">
          <img :src="`data:image/png;base64,${img}`" class="w-12 h-12 rounded border object-cover" />
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
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <InputGroupButton variant="ghost" size="xs" :disabled="isStreaming" class="relative gap-1">
              <Wrench class="size-3.5" />
              <span
                v-if="enabledCount < BROWSER_TOOL_LIST.length"
                class="text-amber-500 text-[10px]"
              >
                {{ enabledCount }}
              </span>
            </InputGroupButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" class="w-64 max-h-80 overflow-y-auto">
            <DropdownMenuLabel class="flex items-center justify-between">
              <span>工具列表</span>
              <span class="text-xs font-normal text-muted-foreground">
                {{ enabledCount }}/{{ BROWSER_TOOL_LIST.length }}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <template v-for="([category, tools], gi) in groupedTools" :key="category">
              <DropdownMenuLabel v-if="gi > 0" class="text-xs text-muted-foreground pt-1">
                {{ category }}
              </DropdownMenuLabel>
              <DropdownMenuItem
                v-for="tool in tools"
                :key="tool.name"
                class="flex items-center justify-between gap-3"
                @select.prevent
              >
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-mono text-xs">{{ tool.name }}</span>
                  <span class="text-[11px] text-muted-foreground leading-tight">{{ tool.description }}</span>
                </div>
                <Switch
                  :model-value="chatStore.enabledTools[tool.name] !== false"
                  @update:model-value="chatStore.toggleTool(tool.name)"
                  class="shrink-0"
                />
              </DropdownMenuItem>
              <DropdownMenuSeparator v-if="gi < groupedTools.length - 1" />
            </template>
          </DropdownMenuContent>
        </DropdownMenu>

        <InputGroupText class="ml-auto">
          {{ inputText.length }}
        </InputGroupText>

        <Separator orientation="vertical" class="!h-4" />

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
  </div>
</template>
