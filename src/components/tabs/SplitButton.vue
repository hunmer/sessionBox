<script setup lang="ts">
import { ref } from 'vue'
import {
  Check,
  Columns2,
  GripVertical,
  Square,
  Rows2,
  LayoutGrid,
  Save,
  Trash2
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useSplitStore } from '@/stores/split'
import type { SplitPresetType } from '@/types'

const splitStore = useSplitStore()
const showSaveInput = ref(false)
const schemeName = ref('')

const presets: Array<{ type: SplitPresetType; label: string; icon: any }> = [
  { type: '1', label: '一个', icon: Square },
  { type: '2h', label: '两个水平', icon: Columns2 },
  { type: '2v', label: '两个垂直', icon: Rows2 },
  { type: '3', label: '三个', icon: LayoutGrid },
  { type: '4', label: '四个', icon: LayoutGrid }
]

function handlePresetClick(type: SplitPresetType) {
  if (type === '1') {
    splitStore.resetToSingle()
  } else {
    splitStore.applyPreset(type)
  }
}

function handleSave() {
  const name = schemeName.value.trim()
  if (!name) return
  splitStore.saveScheme(name)
  schemeName.value = ''
  showSaveInput.value = false
}

function handleDeleteScheme(id: string) {
  splitStore.deleteScheme(id)
}

function toggleManualAdjust() {
  if (!splitStore.isSplitActive) return
  splitStore.setManualAdjustEnabled(!splitStore.manualAdjustEnabled)
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon-sm"
        class="h-7 w-7 rounded-full"
        title="分屏"
      >
        <Columns2 class="w-3.5 h-3.5" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      class="w-48"
    >
      <DropdownMenuItem
        v-for="preset in presets"
        :key="preset.type"
        class="cursor-pointer"
        @click="handlePresetClick(preset.type)"
      >
        <component
          :is="preset.icon"
          class="size-4 mr-2"
        />
        <span class="flex-1">{{ preset.label }}</span>
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem
        class="cursor-pointer"
        :disabled="!splitStore.isSplitActive"
        @click="toggleManualAdjust"
      >
        <GripVertical class="size-4 mr-2" />
        <span class="flex-1">切换分屏控制栏</span>
        <Check
          v-if="splitStore.manualAdjustEnabled"
          class="size-4 text-primary"
        />
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem
        class="cursor-pointer"
        @click="showSaveInput = true"
      >
        <Save class="size-4 mr-2" />
        <span class="flex-1">保存当前方案</span>
      </DropdownMenuItem>

      <div
        v-if="showSaveInput"
        class="flex items-center gap-1 px-2 py-1"
      >
        <Input
          v-model="schemeName"
          placeholder="方案名称"
          class="h-7 text-xs"
          @keydown.enter="handleSave"
          @keydown.escape="showSaveInput = false"
        />
        <Button
          size="sm"
          variant="ghost"
          class="h-7 px-2"
          @click="handleSave"
        >
          <Save class="size-3" />
        </Button>
      </div>

      <template v-if="splitStore.savedSchemes.length > 0">
        <DropdownMenuSeparator />
        <DropdownMenuItem
          v-for="scheme in splitStore.savedSchemes"
          :key="scheme.id"
          class="cursor-pointer"
          @click="splitStore.applyScheme(scheme.id)"
        >
          <LayoutGrid class="size-4 mr-2" />
          <span class="flex-1">{{ scheme.name }}</span>
          <Trash2
            class="size-3 text-muted-foreground hover:text-destructive"
            @click.stop="handleDeleteScheme(scheme.id)"
          />
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
