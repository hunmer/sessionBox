<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Input } from '@/components/ui/input'
import { Snowflake } from 'lucide-vue-next'

const api = window.api

const enabled = ref(false)
const minutes = ref(30)

// 预设选项
const presets = [
  { label: '5 分钟', value: 5 },
  { label: '10 分钟', value: 10 },
  { label: '30 分钟', value: 30 },
  { label: '60 分钟', value: 60 }
]

onMounted(async () => {
  const val = await api.settings.getTabFreezeMinutes()
  minutes.value = val || 30
  enabled.value = val > 0
})

async function apply() {
  const val = enabled.value ? minutes.value : 0
  await api.settings.setTabFreezeMinutes(val)
}

function toggleEnabled() {
  enabled.value = !enabled.value
  apply()
}

function selectPreset(val: number) {
  minutes.value = val
  if (enabled.value) apply()
}

function onInputBlur() {
  if (minutes.value < 1) minutes.value = 1
  if (enabled.value) apply()
}
</script>

<template>
  <h3 class="text-sm font-medium mb-3 flex items-center gap-2">
    <Snowflake class="w-4 h-4" />
    冻结标签
  </h3>
  <p class="text-xs text-muted-foreground mb-4">
    未激活的标签页在指定时间后自动冻结，释放系统资源。冻结后点击标签可自动恢复。
  </p>

  <div class="space-y-4">
    <!-- 开关 -->
    <div class="flex items-center justify-between">
      <label class="text-xs text-muted-foreground">启用自动冻结</label>
      <button
        role="switch"
        :aria-checked="enabled"
        class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
        :class="enabled ? 'bg-primary' : 'bg-input'"
        @click="toggleEnabled"
      >
        <span
          class="pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform"
          :class="enabled ? 'translate-x-4' : 'translate-x-0'"
        />
      </button>
    </div>

    <!-- 时间设置 -->
    <template v-if="enabled">
      <div>
        <label class="text-xs text-muted-foreground mb-2 block">未激活冻结时间</label>
        <div class="flex flex-wrap gap-2 mb-3">
          <button
            v-for="opt in presets"
            :key="opt.value"
            class="text-xs px-3 py-1.5 rounded-md border transition-colors"
            :class="minutes === opt.value
              ? 'bg-primary/10 text-primary border-primary/30 font-medium'
              : 'text-muted-foreground border-border hover:bg-muted/50'"
            @click="selectPreset(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
        <div class="flex items-center gap-2">
          <Input
            v-model.number="minutes"
            type="number"
            min="1"
            class="w-24"
            @blur="onInputBlur"
          />
          <span class="text-xs text-muted-foreground">分钟</span>
        </div>
      </div>
    </template>
  </div>
</template>
