<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Bug, Circle, Play, Save, Square, Trash2, RefreshCw } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface DebugTab { tabId: string; title: string; url: string; webContentsId: number }
interface ActionStep { id: string; type: string; url?: string; payload?: Record<string, unknown>; locator?: { css?: string; text?: string } }
interface ActionRun { id: string; initialUrl: string; partition: string; startedAt: number; endedAt: number | null; steps: ActionStep[] }
interface Preset { id: string; name: string; stepCount: number; initialUrl?: string; updatedAt: number }

const api = window.api.debugger
const tabs = ref<DebugTab[]>([])
const targetId = ref('')
const recording = ref(false)
const steps = ref<ActionStep[]>([])
const currentRun = ref<ActionRun | null>(null)
const presets = ref<Preset[]>([])
const presetName = ref('')
const selectedPresetId = ref('')
const parameters = ref('{}')
let removeStepListener: (() => void) | undefined

const targetWcId = computed(() => Number(targetId.value) || 0)

async function refreshTabs() {
  tabs.value = await api.getTabs()
  if (!targetId.value && tabs.value.length) targetId.value = String(tabs.value[0].webContentsId)
}

async function refreshPresets() { presets.value = await api.listActionPresets() }

async function startRecording() {
  if (!targetWcId.value) return toast.error('请选择录制页面')
  const injected = await api.injectActionRecorder(targetWcId.value)
  if (injected?.success === false) return toast.error(injected.error || '注入失败')
  steps.value = []
  currentRun.value = null
  const result = await api.startActionRecord(targetWcId.value)
  if (result?.success === false) return toast.error(result.error || '开始录制失败')
  recording.value = true
}

async function stopRecording() {
  const result = await api.stopActionRecord(targetWcId.value)
  recording.value = false
  if (result?.success === false) return toast.error(result.error || '停止录制失败')
  currentRun.value = result.run || await api.getActionRun(targetWcId.value)
  steps.value = currentRun.value?.steps || steps.value
}

async function saveRun() {
  if (!currentRun.value || !currentRun.value.steps.length) return toast.error('没有可保存的录制')
  if (!presetName.value.trim()) return toast.error('请输入录制名称')
  const result = selectedPresetId.value
    ? await api.updateActionPreset(selectedPresetId.value, { name: presetName.value, steps: currentRun.value.steps, initialUrl: currentRun.value.initialUrl })
    : await api.saveActionPreset(presetName.value, currentRun.value)
  if (result?.success === false) return toast.error(result.error || '保存失败')
  toast.success(selectedPresetId.value ? '录制已更新' : '录制已保存')
  await refreshPresets()
}

async function selectPreset(id: string) {
  const result = await api.loadActionPreset(id)
  if (!result?.success) return toast.error(result?.error || '读取失败')
  selectedPresetId.value = id
  presetName.value = result.item.name
  currentRun.value = result.run
  steps.value = result.run.steps
}

function replaceParameters<T>(value: T, params: Record<string, unknown>): T {
  if (typeof value === 'string') return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, key) => String(params[key] ?? _m)) as T
  if (Array.isArray(value)) return value.map(item => replaceParameters(item, params)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceParameters(item, params)])) as T
  return value
}

async function playRun() {
  if (!currentRun.value || !targetWcId.value) return toast.error('请选择录制和执行页面')
  let params: Record<string, unknown>
  try { params = JSON.parse(parameters.value || '{}') }
  catch { return toast.error('自定义参数必须是有效 JSON') }
  const result = await api.playActionRun(targetWcId.value, replaceParameters(currentRun.value, params))
  if (result?.success === false) return toast.error(result.error || '执行失败')
  toast.success('录制已开始执行')
}

async function deletePreset() {
  if (!selectedPresetId.value) return
  const result = await api.deleteActionPreset(selectedPresetId.value)
  if (result?.success === false) return toast.error(result.error || '删除失败')
  selectedPresetId.value = ''
  presetName.value = ''
  currentRun.value = null
  steps.value = []
  await refreshPresets()
  toast.success('录制已删除')
}

onMounted(async () => {
  await Promise.all([refreshTabs(), refreshPresets()])
  removeStepListener = api.onActionStep((step: ActionStep) => steps.value.push(step))
})
onBeforeUnmount(() => removeStepListener?.())
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <header class="flex h-12 shrink-0 items-center gap-3 border-b px-4">
      <Bug class="h-4 w-4 text-primary" />
      <h1 class="text-sm font-semibold">网页调试与录制</h1>
      <Badge v-if="recording" variant="destructive" class="gap-1"><Circle class="h-2 w-2 fill-current" />录制中</Badge>
      <Button variant="ghost" size="icon" class="ml-auto h-8 w-8" title="刷新页面列表" @click="refreshTabs"><RefreshCw class="h-4 w-4" /></Button>
    </header>

    <div class="flex min-h-0 flex-1">
      <aside class="flex w-72 shrink-0 flex-col border-r">
        <div class="space-y-3 border-b p-3">
          <Select v-model="targetId">
            <SelectTrigger class="h-9"><SelectValue placeholder="选择目标页面" /></SelectTrigger>
            <SelectContent><SelectItem v-for="tab in tabs" :key="tab.webContentsId" :value="String(tab.webContentsId)">{{ tab.title }}</SelectItem></SelectContent>
          </Select>
          <div class="flex gap-2">
            <Button class="flex-1" size="sm" :disabled="recording || !targetId" @click="startRecording"><Circle class="h-3.5 w-3.5" />开始录制</Button>
            <Button variant="destructive" size="sm" :disabled="!recording" @click="stopRecording"><Square class="h-3.5 w-3.5" />停止</Button>
          </div>
        </div>
        <div class="flex items-center justify-between px-3 py-2 text-xs font-medium"><span>已保存录制</span><Badge variant="secondary">{{ presets.length }}</Badge></div>
        <ScrollArea class="min-h-0 flex-1">
          <button v-for="item in presets" :key="item.id" class="block w-full border-b px-3 py-2 text-left hover:bg-muted/60" :class="selectedPresetId === item.id ? 'bg-muted' : ''" @click="selectPreset(item.id)">
            <div class="truncate text-xs font-medium">{{ item.name }}</div>
            <div class="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{{ item.stepCount }} 步</span><span>{{ new Date(item.updatedAt).toLocaleString() }}</span></div>
          </button>
          <div v-if="!presets.length" class="p-6 text-center text-xs text-muted-foreground">暂无已保存录制</div>
        </ScrollArea>
      </aside>

      <main class="flex min-w-0 flex-1 flex-col">
        <div class="grid grid-cols-[minmax(180px,1fr)_auto_auto] gap-2 border-b p-3">
          <Input v-model="presetName" class="h-9" placeholder="录制名称" />
          <Button variant="outline" size="sm" :disabled="!currentRun" @click="saveRun"><Save class="h-4 w-4" />{{ selectedPresetId ? '更新' : '保存' }}</Button>
          <Button variant="ghost" size="icon" class="h-9 w-9" title="删除录制" :disabled="!selectedPresetId" @click="deletePreset"><Trash2 class="h-4 w-4 text-destructive" /></Button>
        </div>
        <ScrollArea class="min-h-0 flex-1">
          <div class="mx-auto max-w-4xl p-4">
            <div v-if="!steps.length" class="flex h-48 items-center justify-center border border-dashed text-sm text-muted-foreground">开始录制页面操作，或从左侧选择已有录制</div>
            <div v-for="(step, index) in steps" :key="step.id" class="flex gap-3 border-b px-2 py-3 text-sm">
              <span class="w-7 shrink-0 text-right text-xs text-muted-foreground">{{ index + 1 }}</span>
              <Badge variant="outline" class="h-5">{{ step.type }}</Badge>
              <div class="min-w-0 flex-1"><div class="truncate text-xs">{{ step.locator?.text || step.locator?.css || step.url || '页面操作' }}</div><div v-if="step.payload" class="mt-1 truncate font-mono text-[10px] text-muted-foreground">{{ JSON.stringify(step.payload) }}</div></div>
            </div>
          </div>
        </ScrollArea>
        <footer class="flex shrink-0 items-center gap-2 border-t p-3">
          <Input v-model="parameters" class="h-9 flex-1 font-mono text-xs" placeholder='执行参数 JSON，例如 {"keyword":"测试"}' />
          <Button :disabled="!currentRun || !targetId" @click="playRun"><Play class="h-4 w-4" />执行录制</Button>
        </footer>
      </main>
    </div>
  </div>
</template>
