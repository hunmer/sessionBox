<script setup lang="ts">
import { ref, watch } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDownloadStore } from '@/stores/download'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const store = useDownloadStore()

const url = ref('')
const filename = ref('')
const dir = ref('')
const submitting = ref(false)

/** 从 URL 中提取文件名 */
function extractFilenameFromUrl(raw: string): string {
  try {
    const pathname = new URL(raw).pathname
    const last = pathname.split('/').pop()
    if (last && last.includes('.')) return decodeURIComponent(last)
  } catch {
    // ignore
  }
  return ''
}

/** URL 变化时自动推断文件名 */
watch(url, (val) => {
  const trimmed = val.trim()
  if (trimmed && !filename.value) {
    filename.value = extractFilenameFromUrl(trimmed)
  }
})

/** 对话框打开时重置表单 */
watch(() => props.open, (open) => {
  if (!open) {
    url.value = ''
    filename.value = ''
    dir.value = ''
    submitting.value = false
  }
})

function onOpenChange(open: boolean) {
  emit('update:open', open)
}

async function handleSubmit() {
  const trimmedUrl = url.value.trim()
  if (!trimmedUrl) return

  const normalizedUrl = trimmedUrl.match(/^https?:\/\//) ? trimmedUrl : `https://${trimmedUrl}`

  submitting.value = true
  try {
    await window.api.download.add(normalizedUrl, {
      filename: filename.value.trim() || undefined,
      dir: dir.value.trim() || undefined
    })
    await store.refreshTasks()
    emit('update:open', false)
  } finally {
    submitting.value = false
  }
}

function isValid() {
  return url.value.trim().length > 0
}

async function pickDirectory() {
  const selected = await window.api.download.pickDirectory(store.config?.downloadDir)
  if (selected) {
    dir.value = selected
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent class="sm:max-w-[420px]">
      <DialogHeader>
        <DialogTitle>添加下载任务</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-3 py-2">
        <!-- 下载地址 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-muted-foreground">下载地址</label>
          <Input
            v-model="url"
            placeholder="https://example.com/file.zip"
            class="h-8 text-sm"
          />
        </div>

        <!-- 保存名称 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-muted-foreground">保存名称（可选）</label>
          <Input
            v-model="filename"
            placeholder="自动从地址推断"
            class="h-8 text-sm"
          />
        </div>

        <!-- 保存位置 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-muted-foreground">保存位置（可选）</label>
          <div class="flex gap-2">
            <Input
              v-model="dir"
              :placeholder="store.config?.downloadDir || '使用默认下载目录'"
              class="h-8 text-sm flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              class="h-8 shrink-0"
              @click="pickDirectory"
            >
              浏览
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" @click="emit('update:open', false)">取消</Button>
        <Button size="sm" :disabled="!isValid() || submitting" @click="handleSubmit">
          {{ submitting ? '添加中...' : '立即下载' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
