<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useShortcutStore } from '@/stores/shortcut'
import { Kbd } from '@/components/ui/kbd'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { toast } from 'vue-sonner'

const store = useShortcutStore()

// 录制状态
const recordingId = ref<string | null>(null)
const recordedKeys = ref<string[]>([])

// 冲突确认状态
const conflictDialogOpen = ref(false)
const conflictMessage = ref('')
const pendingConflict = ref<{
  targetId: string
  accelerator: string
  conflictId: string
  isGlobal: boolean
} | null>(null)

/** 将键盘事件转换为 Electron accelerator 部分 */
function keyToAcceleratorPart(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CmdOrCtrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')

  // 主键映射
  let key = ''
  if (e.key === ' ') key = 'Space'
  else if (e.key === 'ArrowUp') key = 'Up'
  else if (e.key === 'ArrowDown') key = 'Down'
  else if (e.key === 'ArrowLeft') key = 'Left'
  else if (e.key === 'ArrowRight') key = 'Right'
  else if (e.key === 'Tab') key = 'Tab'
  else if (e.key === 'Enter') key = 'Enter'
  else if (e.key === 'Escape') key = 'Escape'
  else if (e.key === 'Delete') key = 'Delete'
  else if (e.key === 'Backspace') key = 'Backspace'
  else if (e.key === 'Insert') key = 'Insert'
  else if (e.key === 'Home') key = 'Home'
  else if (e.key === 'End') key = 'End'
  else if (e.key === 'PageUp') key = 'PageUp'
  else if (e.key === 'PageDown') key = 'PageDown'
  else if (e.key.startsWith('F') && /^F\d{1,2}$/.test(e.key)) key = e.key
  else if (e.key.length === 1) key = e.key.toUpperCase()
  else return '' // 忽略无法识别的键

  if (key) parts.push(key)
  return parts.join('+')
}

/** 将 accelerator 字符串拆分为显示用的按键数组 */
function acceleratorToParts(accelerator: string): string[] {
  if (!accelerator) return []
  return accelerator.split('+').map(part => {
    const map: Record<string, string> = {
      CmdOrCtrl: 'Ctrl',
      Control: 'Ctrl',
      Meta: 'Win',
      Shift: 'Shift',
      Alt: 'Alt'
    }
    return map[part] || part
  })
}

/** 判断是否是修饰键 */
function isModifier(e: KeyboardEvent): boolean {
  return ['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)
}

async function onKeyDown(e: KeyboardEvent) {
  if (!recordingId.value) return
  e.preventDefault()
  e.stopPropagation()

  // Escape 取消录制
  if (e.key === 'Escape') {
    recordingId.value = null
    recordedKeys.value = []
    return
  }

  // Delete/Backspace 清空快捷键
  if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
    const id = recordingId.value
    recordingId.value = null
    recordedKeys.value = []
    await store.clearShortcut(id)
    return
  }

  // 忽略单独的修饰键
  if (isModifier(e)) {
    recordedKeys.value = acceleratorToParts(keyToAcceleratorPart(e))
    return
  }

  // 组合键完成
  const accelerator = keyToAcceleratorPart(e)
  if (!accelerator) return

  // 必须包含修饰键
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    toast.warning('快捷键需要包含 Ctrl、Alt 或 Shift 修饰键')
    return
  }

  const id = recordingId.value
  const item = store.shortcuts.find(s => s.id === id)
  const isGlobal = item?.global ?? false

  const result = await store.updateShortcut(id, accelerator, isGlobal)
  recordingId.value = null
  recordedKeys.value = []

  if (result.conflictId) {
    // 有冲突，弹出确认对话框
    conflictMessage.value = `${result.error}，是否覆盖？`
    pendingConflict.value = { targetId: id, accelerator, conflictId: result.conflictId, isGlobal }
    conflictDialogOpen.value = true
  } else if (!result.success) {
    toast.error(result.error || '设置快捷键失败')
  }
}

/** 确认覆盖冲突的快捷键 */
async function confirmOverride() {
  if (!pendingConflict.value) return
  const { targetId, accelerator, conflictId, isGlobal } = pendingConflict.value
  pendingConflict.value = null
  await store.clearShortcut(conflictId)
  const result = await store.updateShortcut(targetId, accelerator, isGlobal)
  if (!result.success) {
    toast.error(result.error || '设置快捷键失败')
  }
}

async function onGlobalChange(id: string, value: boolean) {
  console.log('[Shortcut] Switch toggled:', id, value)
  const item = store.shortcuts.find(s => s.id === id)
  if (!item) return
  const result = await store.updateShortcut(id, item.accelerator || '', value)
  console.log('[Shortcut] Switch update result:', result)
  if (!result.success) {
    toast.error(result.error || '更新失败')
  }
}

function startRecording(id: string) {
  recordingId.value = id
  recordedKeys.value = []
}

onMounted(() => {
  store.load()
  window.addEventListener('keydown', onKeyDown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, true)
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="text-sm font-medium">快捷键</div>
    <div class="flex flex-col gap-0.5">
      <template v-for="(item, i) in store.shortcuts" :key="item.id">
        <Separator v-if="i > 0" class="my-1" />
        <div class="flex items-center justify-between py-1.5 px-1">
          <span class="text-sm text-muted-foreground">{{ item.label }}</span>
          <div class="flex items-center gap-3">
            <!-- 全局注册开关 -->
            <label class="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <span>全局</span>
              <Switch
                :model-value="item.global"
                @update:model-value="onGlobalChange(item.id, $event)"
                class="scale-75"
              />
            </label>

            <!-- 快捷键显示/录制区域 -->
            <button
              class="flex items-center gap-1 px-2 py-1 rounded border border-border bg-muted/50 hover:bg-muted transition-colors min-w-[80px] justify-center cursor-pointer"
              :class="recordingId === item.id ? 'border-primary ring-1 ring-primary/30 bg-primary/5' : ''"
              @click="startRecording(item.id)"
            >
              <template v-if="recordingId === item.id">
                <template v-if="recordedKeys.length > 0">
                  <Kbd v-for="key in recordedKeys" :key="key" class="text-primary">{{ key }}</Kbd>
                </template>
                <span v-else class="text-xs text-muted-foreground">按下快捷键...</span>
              </template>
              <template v-else-if="item.accelerator">
                <Kbd v-for="key in acceleratorToParts(item.accelerator)" :key="key">{{ key }}</Kbd>
              </template>
              <span v-else class="text-xs text-muted-foreground/50">未设置</span>
            </button>
          </div>
        </div>
      </template>
    </div>
    <p class="text-xs text-muted-foreground/60 mt-1">
      点击快捷键区域录入 · Delete 清空 · Escape 取消
    </p>

    <!-- 冲突覆盖确认对话框 -->
    <AlertDialog v-model:open="conflictDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>快捷键冲突</AlertDialogTitle>
          <AlertDialogDescription>{{ conflictMessage }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction @click="confirmOverride">覆盖</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
