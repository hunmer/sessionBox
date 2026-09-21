<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAIProviderStore } from '@/stores/ai-provider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { InputGroupButton } from '@/components/ui/input-group'
import { Check, ChevronDown } from 'lucide-vue-next'

const providerStore = useAIProviderStore()
const open = ref(false)

const enabledProviders = computed(() => providerStore.providers.filter((p) => p.enabled))

function isSelected(providerId: string, modelId: string): boolean {
  return providerStore.selectedProviderId === providerId
    && providerStore.selectedModelId === modelId
}

function selectModel(providerId: string, modelId: string) {
  providerStore.selectProvider(providerId)
  providerStore.selectModel(modelId)
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <InputGroupButton
        variant="ghost"
        size="xs"
        class="gap-1"
      >
        <span class="max-w-[140px] truncate">{{ providerStore.currentModel?.name || '选择模型' }}</span>
        <ChevronDown class="size-3.5 opacity-50" />
      </InputGroupButton>
    </PopoverTrigger>
    <PopoverContent
      side="top"
      align="start"
      class="w-64 max-h-80 overflow-y-auto p-1"
    >
      <template
        v-for="provider in enabledProviders"
        :key="provider.id"
      >
        <div class="px-2 py-1.5 text-xs text-muted-foreground">
          {{ provider.name }}
        </div>
        <button
          v-for="model in provider.models"
          :key="model.id"
          class="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground"
          @click="selectModel(provider.id, model.id)"
        >
          <Check
            class="size-3.5 shrink-0"
            :class="isSelected(provider.id, model.id) ? 'opacity-100' : 'opacity-0'"
          />
          <span class="truncate">{{ model.name }}</span>
        </button>
      </template>
      <div
        v-if="!enabledProviders.length"
        class="px-2 py-4 text-center text-xs text-muted-foreground"
      >
        暂无可用模型
      </div>
    </PopoverContent>
  </Popover>
</template>
