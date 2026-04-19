<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import type { OutputField } from '@/lib/workflow/types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Bug, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight, Import, FileDown, Info, Braces } from 'lucide-vue-next'
import OutputFieldEditor from './OutputFieldEditor.vue'
import ConditionEditor from './ConditionEditor.vue'
import VariablePicker from './VariablePicker.vue'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

const store = useWorkflowStore()

const props = defineProps<{ embedded?: boolean }>()

const definition = computed(() => {
  if (!store.selectedNode) return null
  return getNodeDefinition(store.selectedNode.type)
})

const IconComponent = computed(() => {
  if (!definition.value) return null
  return resolveLucideIcon(definition.value.icon)
})

const isDebugging = computed(() => store.debugNodeStatus === 'running')
const outputExpanded = ref(true)
const outputsExpanded = ref(true)

/** 追踪哪些字段处于"文本/变量模式" */
const textModeKeys = ref<Set<string>>(new Set())

/** 判断字段是否为纯文本类型（无需切换） */
function isTextType(type: string): boolean {
  return type === 'text' || type === 'textarea' || type === 'code'
}

function toggleTextMode(key: string) {
  const next = new Set(textModeKeys.value)
  next.has(key) ? next.delete(key) : next.add(key)
  textModeKeys.value = next
}

// 导入对话框
const importDialogOpen = ref(false)
const importJson = ref('')
const importError = ref('')

function getFieldValue(key: string): any {
  return store.selectedNode?.data[key] ?? ''
}

function setFieldValue(key: string, value: any) {
  if (store.selectedNodeId) {
    store.updateNodeData(store.selectedNodeId, { [key]: value })
  }
}

/** 插入变量引用到指定字段 */
function insertVariable(propKey: string, variablePath: string) {
  const current = getFieldValue(propKey) || ''
  setFieldValue(propKey, current + variablePath)
}

/** 获取/设置节点输出字段 */
const nodeOutputs = computed<OutputField[]>({
  get: () => store.selectedNode?.data?.outputs ?? [],
  set: (val) => {
    if (store.selectedNodeId) {
      store.updateNodeData(store.selectedNodeId, { outputs: val })
    }
  },
})

async function handleDebug() {
  if (!store.selectedNodeId || isDebugging.value) return
  outputExpanded.value = true
  await store.debugSingleNode(store.selectedNodeId)
}

function formatOutput(value: any): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** 将任意值推断为 OutputField 类型 */
function inferType(value: any): OutputField['type'] {
  if (value === null || value === undefined) return 'any'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'object') return 'object'
  return 'any'
}

/** 将 JS 对象递归转换为 OutputField[] */
function toOutputFields(data: any): OutputField[] {
  if (typeof data !== 'object' || data === null) return []
  return Object.entries(data).map(([key, value]) => {
    const type = inferType(value)
    const field: OutputField = { key, type }
    if (type === 'object' && value !== null) {
      field.children = toOutputFields(value)
    } else {
      field.value = value !== undefined ? String(value) : ''
    }
    return field
  })
}

/** 从调试输出应用到输出字段 */
function applyDebugOutput() {
  const output = store.debugNodeResult?.output
  if (!output) return
  nodeOutputs.value = toOutputFields(output)
}

/** 打开导入对话框 */
function openImportDialog() {
  importJson.value = ''
  importError.value = ''
  importDialogOpen.value = true
}

/** 确认导入 */
function confirmImport() {
  importError.value = ''
  try {
    const parsed = JSON.parse(importJson.value)
    nodeOutputs.value = toOutputFields(parsed)
    importDialogOpen.value = false
  } catch {
    importError.value = 'JSON 格式不正确，请检查输入'
  }
}
</script>

<template>
  <div :class="[!props.embedded && 'border-l', 'border-border bg-background flex flex-col h-full']">
    <div
      v-if="!store.selectedNode || !definition"
      class="flex-1 flex items-center justify-center"
    >
      <p class="text-xs text-muted-foreground">
        点击节点查看属性
      </p>
    </div>

    <template v-else>
      <div class="flex items-center gap-2 p-3 border-b border-border">
        <component
          :is="IconComponent"
          v-if="IconComponent"
          class="w-4 h-4 text-muted-foreground"
        />
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium truncate">
            {{ definition.label }}
          </div>
          <div
            v-if="definition?.description"
            class="text-[10px] text-muted-foreground truncate"
          >
            {{ definition.description }}
          </div>
        </div>
      </div>

      <!-- 调试按钮 -->
      <div class="px-3 py-2 border-b border-border">
        <Button
          size="sm"
          variant="outline"
          class="w-full h-7 text-xs gap-1.5"
          :disabled="isDebugging"
          @click="handleDebug"
        >
          <Loader2
            v-if="isDebugging"
            class="w-3 h-3 animate-spin"
          />
          <Bug
            v-else
            class="w-3 h-3"
          />
          {{ isDebugging ? '执行中...' : '调试此节点' }}
        </Button>
      </div>

      <!-- 调试输出 -->
      <div
        v-if="store.debugNodeResult && store.selectedNodeId === store.debugNodeId"
        class="px-3 py-2 border-b border-border"
      >
        <!-- 状态 + 折叠 -->
        <button
          class="flex items-center gap-1.5 w-full text-left"
          @click="outputExpanded = !outputExpanded"
        >
          <component
            :is="outputExpanded ? ChevronDown : ChevronRight"
            class="w-3 h-3 text-muted-foreground shrink-0"
          />
          <CheckCircle2
            v-if="store.debugNodeResult.status === 'completed'"
            class="w-3 h-3 text-green-500 shrink-0"
          />
          <XCircle
            v-else
            class="w-3 h-3 text-red-500 shrink-0"
          />
          <span class="text-xs font-medium">
            {{ store.debugNodeResult.status === 'completed' ? '执行成功' : '执行失败' }}
          </span>
          <span class="text-[10px] text-muted-foreground ml-auto">
            {{ store.debugNodeResult.duration }}ms
          </span>
        </button>

        <div
          v-if="outputExpanded"
          class="mt-2 space-y-1.5"
        >
          <!-- 错误信息 -->
          <div
            v-if="store.debugNodeResult.error"
            class="rounded bg-red-500/10 p-2"
          >
            <p class="text-[11px] text-red-500 font-mono break-all">
              {{ store.debugNodeResult.error }}
            </p>
          </div>
          <!-- 输出结果 -->
          <div
            v-if="store.debugNodeResult.output !== undefined"
            class="rounded bg-muted p-2"
          >
            <pre class="text-[11px] font-mono text-foreground whitespace-pre-wrap break-all max-h-40 overflow-auto">{{ formatOutput(store.debugNodeResult.output) }}</pre>
          </div>
        </div>
      </div>

      <ScrollArea class="flex-1">
        <div class="p-3 space-y-3">
          <!-- 通用基础属性：延迟执行 -->
          <div
            v-if="store.selectedNode.type !== 'start' && store.selectedNode.type !== 'end'"
            class="space-y-1"
          >
            <label class="text-xs font-medium flex items-center gap-1">
              延迟执行
              <TooltipProvider :delay-duration="300">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Info class="w-3 h-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    class="max-w-[240px]"
                  >
                    <p>执行当前节点前等待的毫秒数，0 表示不延迟</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </label>
            <Input
              type="number"
              :model-value="getFieldValue('_delay') || 0"
              :min="0"
              :step="100"
              class="h-7 text-xs"
              placeholder="0"
              @update:model-value="setFieldValue('_delay', Number($event) || 0)"
            />
          </div>

          <div
            v-for="prop in definition.properties"
            :key="prop.key"
            class="space-y-1"
          >
            <label class="text-xs font-medium flex items-center gap-1">
              <span class="flex-1 flex items-center gap-1">
                {{ prop.label }}
                <span
                  v-if="prop.required"
                  class="text-red-500"
                >*</span>
                <TooltipProvider
                  v-if="prop.tooltip"
                  :delay-duration="300"
                >
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Info class="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent
                      side="right"
                      class="max-w-[240px]"
                    >
                      <p>{{ prop.tooltip }}</p>
                      <p class="text-[10px] opacity-60 mt-0.5">类型: {{ prop.type }}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
              <button
                v-if="!isTextType(prop.type)"
                type="button"
                class="p-0.5 rounded hover:bg-accent transition-colors"
                :class="textModeKeys.has(prop.key) ? 'text-primary' : 'text-muted-foreground'"
                title="切换变量模式"
                @click="toggleTextMode(prop.key)"
              >
                <Braces class="w-3.5 h-3.5" />
              </button>
            </label>

            <!-- 文本/变量模式：所有类型统一 Input + VariablePicker -->
            <div
              v-if="textModeKeys.has(prop.key) || isTextType(prop.type)"
              class="flex gap-1"
            >
              <Input
                :model-value="getFieldValue(prop.key)"
                :readonly="prop.readonly"
                :placeholder="prop.label"
                class="h-7 text-xs flex-1"
                @update:model-value="setFieldValue(prop.key, $event)"
              />
              <VariablePicker
                v-if="store.selectedNodeId"
                :exclude-node-id="store.selectedNodeId"
                @select="insertVariable(prop.key, $event)"
              />
            </div>

            <!-- 原生类型模式 -->
            <template v-else>
              <Input
                v-if="prop.type === 'number'"
                type="number"
                :model-value="getFieldValue(prop.key)"
                :readonly="prop.readonly"
                class="h-7 text-xs"
                @update:model-value="setFieldValue(prop.key, Number($event))"
              />

              <Select
                v-else-if="prop.type === 'select'"
                :model-value="getFieldValue(prop.key)"
                @update:model-value="setFieldValue(prop.key, $event)"
              >
                <SelectTrigger class="h-7 text-xs">
                  <SelectValue :placeholder="prop.label" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="opt in (prop.options || [])"
                    :key="opt.value"
                    :value="opt.value"
                    class="text-xs"
                  >
                    {{ opt.label }}
                  </SelectItem>
                </SelectContent>
              </Select>

              <div
                v-else-if="prop.type === 'checkbox'"
                class="flex items-center gap-2"
              >
                <Switch
                  :model-value="getFieldValue(prop.key)"
                  :disabled="prop.readonly"
                  @update:model-value="setFieldValue(prop.key, $event)"
                />
                <span class="text-xs text-muted-foreground">{{ prop.readonly ? '(只读)' : '' }}</span>
              </div>
            </template>
          </div>

          <div
            v-if="definition.properties.length === 0"
            class="text-xs text-muted-foreground text-center py-4"
          >
            该节点无配置参数
          </div>

          <!-- 条件编辑器（switch 节点） -->
          <ConditionEditor v-if="definition.type === 'switch'" />

          <!-- 输出字段编辑区 -->
          <div class="border-t border-border pt-3">
            <div class="flex items-center gap-1.5 mb-2">
              <button
                class="flex items-center gap-1.5 text-left flex-1"
                @click="outputsExpanded = !outputsExpanded"
              >
                <component
                  :is="outputsExpanded ? ChevronDown : ChevronRight"
                  class="w-3 h-3 text-muted-foreground shrink-0"
                />
                <span class="text-xs font-medium">输出字段</span>
              </button>
              <div class="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-5 px-1.5 text-[10px] gap-0.5 text-muted-foreground hover:text-foreground"
                  @click="openImportDialog"
                >
                  <Import class="w-3 h-3" />
                  导入
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-5 px-1.5 text-[10px] gap-0.5 text-muted-foreground hover:text-foreground"
                  :disabled="!store.debugNodeResult?.output"
                  @click="applyDebugOutput"
                >
                  <FileDown class="w-3 h-3" />
                  应用输出
                </Button>
              </div>
            </div>
            <div v-if="outputsExpanded">
              <OutputFieldEditor v-model="nodeOutputs" />
            </div>
          </div>
        </div>
      </ScrollArea>
    </template>

    <!-- 导入 JSON 对话框 -->
    <Dialog
      :open="importDialogOpen"
      @update:open="importDialogOpen = $event"
    >
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle class="text-sm">
            导入输出字段
          </DialogTitle>
        </DialogHeader>
        <div class="space-y-2">
          <p class="text-[11px] text-muted-foreground">
            粘贴 JSON 对象，将自动解析为输出字段结构
          </p>
          <Textarea
            v-model="importJson"
            placeholder="{&quot;key1&quot;: &quot;value1&quot;, &quot;key2&quot;: 123}"
            class="text-xs font-mono min-h-[160px]"
            @keydown.ctrl.enter="confirmImport"
          />
          <p
            v-if="importError"
            class="text-[11px] text-red-500"
          >
            {{ importError }}
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            class="h-7 text-xs"
            @click="importDialogOpen = false"
          >
            取消
          </Button>
          <Button
            size="sm"
            class="h-7 text-xs"
            :disabled="!importJson.trim()"
            @click="confirmImport"
          >
            确认导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
