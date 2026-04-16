<script setup lang="ts">
import { computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { resolveLucideIcon } from '@/lib/lucide-resolver'
import { Bug, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-vue-next'
import { ref } from 'vue'

const store = useWorkflowStore()

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

function getFieldValue(key: string): any {
  return store.selectedNode?.data[key] ?? ''
}

function setFieldValue(key: string, value: any) {
  if (store.selectedNodeId) {
    store.updateNodeData(store.selectedNodeId, { [key]: value })
  }
}

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
</script>

<template>
  <div class="w-64 border-l border-border bg-background flex flex-col h-full">
    <div v-if="!store.selectedNode || !definition" class="flex-1 flex items-center justify-center">
      <p class="text-xs text-muted-foreground">点击节点查看属性</p>
    </div>

    <template v-else>
      <div class="flex items-center gap-2 p-3 border-b border-border">
        <component :is="IconComponent" v-if="IconComponent" class="w-4 h-4 text-muted-foreground" />
        <div class="min-w-0 flex-1">
          <div class="text-sm font-medium truncate">{{ definition.label }}</div>
          <div v-if="definition?.description" class="text-[10px] text-muted-foreground truncate">
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
          <Loader2 v-if="isDebugging" class="w-3 h-3 animate-spin" />
          <Bug v-else class="w-3 h-3" />
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
          <XCircle v-else class="w-3 h-3 text-red-500 shrink-0" />
          <span class="text-xs font-medium">
            {{ store.debugNodeResult.status === 'completed' ? '执行成功' : '执行失败' }}
          </span>
          <span class="text-[10px] text-muted-foreground ml-auto">
            {{ store.debugNodeResult.duration }}ms
          </span>
        </button>

        <div v-if="outputExpanded" class="mt-2 space-y-1.5">
          <!-- 错误信息 -->
          <div v-if="store.debugNodeResult.error" class="rounded bg-red-500/10 p-2">
            <p class="text-[11px] text-red-500 font-mono break-all">{{ store.debugNodeResult.error }}</p>
          </div>
          <!-- 输出结果 -->
          <div v-if="store.debugNodeResult.output !== undefined" class="rounded bg-muted p-2">
            <pre class="text-[11px] font-mono text-foreground whitespace-pre-wrap break-all max-h-40 overflow-auto">{{ formatOutput(store.debugNodeResult.output) }}</pre>
          </div>
        </div>
      </div>

      <ScrollArea class="flex-1">
        <div class="p-3 space-y-3">
          <div v-for="prop in definition.properties" :key="prop.key" class="space-y-1">
            <label class="text-xs font-medium">
              {{ prop.label }}
              <span v-if="prop.required" class="text-red-500">*</span>
            </label>

            <p v-if="prop.description" class="text-[10px] text-muted-foreground">
              {{ prop.description }}
            </p>

            <Input
              v-if="prop.type === 'text'"
              :model-value="getFieldValue(prop.key)"
              :readonly="prop.readonly"
              :placeholder="prop.label"
              class="h-7 text-xs"
              @update:model-value="setFieldValue(prop.key, $event)"
            />

            <Textarea
              v-else-if="prop.type === 'textarea'"
              :model-value="getFieldValue(prop.key)"
              :readonly="prop.readonly"
              :placeholder="prop.label"
              class="text-xs min-h-[60px]"
              @update:model-value="setFieldValue(prop.key, $event)"
            />

            <Textarea
              v-else-if="prop.type === 'code'"
              :model-value="getFieldValue(prop.key)"
              :readonly="prop.readonly"
              placeholder="// JavaScript code"
              class="text-xs font-mono min-h-[120px]"
              @update:model-value="setFieldValue(prop.key, $event)"
            />

            <Input
              v-else-if="prop.type === 'number'"
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
                <SelectItem v-for="opt in (prop.options || [])" :key="opt.value" :value="opt.value" class="text-xs">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>

            <div v-else-if="prop.type === 'checkbox'" class="flex items-center gap-2">
              <Switch
                :checked="getFieldValue(prop.key)"
                :disabled="prop.readonly"
                @update:checked="setFieldValue(prop.key, $event)"
              />
              <span class="text-xs text-muted-foreground">{{ prop.readonly ? '(只读)' : '' }}</span>
            </div>
          </div>

          <div v-if="definition.properties.length === 0" class="text-xs text-muted-foreground text-center py-4">
            该节点无配置参数
          </div>
        </div>
      </ScrollArea>
    </template>
  </div>
</template>
