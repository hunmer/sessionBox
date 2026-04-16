<script setup lang="ts">
import { computed } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'
import { getNodeDefinition } from '@/lib/workflow/nodeRegistry'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { resolveLucideIcon } from '@/lib/lucide-resolver'

const store = useWorkflowStore()

const definition = computed(() => {
  if (!store.selectedNode) return null
  return getNodeDefinition(store.selectedNode.type)
})

const IconComponent = computed(() => {
  if (!definition.value) return null
  return resolveLucideIcon(definition.value.icon)
})

function getFieldValue(key: string): any {
  return store.selectedNode?.data[key] ?? ''
}

function setFieldValue(key: string, value: any) {
  if (store.selectedNodeId) {
    store.updateNodeData(store.selectedNodeId, { [key]: value })
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
        <div>
          <div class="text-sm font-medium">{{ definition.label }}</div>
          <div v-if="description" class="text-[10px] text-muted-foreground">
            {{ definition.description }}
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
