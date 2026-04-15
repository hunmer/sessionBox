<script setup lang="ts">
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useContainerStore } from '@/stores/container'
import { useWorkspaceStore } from '@/stores/workspace'

const containerStore = useContainerStore()
const workspaceStore = useWorkspaceStore()
</script>

<template>
  <h3 class="text-sm font-medium mb-3">外部链接</h3>
  <div class="space-y-4">
    <!-- 每次打开都询问 -->
    <div class="flex items-center justify-between">
      <div>
        <label class="text-xs text-muted-foreground">每次打开都询问</label>
        <p class="text-xs text-muted-foreground/60 mt-0.5">从外部打开链接时弹出容器选择对话框</p>
      </div>
      <Switch
        :model-value="containerStore.askContainerOnOpen"
        @update:model-value="containerStore.setAskContainerOnOpen($event)"
      />
    </div>

    <!-- 默认打开容器 -->
    <div>
      <label class="text-xs text-muted-foreground mb-1 block">默认打开容器</label>
      <Select
        :model-value="containerStore.defaultContainerId"
        @update:model-value="containerStore.setDefaultContainer($event)"
      >
        <SelectTrigger class="w-full">
          <SelectValue placeholder="选择容器" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="c in containerStore.containers" :key="c.id" :value="c.id">
            {{ c.icon }} {{ c.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- 默认打开工作区 -->
    <div>
      <label class="text-xs text-muted-foreground mb-1 block">默认打开工作区</label>
      <Select
        :model-value="containerStore.defaultWorkspaceId"
        @update:model-value="containerStore.setDefaultWorkspaceId($event)"
      >
        <SelectTrigger class="w-full">
          <SelectValue placeholder="选择工作区" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__default__">默认工作区</SelectItem>
          <SelectItem v-for="w in workspaceStore.sortedWorkspaces" :key="w.id" :value="w.id">
            {{ w.title }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
</template>
