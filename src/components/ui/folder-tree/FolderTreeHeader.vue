<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Plus, Search } from 'lucide-vue-next'

const props = defineProps<{ title: string }>()

/** 搜索框开关（v-model:show-search） */
const showSearch = defineModel<boolean>('showSearch', { default: false })
/** 搜索词（v-model:query），关闭搜索框时自动清空 */
const query = defineModel<string>('query', { default: '' })

/* ---- 搜索框展开两态：mounted 控制渲染，expanded 控制 grid-rows 过渡（同源） ---- */
const searchMounted = ref(showSearch.value)
const searchExpanded = ref(showSearch.value)
const inputRef = ref<HTMLInputElement | null>(null)
let raf = 0
let timer = 0

watch(showSearch, (value) => {
  if (value) {
    searchMounted.value = true
    cancelAnimationFrame(raf)
    window.clearTimeout(timer)
    // 双 rAF：先以 0fr 挂载，再切 1fr 触发高度过渡，随后聚焦
    raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        searchExpanded.value = true
        inputRef.value?.focus()
      })
    })
  } else {
    searchExpanded.value = false
    cancelAnimationFrame(raf)
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      searchMounted.value = false
      query.value = ''
    }, 300)
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.clearTimeout(timer)
})
</script>

<template>
  <div class="ft-header">
    <h2 class="ft-title">{{ props.title }}</h2>
    <div class="ft-header-actions">
      <button
        type="button"
        class="ft-action-btn"
        :class="{ 'is-active': showSearch }"
        title="搜索"
        aria-label="搜索"
        @click="showSearch = !showSearch"
      >
        <Search />
      </button>
      <button type="button" class="ft-action-btn" :title="`添加${props.title}`" :aria-label="`添加${props.title}`">
        <Plus />
      </button>
    </div>
  </div>

  <!-- 搜索框（grid 0fr→1fr 高度过渡 + 上滑淡入） -->
  <div v-if="searchMounted" class="ft-search" :class="{ 'ft-search--open': searchExpanded }">
    <div class="ft-search-inner">
      <input
        ref="inputRef"
        v-model="query"
        class="ft-search-input"
        type="text"
        :placeholder="`搜索${props.title}…`"
      />
    </div>
  </div>
</template>

<style scoped>
.ft-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  margin-bottom: 8px;
}

.ft-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--ft-muted-fg);
  line-height: 20px;
}

.ft-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-right: -4px;
}

.ft-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--ft-muted-fg);
  cursor: pointer;
  transition: transform 160ms ease-out, color 150ms ease;
}

.ft-action-btn.is-active {
  color: var(--ft-primary);
}

/* 按下回弹 */
.ft-action-btn:active {
  transform: scale(0.9);
}

.ft-action-btn :deep(svg) {
  width: 15px;
  height: 15px;
}

/* ---------- 搜索框 ---------- */

.ft-search {
  display: grid;
  grid-template-rows: 0fr;
  overflow: hidden;
  padding: 0 8px;
  margin-bottom: 0;
  opacity: 0;
  transform: translateY(-4px);
  transition:
    grid-template-rows 150ms cubic-bezier(0.4, 0, 1, 1),
    opacity 150ms cubic-bezier(0.4, 0, 1, 1),
    transform 150ms cubic-bezier(0.4, 0, 1, 1),
    margin 150ms cubic-bezier(0.4, 0, 1, 1);
}

.ft-search.ft-search--open {
  grid-template-rows: 1fr;
  opacity: 1;
  transform: translateY(0);
  margin-bottom: 8px;
  transition:
    grid-template-rows 200ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 200ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 200ms cubic-bezier(0.23, 1, 0.32, 1),
    margin 200ms cubic-bezier(0.23, 1, 0.32, 1);
}

.ft-search-inner {
  overflow: hidden;
  min-height: 0;
}

.ft-search-input {
  width: 100%;
  padding: 6px 12px;
  font-size: 12px;
  font-family: inherit;
  color: inherit;
  border: 1px solid var(--ft-border);
  border-radius: 999px;
  background: var(--ft-field-bg);
  outline: none;
}

.ft-search-input::placeholder {
  color: var(--ft-muted-fg);
}

.ft-search-input:focus {
  border-color: var(--ft-primary);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--ft-primary) 30%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .ft-search,
  .ft-search.ft-search--open {
    transition: opacity 150ms ease;
    transform: none;
  }
}
</style>
