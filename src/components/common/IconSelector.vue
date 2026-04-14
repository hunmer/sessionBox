<script setup lang="ts">
import { ref, computed } from 'vue'
import { Camera, SmilePlus, Upload, Link, X } from 'lucide-vue-next'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import IconPickerDialog from '@/components/sidebar/IconPickerDialog.vue'

const props = withDefaults(defineProps<{
  /** 当前图标值（emoji 字符串或 img:filename） */
  modelValue: string
  /** 图标展示区域的尺寸 (px) */
  size?: number
  /** 清除图片图标后回退到的默认 emoji */
  defaultEmoji?: string
  /** 自定义图片的 CSS class（控制内部图片/emoji 的大小） */
  emojiClass?: string
}>(), {
  size: 80,
  defaultEmoji: '',
  emojiClass: 'text-4xl [&_img]:w-10 [&_img]:h-10 [&_*:not(img)]:text-4xl',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const iconPickerOpen = ref(false)
const urlInputOpen = ref(false)
const urlInputValue = ref('')

/** 当前图标是否为自定义图片 */
const isImageIcon = computed(() => props.modelValue.startsWith('img:'))

/** 计算按钮尺寸（基于 size 的比例） */
const actionBtnSize = computed(() => Math.max(24, Math.round(props.size * 0.35)))
const actionIconSize = computed(() => Math.max(12, Math.round(props.size * 0.175)))

/** 上传本地文件 */
async function handleUploadLocal() {
  const result = await window.api.container.uploadIcon()
  if (result) emit('update:modelValue', result)
}

/** 打开在线 URL 输入 */
function handleOpenUrlInput() {
  urlInputValue.value = ''
  urlInputOpen.value = true
}

/** 确认在线 URL */
async function handleConfirmUrl() {
  const url = urlInputValue.value.trim()
  if (!url) return
  const result = await window.api.container.uploadIconFromUrl(url)
  if (result) emit('update:modelValue', result)
  urlInputOpen.value = false
}

/** 清除自定义图标 */
function clearImageIcon() {
  emit('update:modelValue', '')
}

/** 更新图标值 */
function handleIconConfirm(val: string) {
  emit('update:modelValue', val)
}
</script>

<template>
  <div class="flex flex-col items-center gap-3">
    <div class="relative group/icon">
      <!-- 圆形图标 -->
      <div
        class="rounded-full overflow-hidden border-2 border-border flex items-center justify-center bg-muted"
        :style="{ width: `${size}px`, height: `${size}px` }"
      >
        <img
          v-if="isImageIcon"
          :src="`account-icon://${modelValue.slice(4)}`"
          alt="图标"
          class="w-full h-full object-cover"
        />
        <EmojiRenderer
          v-else
          :emoji="modelValue"
          :class="emojiClass"
        />
      </div>

      <!-- 右上角清除按钮 -->
      <button
        v-if="modelValue"
        class="absolute -top-1 -right-1 rounded-full bg-destructive text-destructive-foreground shadow-sm flex items-center justify-center opacity-0 group-hover/icon:opacity-100 transition-opacity hover:bg-destructive/90"
        :style="{ width: `${actionBtnSize}px`, height: `${actionBtnSize}px` }"
        title="清除图标"
        @click="clearImageIcon"
      >
        <X :style="{ width: `${actionIconSize}px`, height: `${actionIconSize}px` }" />
      </button>

      <!-- 左下：选择图标 -->
      <button
        class="absolute -bottom-1 -left-1 rounded-full bg-background border border-border shadow-sm flex items-center justify-center hover:bg-accent transition-colors"
        :style="{ width: `${actionBtnSize}px`, height: `${actionBtnSize}px` }"
        title="选择图标"
        @click="iconPickerOpen = true"
      >
        <SmilePlus :style="{ width: `${actionIconSize}px`, height: `${actionIconSize}px` }" />
      </button>

      <!-- 右下：上传图片 Dropdown -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            class="absolute -bottom-1 -right-1 rounded-full bg-primary text-primary-foreground shadow-sm flex items-center justify-center hover:bg-primary/90 transition-colors"
            :style="{ width: `${actionBtnSize}px`, height: `${actionBtnSize}px` }"
            title="上传图片"
          >
            <Camera :style="{ width: `${actionIconSize}px`, height: `${actionIconSize}px` }" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-[160px]">
          <DropdownMenuItem class="gap-2 cursor-pointer" @click="handleUploadLocal">
            <Upload class="w-4 h-4" />
            <span>上传本地文件</span>
          </DropdownMenuItem>
          <DropdownMenuItem class="gap-2 cursor-pointer" @click="handleOpenUrlInput">
            <Link class="w-4 h-4" />
            <span>输入在线URL</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <!-- 在线 URL 输入弹层 -->
    <div
      v-if="urlInputOpen"
      class="flex items-center gap-2 w-full max-w-[260px]"
    >
      <input
        v-model="urlInputValue"
        type="url"
        placeholder="输入图片URL地址"
        class="flex-1 h-8 px-3 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        @keydown.enter="handleConfirmUrl"
      />
      <button
        class="h-8 px-3 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        @click="handleConfirmUrl"
      >
        确定
      </button>
      <button
        class="h-8 px-2 text-xs rounded-md border border-border hover:bg-accent transition-colors"
        @click="urlInputOpen = false"
      >
        取消
      </button>
    </div>

    <!-- 图标选择器 -->
    <IconPickerDialog
      :open="iconPickerOpen"
      :current-icon="modelValue"
      @update:open="iconPickerOpen = $event"
      @confirm="handleIconConfirm"
    />
  </div>
</template>
