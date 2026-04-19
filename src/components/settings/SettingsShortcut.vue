<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useShortcutStore } from '@/stores/shortcut'
import { Kbd } from '@/components/ui/kbd'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { useNotification } from '@/composables/useNotification'

const notify = useNotification()

const store = useShortcutStore()

const activeTab = ref(store.groups[0]?.key ?? 'tab')

const shortcutsInGroup = computed(() => {
  return store.getShortcutsByGroup(activeTab.value)
})

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

  let key: string
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
  else return ''

  parts.push(key)
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

  if (e.key === 'Escape') {
    recordingId.value = null
    recordedKeys.value = []
    return
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
    const id = recordingId.value
    recordingId.value = null
    recordedKeys.value = []
    await store.clearShortcut(id)
    return
  }

  if (isModifier(e)) {
    recordedKeys.value = acceleratorToParts(keyToAcceleratorPart(e))
    return
  }

  const accelerator = keyToAcceleratorPart(e)
  if (!accelerator) return

  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    notify.warning('快捷键需要包含 Ctrl、Alt 或 Shift 修饰键')
    return
  }

  const id = recordingId.value
  const item = store.shortcuts.find(s => s.id === id)
  const isGlobal = item?.global ?? false

  const result = await store.updateShortcut(id, accelerator, isGlobal)
  recordingId.value = null
  recordedKeys.value = []

  if (result.conflictId) {
    conflictMessage.value = `${result.error}，是否覆盖？`
    pendingConflict.value = { targetId: id, accelerator, conflictId: result.conflictId, isGlobal }
    conflictDialogOpen.value = true
  } else if (!result.success) {
    notify.error(result.error || '设置快捷键失败')
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
    notify.error(result.error || '设置快捷键失败')
  }
}

async function onEnabledChange(id: string, enabled: boolean) {
  const result = await store.toggleEnabled(id, enabled)
  if (!result.success) {
    notify.error(result.error || '更新失败')
  }
}

async function onGlobalChange(id: string, value: boolean) {
  const item = store.shortcuts.find(s => s.id === id)
  if (!item) return
  const result = await store.updateShortcut(id, item.accelerator || '', value)
  if (!result.success) {
    notify.error(result.error || '更新失败')
  }
}

function startRecording(id: string) {
  recordingId.value = id
  recordedKeys.value = []
}

onMounted(() => {
  store.load().then(() => {
    if (store.groups.length > 0) {
      activeTab.value = store.groups[0].key
    }
  })
  window.addEventListener('keydown', onKeyDown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, true)
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="text-sm font-medium">
      快捷键
    </div>

    <Tabs v-model="activeTab">
      <TabsList class="w-full justify-start h-8 p-0.5 bg-muted/50">
        <TabsTrigger
          v-for="group in store.groups"
          :key="group.key"
          :value="group.key"
          class="text-xs px-3 py-1 data-[state=active]:bg-background"
        >
          {{ group.label }}
        </TabsTrigger>
      </TabsList>

      <TabsContent
        v-for="group in store.groups"
        :key="group.key"
        :value="group.key"
        class="mt-2"
      >
        <div class="flex flex-col gap-0.5">
          <template
            v-for="(item, i) in store.getShortcutsByGroup(group.key)"
            :key="item.id"
          >
            <Separator
              v-if="i > 0"
              class="my-0.5"
            />
            <div
              class="flex items-center gap-3 py-1.5 px-1 rounded transition-opacity"
              :class="item.enabled ? 'opacity-100' : 'opacity-50'"
            >
              <!-- 启用/禁用开关（最左侧） -->
              <Switch
                :model-value="item.enabled"
                class="scale-75 shrink-0"
                @update:model-value="onEnabledChange(item.id, $event)"
              />

              <span class="text-sm text-muted-foreground min-w-0">{{ item.label }}</span>

              <div class="flex items-center gap-3 ml-auto">
                <!-- 全局注册（Checkbox） -->
                <label
                  v-if="item.supportsGlobal"
                  class="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0"
                  :class="!item.enabled ? 'pointer-events-none' : 'cursor-pointer'"
                >
                  <Checkbox
                    :model-value="item.global"
                    :disabled="!item.enabled"
                    class="scale-90"
                    @update:model-value="onGlobalChange(item.id, $event)"
                  />
                  <span>全局</span>
                </label>

                <!-- 快捷键显示/录制区域 -->
                <button
                  class="flex items-center gap-1 px-2 py-1 rounded border border-border bg-muted/50 hover:bg-muted transition-colors min-w-[80px] justify-center shrink-0"
                  :class="[
                    recordingId === item.id ? 'border-primary ring-1 ring-primary/30 bg-primary/5' : '',
                    !item.enabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                  ]"
                  :disabled="!item.enabled"
                  @click="startRecording(item.id)"
                >
                  <template v-if="recordingId === item.id">
                    <template v-if="recordedKeys.length > 0">
                      <Kbd
                        v-for="key in recordedKeys"
                        :key="key"
                        class="text-primary"
                      >{{ key }}</Kbd>
                    </template>
                    <span
                      v-else
                      class="text-xs text-muted-foreground"
                    >按下快捷键...</span>
                  </template>
                  <template v-else-if="item.accelerator">
                    <Kbd
                      v-for="key in acceleratorToParts(item.accelerator)"
                      :key="key"
                    >{{ key }}</Kbd>
                  </template>
                  <span
                    v-else
                    class="text-xs text-muted-foreground/50"
                  >未设置</span>
                </button>
              </div>
            </div>
          </template>
        </div>
      </TabsContent>
    </Tabs>

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
          <AlertDialogAction @click="confirmOverride">
            覆盖
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
