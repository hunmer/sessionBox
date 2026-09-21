<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import draggable from 'vuedraggable'
import { Bug, CheckCheck, Circle, Copy, GripVertical, Highlighter, Pencil, Play, Plus, RefreshCw, Save, Square, Trash2, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import BrowserViewPicker from '@/components/chat/BrowserViewPicker.vue'
import { useChatUIStore } from '@/stores/chat-ui'

interface DebugTab { tabId: string; title: string; url: string; webContentsId: number; partition?: string }
interface ActionLocator { css?: string; text?: string; [key: string]: unknown }
interface ActionStep { id: string; type: string; url?: string; payload?: Record<string, unknown>; locator?: ActionLocator; [key: string]: unknown }
interface ActionRun { id: string; initialUrl: string; partition: string; startedAt: number; endedAt: number | null; steps: ActionStep[] }

const api = window.api.debugger
const chatUIStore = useChatUIStore()
const tabs = ref<DebugTab[]>([])
const targetTabId = ref<string | null>(null)
const activeMode = ref<'record' | 'edit'>('record')
const recording = ref(false)
const recordedSteps = ref<ActionStep[]>([])
const currentRun = ref<ActionRun | null>(null)
const selectedStepIds = ref<string[]>([])
const recordedTypeFilters = ref<string[]>([])
const highlightedStepId = ref<string | null>(null)
const editorSteps = ref<ActionStep[]>([])
const presetName = ref('')
const parameters = ref('{}')
const editDialogOpen = ref(false)
const editingStepIndex = ref(-1)
const editingStepType = ref('click')
const editingStepUrl = ref('')
const editingLocatorCss = ref('')
const editingLocatorText = ref('')
const editingPayload = ref('{}')
let removeStepListener: (() => void) | undefined
let highlightedWcId = 0
let highlightQueue = Promise.resolve()

const targetTab = computed(() => tabs.value.find(tab => tab.tabId === targetTabId.value) || null)
const targetWcId = computed(() => targetTab.value?.webContentsId || 0)
const recordedTypes = computed(() => [...new Set(recordedSteps.value.map(step => step.type))])
const filteredRecordedSteps = computed(() => recordedTypeFilters.value.length === 0
  ? recordedSteps.value
  : recordedSteps.value.filter(step => recordedTypeFilters.value.includes(step.type)))
const allRecordedSelected = computed(() => filteredRecordedSteps.value.length > 0 && filteredRecordedSteps.value.every(step => selectedStepIds.value.includes(step.id)))

function cloneStep(step: ActionStep): ActionStep {
  return JSON.parse(JSON.stringify(step)) as ActionStep
}

function newStepId(sourceId: string): string {
  return `${sourceId || 'step'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

async function refreshTabs() {
  tabs.value = await api.getTabs()
  if (!targetTabId.value || !tabs.value.some(tab => tab.tabId === targetTabId.value)) {
    targetTabId.value = tabs.value.find(tab => !tab.url?.startsWith('sessionbox://'))?.tabId || null
  }
}

async function startRecording() {
  if (!targetWcId.value) return toast.error('请选择录制页面')
  const injected = await api.injectActionRecorder(targetWcId.value)
  if (injected?.success === false) return toast.error(injected.error || '注入失败')
  recordedSteps.value = []
  selectedStepIds.value = []
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
  recordedSteps.value = currentRun.value?.steps || recordedSteps.value
}

function toggleRecordedStep(id: string, checked: boolean) {
  if (checked && !selectedStepIds.value.includes(id)) selectedStepIds.value.push(id)
  if (!checked) selectedStepIds.value = selectedStepIds.value.filter(item => item !== id)
}

function toggleRecordedType(type: string) {
  recordedTypeFilters.value = recordedTypeFilters.value.includes(type)
    ? recordedTypeFilters.value.filter(item => item !== type)
    : [...recordedTypeFilters.value, type]
}

function enqueueHighlight(command: () => Promise<unknown>) {
  highlightQueue = highlightQueue
    .catch(() => undefined)
    .then(command)
    .then(() => undefined)
    .catch(error => console.warn('[debugger] 元素高亮请求失败', error))
}

function clearStepHighlight() {
  const wcId = highlightedWcId
  highlightedWcId = 0
  highlightedStepId.value = null
  if (wcId) enqueueHighlight(() => api.highlightActionStep(wcId, null))
}

function applyStepHighlight(step: ActionStep) {
  if (highlightedStepId.value === step.id) {
    clearStepHighlight()
    return
  }
  if (!targetWcId.value) return toast.error('请选择要高亮的页面')
  if (!step.locator) return toast.error('该步骤没有元素定位信息')
  const wcId = targetWcId.value
  highlightedWcId = wcId
  highlightedStepId.value = step.id
  const plainStep = cloneStep(step)
  console.info('[debugger] 请求高亮录制步骤', { wcId, stepId: plainStep.id, type: plainStep.type, locator: plainStep.locator })
  enqueueHighlight(async () => {
    const result = await api.highlightActionStep(wcId, plainStep)
    console.info('[debugger] 高亮录制步骤结果', { wcId, stepId: plainStep.id, result })
    if (result?.success === false || !result?.found) {
      if (highlightedStepId.value === plainStep.id) highlightedStepId.value = null
      toast.error(result?.error || '未找到步骤对应的网页元素')
    }
  })
}

async function executeStep(step: ActionStep) {
  if (!targetWcId.value) return toast.error('请选择执行页面')
  let params: Record<string, unknown>
  try { params = JSON.parse(parameters.value || '{}') }
  catch { return toast.error('自定义参数必须是有效 JSON') }
  const plainStep = cloneStep(step)
  const now = Date.now()
  const run: ActionRun = {
    id: `run_step_${now}`,
    initialUrl: plainStep.url || targetTab.value?.url || '',
    partition: targetTab.value?.partition || 'default',
    startedAt: now,
    endedAt: now,
    steps: [plainStep]
  }
  console.info('[debugger] 执行单步', { wcId: targetWcId.value, stepId: plainStep.id, type: plainStep.type })
  const result = await api.playActionRun(targetWcId.value, replaceParameters(run, params))
  if (result?.success === false) return toast.error(result.error || '单步执行失败')
  toast.success('单步执行已开始')
}

function toggleAllRecorded() {
  const filteredIds = new Set(filteredRecordedSteps.value.map(step => step.id))
  selectedStepIds.value = allRecordedSelected.value
    ? selectedStepIds.value.filter(id => !filteredIds.has(id))
    : [...new Set([...selectedStepIds.value, ...filteredRecordedSteps.value.map(step => step.id)])]
}

async function clearRecordedSteps() {
  clearStepHighlight()
  if (targetWcId.value) {
    const result = await api.clearActionSteps(targetWcId.value)
    if (result?.success === false) return toast.error(result.error || '清空录制步骤失败')
  }
  recordedSteps.value = []
  selectedStepIds.value = []
  currentRun.value = null
  toast.success('录制步骤已清空')
}

function toggleRecording() {
  if (recording.value) void stopRecording()
  else void startRecording()
}

function addSelectedToEditor() {
  const selected = new Set(selectedStepIds.value)
  const additions = recordedSteps.value
    .filter(step => selected.has(step.id))
    .map(step => ({ ...cloneStep(step), id: newStepId(step.id) }))
  if (!additions.length) return toast.error('请先选择要添加的步骤')
  editorSteps.value.push(...additions)
  selectedStepIds.value = []
  activeMode.value = 'edit'
  toast.success(`已添加 ${additions.length} 个步骤`)
}

function copyEditorStep(index: number) {
  const copy = cloneStep(editorSteps.value[index])
  copy.id = newStepId(copy.id)
  editorSteps.value.splice(index + 1, 0, copy)
}

function removeEditorStep(index: number) {
  editorSteps.value.splice(index, 1)
}

function openStepEditor(index: number) {
  const step = editorSteps.value[index]
  editingStepIndex.value = index
  editingStepType.value = step.type
  editingStepUrl.value = step.url || ''
  editingLocatorCss.value = step.locator?.css || ''
  editingLocatorText.value = step.locator?.text || ''
  editingPayload.value = JSON.stringify(step.payload || {}, null, 2)
  editDialogOpen.value = true
}

function applyStepEdit() {
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(editingPayload.value || '{}')
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error()
  } catch {
    return toast.error('Payload 必须是有效的 JSON 对象')
  }
  const step = editorSteps.value[editingStepIndex.value]
  if (!step) return
  step.type = editingStepType.value
  step.url = editingStepUrl.value
  step.payload = payload
  step.locator = {
    ...(step.locator || {}),
    css: editingLocatorCss.value,
    text: editingLocatorText.value,
  }
  editDialogOpen.value = false
}

function buildEditorRun(): ActionRun {
  const now = Date.now()
  return {
    id: currentRun.value?.id || `run_${now}`,
    initialUrl: currentRun.value?.initialUrl || targetTab.value?.url || '',
    partition: currentRun.value?.partition || targetTab.value?.partition || 'default',
    startedAt: currentRun.value?.startedAt || now,
    endedAt: now,
    steps: editorSteps.value.map(cloneStep),
  }
}

async function saveRun() {
  if (!editorSteps.value.length) return toast.error('编辑列表为空')
  if (!presetName.value.trim()) return toast.error('请输入方案名称')
  const toastId = toast.loading('正在保存录制方案...')
  console.info('[debugger] 开始保存录制方案', { name: presetName.value, stepCount: editorSteps.value.length })
  try {
    const result = await api.saveActionPreset(presetName.value, buildEditorRun())
    console.info('[debugger] 保存录制方案结果', result)
    if (result?.success !== true) return toast.error(result?.error || '保存失败', { id: toastId })
    toast.success(`录制方案“${presetName.value.trim()}”已保存`, { id: toastId, duration: 3000 })
  } catch (error) {
    console.error('[debugger] 保存录制方案异常', error)
    toast.error(`保存失败：${error instanceof Error ? error.message : String(error)}`, { id: toastId })
  }
}

function replaceParameters<T>(value: T, params: Record<string, unknown>): T {
  if (typeof value === 'string') return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, key) => String(params[key] ?? _m)) as T
  if (Array.isArray(value)) return value.map(item => replaceParameters(item, params)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceParameters(item, params)])) as T
  return value
}

async function playRun() {
  if (!editorSteps.value.length || !targetWcId.value) return toast.error('编辑列表为空或未选择执行页面')
  let params: Record<string, unknown>
  try { params = JSON.parse(parameters.value || '{}') }
  catch { return toast.error('自定义参数必须是有效 JSON') }
  const result = await api.playActionRun(targetWcId.value, replaceParameters(buildEditorRun(), params))
  if (result?.success === false) return toast.error(result.error || '执行失败')
  toast.success('录制方案已开始执行')
}

onMounted(async () => {
  await refreshTabs()
  removeStepListener = api.onActionStep((step: ActionStep) => recordedSteps.value.push(step))
})
watch([targetTabId, activeMode], clearStepHighlight)
onBeforeUnmount(() => {
  removeStepListener?.()
  clearStepHighlight()
  if (recording.value && targetWcId.value) void api.stopActionRecord(targetWcId.value)
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <header class="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <Bug class="h-4 w-4 text-primary" />
      <h1 class="min-w-0 flex-1 truncate text-sm font-semibold">网页调试与录制</h1>
      <Badge v-if="recording" variant="destructive" class="h-5 shrink-0 gap-1 px-1.5 text-[10px]"><Circle class="h-2 w-2 fill-current" />录制中</Badge>
      <Button variant="ghost" size="icon" class="h-8 w-8" title="刷新页面列表" @click="refreshTabs"><RefreshCw class="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" class="h-8 w-8" title="关闭调试面板" @click="chatUIStore.toggleDebuggerPanel()"><X class="h-4 w-4" /></Button>
    </header>

    <Tabs v-model="activeMode" class="flex min-h-0 flex-1 flex-col">
      <TabsList class="mx-3 mt-3 grid h-8 shrink-0 grid-cols-2 p-0.5">
        <TabsTrigger value="record" class="text-xs">录制</TabsTrigger>
        <TabsTrigger value="edit" class="gap-1 text-xs">编辑<Badge variant="secondary" class="h-4 px-1 text-[9px]">{{ editorSteps.length }}</Badge></TabsTrigger>
      </TabsList>

      <TabsContent value="record" class="mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
        <div class="space-y-2 border-b px-3 pb-3">
          <div class="flex min-w-0 items-center gap-2">
            <BrowserViewPicker v-model="targetTabId" exclude-internal trigger-class="h-9 min-w-0 flex-1" />
            <Button
              :variant="recording ? 'destructive' : 'default'"
              size="sm"
              class="h-9 shrink-0 gap-1.5 px-2.5"
              :disabled="!recording && !targetWcId"
              :title="recording ? '停止录制' : '开始录制'"
              @click="toggleRecording"
            >
              <Square v-if="recording" class="h-3.5 w-3.5" />
              <Circle v-else class="h-3.5 w-3.5" />
              {{ recording ? '停止' : '录制' }}
            </Button>
          </div>
          <div class="flex min-w-0 items-start gap-2">
            <div class="flex min-w-0 flex-1 flex-wrap gap-1">
              <Button size="sm" :variant="recordedTypeFilters.length === 0 ? 'default' : 'outline'" class="h-7 px-2 text-[10px]" @click="recordedTypeFilters = []">全部</Button>
              <Button v-for="type in recordedTypes" :key="type" size="sm" :variant="recordedTypeFilters.includes(type) ? 'default' : 'outline'" class="h-7 px-2 text-[10px]" @click="toggleRecordedType(type)">{{ type }}</Button>
            </div>
            <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" :disabled="!recordedSteps.length" title="清空录制步骤" @click="clearRecordedSteps"><Trash2 class="h-3.5 w-3.5" /></Button>
            <span class="mt-1.5 shrink-0 text-[10px] text-muted-foreground">{{ filteredRecordedSteps.length }}/{{ recordedSteps.length }}</span>
          </div>
        </div>

        <ScrollArea class="min-h-0 flex-1">
          <div class="p-3">
            <div v-if="!recordedSteps.length" class="flex h-40 items-center justify-center border border-dashed px-5 text-center text-xs text-muted-foreground">选择目标页面并开始录制，操作步骤会实时显示在这里</div>
            <div v-else-if="!filteredRecordedSteps.length" class="flex h-32 items-center justify-center border border-dashed px-5 text-center text-xs text-muted-foreground">当前类型暂无步骤</div>
            <label v-for="step in filteredRecordedSteps" :key="step.id" class="group flex min-w-0 cursor-pointer items-start gap-2 border-b py-2.5">
              <Checkbox :model-value="selectedStepIds.includes(step.id)" class="mt-0.5" @update:model-value="toggleRecordedStep(step.id, $event === true)" />
              <span class="w-5 shrink-0 text-right text-[10px] text-muted-foreground">{{ recordedSteps.indexOf(step) + 1 }}</span>
              <Badge variant="outline" class="h-5 shrink-0 px-1.5 text-[10px]">{{ step.type }}</Badge>
              <div class="min-w-0 flex-1"><div class="truncate text-xs">{{ step.locator?.text || step.locator?.css || step.url || '页面操作' }}</div><div v-if="step.payload" class="mt-1 truncate font-mono text-[10px] text-muted-foreground">{{ JSON.stringify(step.payload) }}</div></div>
              <Button type="button" variant="ghost" size="icon" class="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" title="执行此步骤" @click.stop.prevent="executeStep(step)"><Play class="h-3.5 w-3.5" /></Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="h-7 w-7 shrink-0 transition-opacity"
                :class="highlightedStepId === step.id ? 'text-amber-500 opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'"
                :disabled="!step.locator"
                :title="highlightedStepId === step.id ? '取消元素高亮' : '高亮网页元素'"
                @click.stop.prevent="applyStepHighlight(step)"
              >
                <Highlighter class="h-3.5 w-3.5" />
              </Button>
            </label>
          </div>
        </ScrollArea>
        <div class="z-10 mx-3 mb-3 flex shrink-0 items-center gap-2 rounded-md border bg-background/95 p-2 shadow-lg backdrop-blur">
          <Button variant="outline" size="sm" class="min-w-0 flex-1" :disabled="!filteredRecordedSteps.length" @click="toggleAllRecorded"><CheckCheck class="h-3.5 w-3.5" />{{ allRecordedSelected ? '取消全选' : '全选' }}</Button>
          <Button size="sm" class="min-w-0 flex-1" :disabled="!selectedStepIds.length" @click="addSelectedToEditor"><Plus class="h-3.5 w-3.5" />添加{{ selectedStepIds.length ? ` ${selectedStepIds.length}` : '' }}</Button>
        </div>
      </TabsContent>

      <TabsContent value="edit" class="mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
        <div class="flex gap-2 border-b px-3 pb-3">
          <Input v-model="presetName" class="h-9 min-w-0 flex-1" placeholder="方案名称" />
          <Button variant="outline" size="icon" class="h-9 w-9 shrink-0" title="保存方案" :disabled="!editorSteps.length" @click="saveRun"><Save class="h-4 w-4" /></Button>
        </div>

        <ScrollArea class="min-h-0 flex-1">
          <div class="p-3">
            <div v-if="!editorSteps.length" class="flex h-40 items-center justify-center border border-dashed px-5 text-center text-xs text-muted-foreground">在“录制”中选择步骤并添加到这里</div>
            <draggable v-model="editorSteps" item-key="id" handle=".drag-handle" :animation="150" class="min-w-0">
              <template #item="{ element: step, index }">
                <div class="group flex min-w-0 items-start gap-1 border-b py-2.5">
                  <button class="drag-handle mt-0.5 shrink-0 cursor-grab p-0.5 text-muted-foreground active:cursor-grabbing" title="拖拽排序"><GripVertical class="h-3.5 w-3.5" /></button>
                  <span class="mt-1 w-4 shrink-0 text-right text-[10px] text-muted-foreground">{{ index + 1 }}</span>
                  <div class="min-w-0 flex-1 pl-1">
                    <div class="flex min-w-0 items-center gap-1.5"><Badge variant="outline" class="h-5 shrink-0 px-1.5 text-[10px]">{{ step.type }}</Badge><span class="truncate text-xs">{{ step.locator?.text || step.locator?.css || step.url || '页面操作' }}</span></div>
                    <div v-if="step.payload" class="mt-1 truncate font-mono text-[10px] text-muted-foreground">{{ JSON.stringify(step.payload) }}</div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" class="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" title="执行此步骤" @click.stop.prevent="executeStep(step)"><Play class="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" title="编辑步骤" @click="openStepEditor(index)"><Pencil class="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0" title="复制步骤" @click="copyEditorStep(index)"><Copy class="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0 text-destructive" title="删除步骤" @click="removeEditorStep(index)"><Trash2 class="h-3.5 w-3.5" /></Button>
                </div>
              </template>
            </draggable>
          </div>
        </ScrollArea>

        <footer class="shrink-0 space-y-2 border-t p-3">
          <Button class="w-full" :disabled="!editorSteps.length || !targetWcId" @click="playRun"><Play class="h-4 w-4" />执行编辑方案</Button>
        </footer>
      </TabsContent>
    </Tabs>

    <Dialog v-model:open="editDialogOpen">
      <DialogContent class="max-h-[85vh] w-[calc(100vw-32px)] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>编辑步骤</DialogTitle></DialogHeader>
        <div class="space-y-3">
          <div class="space-y-1"><label class="text-xs font-medium">动作类型</label><Select v-model="editingStepType"><SelectTrigger class="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="type in ['click', 'input', 'change', 'scroll', 'keydown', 'hover', 'file', 'navigate']" :key="type" :value="type">{{ type }}</SelectItem></SelectContent></Select></div>
          <div class="space-y-1"><label class="text-xs font-medium">页面 URL</label><Input v-model="editingStepUrl" /></div>
          <div class="space-y-1"><label class="text-xs font-medium">CSS 定位器</label><Input v-model="editingLocatorCss" class="font-mono text-xs" /></div>
          <div class="space-y-1"><label class="text-xs font-medium">文本定位器</label><Input v-model="editingLocatorText" /></div>
          <div class="space-y-1"><label class="text-xs font-medium">Payload JSON</label><Textarea v-model="editingPayload" class="min-h-32 font-mono text-xs" /></div>
        </div>
        <DialogFooter><Button variant="outline" @click="editDialogOpen = false">取消</Button><Button @click="applyStepEdit">保存修改</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
