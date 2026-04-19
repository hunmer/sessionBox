<script setup lang="ts">
import { useAIProviderStore } from '@/stores/ai-provider'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const providerStore = useAIProviderStore()

function handleModelChange(value: string) {
  const [providerId, modelId] = value.split(':')
  if (providerId && modelId) {
    providerStore.selectProvider(providerId)
    providerStore.selectModel(modelId)
  }
}

function getCurrentValue(): string {
  if (providerStore.selectedProviderId && providerStore.selectedModelId) {
    return `${providerStore.selectedProviderId}:${providerStore.selectedModelId}`
  }
  return ''
}
</script>

<template>
  <Select
    :model-value="getCurrentValue()"
    @update:model-value="handleModelChange"
  >
    <SelectTrigger class="h-7 text-xs w-[180px]">
      <SelectValue placeholder="选择模型" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup
        v-for="provider in providerStore.providers.filter(p => p.enabled)"
        :key="provider.id"
      >
        <SelectLabel>{{ provider.name }}</SelectLabel>
        <SelectItem
          v-for="model in provider.models"
          :key="model.id"
          :value="`${provider.id}:${model.id}`"
          class="text-xs"
        >
          {{ model.name }}
          <span
            v-if="model.supportsVision"
            class="text-muted-foreground ml-1"
          >📷</span>
          <span
            v-if="model.supportsThinking"
            class="text-muted-foreground ml-1"
          >💭</span>
        </SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
</template>
