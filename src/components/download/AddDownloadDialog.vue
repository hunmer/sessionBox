<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
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

/** 分组预设：none=不分组，其余为模板字符串。custom=展开自定义输入 */
const groupPreset = ref<'none' | 'host' | 'type' | 'host_date' | 'host_type_date' | 'custom'>('none')
const customGroup = ref('')

/** 分组预设选项（value=模板字符串，主进程用 {host}/{type}/{date} 解析） */
const groupOptions: { value: typeof groupPreset.value; label: string; template: string }[] = [
  { value: 'none', label: '不分组', template: '' },
  { value: 'host', label: '按站点', template: '{host}' },
  { value: 'type', label: '按文件类型', template: '{type}' },
  { value: 'host_date', label: '站点 / 日期', template: '{host}/{date}' },
  { value: 'host_type_date', label: '站点 / 类型 / 日期', template: '{host}/{type}/{date}' },
  { value: 'custom', label: '自定义…', template: '' }
]

/** 当前生效的分组模板字符串 */
const category = computed(() => {
  if (groupPreset.value === 'custom') return customGroup.value.trim()
  const opt = groupOptions.find((o) => o.value === groupPreset.value)
  return opt?.template || ''
})

/** 分组预览：展示最终将创建的子目录路径 */
const groupPreview = computed(() => {
  const cat = category.value
  if (!cat) return '直接保存到下载目录'
  return cat
})

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
    groupPreset.value = 'none'
    customGroup.value = ''
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
      dir: dir.value.trim() || undefined,
      category: category.value || undefined
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
  <Dialog
    :open="open"
    @update:open="onOpenChange"
  >
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

        <!-- 分组归档 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-muted-foreground">分组归档</label>
          <Select v-model="groupPreset">
            <SelectTrigger class="h-8 text-sm">
              <SelectValue placeholder="选择分组方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="opt in groupOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </SelectItem>
            </SelectContent>
          </Select>

          <!-- 自定义模板输入 -->
          <div
            v-if="groupPreset === 'custom'"
            class="flex flex-col gap-1"
          >
            <Input
              v-model="customGroup"
              placeholder="如 {host}/{type}/{date} 或 {host}/{date}"
              class="h-8 text-sm font-mono"
            />
            <span class="text-[10px] text-muted-foreground">
              可用变量：{host} 站点 · {type} 文件类型 · {date} 日期 · 用 / 分隔多级目录
            </span>
          </div>

          <!-- 预览 -->
          <span
            v-if="category"
            class="text-[10px] text-muted-foreground truncate"
            :title="groupPreview"
          >
            子目录：{{ groupPreview }}
          </span>
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          size="sm"
          @click="emit('update:open', false)"
        >
          取消
        </Button>
        <Button
          size="sm"
          :disabled="!isValid() || submitting"
          @click="handleSubmit"
        >
          {{ submitting ? '添加中...' : '立即下载' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
