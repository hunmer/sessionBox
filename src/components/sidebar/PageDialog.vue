<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Settings, CheckIcon, ChevronsUpDownIcon, Box, ArrowRight } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import EmojiRenderer from '@/components/common/EmojiRenderer.vue'
import IconSelector from '@/components/common/IconSelector.vue'
import { useContainerStore } from '@/stores/container'
import { usePageStore } from '@/stores/page'
import { useProxyStore } from '@/stores/proxy'
import { useBookmarkStore } from '@/stores/bookmark'
import type { Page } from '@/types'

const props = defineProps<{
  open: boolean
  page?: Page | null
  groupId?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [data: Omit<Page, 'id'>]
  delete: [id: string]
  openSettings: [tab?: string]
}>()

const pageStore = usePageStore()
const containerStore = useContainerStore()
const proxyStore = useProxyStore()
const bookmarkStore = useBookmarkStore()

const name = ref('')
const icon = ref('')
const url = ref('about:blank')
const containerId = ref('')
const NO_PROXY = '__none__'
const DEFAULT_CONTAINER = '__default__'
const proxyId = ref(NO_PROXY)
const userAgent = ref('')

/** 容器选择 Popover */
const containerPopoverOpen = ref(false)

/** 自动创建容器 */
const autoCreateContainer = ref(false)
const newContainerName = ref('')
const newContainerProxyId = ref(NO_PROXY)
const isContainerNameManual = ref(false)

/** URL Combobox 状态 */
const comboboxOpen = ref(false)
const comboboxSearch = ref('')
const urlTriggerRef = ref<HTMLElement | null>(null)
const filteredBookmarks = ref<typeof bookmarkStore.bookmarks>([])

/** 截流过滤：300ms 延迟，无关键词时不展示，最多 50 条 */
const debouncedFilter = useDebounceFn((keyword: string) => {
  if (!keyword) {
    filteredBookmarks.value = []
    return
  }
  const kw = keyword.toLowerCase()
  filteredBookmarks.value = bookmarkStore.bookmarks
    .filter(b => b.title.toLowerCase().includes(kw) || b.url.toLowerCase().includes(kw))
    .slice(0, 50)
}, 300)

watch(comboboxSearch, (val) => debouncedFilter(val.trim()))

/** 代理下拉选项 */
const proxyOptions = computed(() => proxyStore.proxies)

/** 容器下拉选项 */
const containers = computed(() => containerStore.containers)

watch(() => props.open, (val) => {
  if (val) {
    name.value = props.page?.name ?? ''
    icon.value = props.page?.icon ?? ''
    url.value = props.page?.url ?? 'about:blank'
    containerId.value = props.page?.containerId || DEFAULT_CONTAINER
    proxyId.value = props.page?.proxyId || NO_PROXY
    userAgent.value = props.page?.userAgent ?? ''
    autoCreateContainer.value = false
    newContainerName.value = ''
    newContainerProxyId.value = NO_PROXY
    isContainerNameManual.value = false
  }
})

function isCustomImageIcon(iconStr?: string): boolean {
  return !!iconStr?.startsWith('img:')
}

/** 页面名称变更时同步容器名称 */
watch(name, (val) => {
  if (autoCreateContainer.value && !isContainerNameManual.value) {
    newContainerName.value = val
  }
})

/** 手动修改容器名称时标记为手动 */
function onNewContainerNameInput() {
  isContainerNameManual.value = true
}

/** 勾选自动创建时初始化容器名称 */
watch(autoCreateContainer, (val) => {
  if (val) {
    newContainerName.value = name.value.trim() || '新容器'
    isContainerNameManual.value = false
    newContainerProxyId.value = NO_PROXY
  }
})

/** 选择容器（从 Popover） */
function selectContainer(id: string) {
  containerId.value = id
  containerPopoverOpen.value = false
}

/** 清除容器选择 */
function clearContainer() {
  containerId.value = DEFAULT_CONTAINER
  containerPopoverOpen.value = false
}

async function handleSave() {
  const trimmed = name.value.trim()
  if (!trimmed) return

  let resolvedContainerId = containerId.value === DEFAULT_CONTAINER ? undefined : containerId.value

  // 自动创建容器
  if (autoCreateContainer.value) {
    const containerName = newContainerName.value.trim() || trimmed
    const container = await containerStore.createContainer({
      name: containerName,
      icon: '📦',
      proxyId: newContainerProxyId.value === NO_PROXY ? undefined : newContainerProxyId.value,
      order: containerStore.containers.length,
    })
    resolvedContainerId = container.id
  }

  emit('save', {
    groupId: props.page?.groupId ?? props.groupId ?? '',
    containerId: resolvedContainerId,
    name: trimmed,
    icon: icon.value,
    url: url.value.trim() || 'about:blank',
    order: props.page?.order ?? pageStore.pages.length,
    proxyId: proxyId.value === NO_PROXY ? undefined : proxyId.value,
    userAgent: userAgent.value.trim() || undefined,
  })
  emit('update:open', false)
}

function handleDelete() {
  if (props.page?.id) {
    emit('delete', props.page.id)
    emit('update:open', false)
  }
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="sm:max-w-[420px] max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ page ? '编辑页面' : '新建页面' }}</DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-5 py-2 min-w-0">
        <!-- 图标 -->
        <IconSelector
          v-model="icon"
          :size="80"
          default-emoji=""
        />

        <!-- 名称 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">名称</label>
          <Input
            v-model="name"
            placeholder="输入页面名称"
            autofocus
            @keydown.enter="handleSave"
          />
        </div>

        <!-- URL -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">URL</label>
          <Popover
            v-model:open="comboboxOpen"
            :modal="false"
          >
            <PopoverTrigger as-child>
              <Button
                ref="urlTriggerRef"
                variant="outline"
                role="combobox"
                :aria-expanded="comboboxOpen"
                class="w-full justify-between h-9 px-3 font-normal"
              >
                <span class="truncate text-sm">{{ url || 'about:blank' }}</span>
                <ChevronsUpDownIcon class="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              :style="{ width: urlTriggerRef?.$el?.offsetWidth + 'px' }"
              class="p-0"
              align="start"
            >
              <Command>
                <CommandInput
                  v-model="comboboxSearch"
                  placeholder="搜索书签..."
                  @keydown.enter="() => {
                    if (comboboxSearch.trim()) url = comboboxSearch.trim()
                    comboboxOpen = false
                  }"
                />
                <CommandList>
                  <CommandEmpty>无匹配书签</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      v-for="site in filteredBookmarks"
                      :key="site.id"
                      :value="site.url"
                      @select="(ev: { detail: { value: string } }) => {
                        url = ev.detail.value
                        comboboxOpen = false
                      }"
                    >
                      <CheckIcon
                        :class="cn('mr-2 h-4 w-4', url === site.url ? 'opacity-100' : 'opacity-0')"
                      />
                      <span class="truncate">{{ site.title }}</span>
                      <span class="ml-auto text-xs text-muted-foreground truncate max-w-[40%]">{{ site.url }}</span>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <!-- 容器 -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <label class="text-xs font-medium text-muted-foreground">容器</label>
            <div class="flex items-center gap-1.5">
              <Checkbox
                id="auto-create-container"
                :checked="autoCreateContainer"
                class="h-3.5 w-3.5"
                @update:checked="autoCreateContainer = $event"
              />
              <label
                for="auto-create-container"
                class="text-[11px] text-muted-foreground cursor-pointer"
              >自动创建</label>
            </div>
          </div>

          <!-- 选择已有容器 -->
          <div
            v-if="!autoCreateContainer"
            class="flex gap-2"
          >
            <Select
              v-model="containerId"
              class="min-w-0 flex-1"
            >
              <SelectTrigger class="flex-1 min-w-0">
                <SelectValue placeholder="默认容器" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="c in containers"
                  :key="c.id"
                  :value="c.id"
                >
                  {{ c.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Popover v-model:open="containerPopoverOpen">
              <PopoverTrigger as-child>
                <Button
                  variant="outline"
                  size="icon"
                  title="管理容器"
                >
                  <Settings class="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                class="w-64 p-0"
              >
                <div class="px-3 pt-2 pb-1.5 flex items-center justify-between">
                  <span class="text-xs font-medium flex items-center gap-1.5">
                    <Box class="h-3.5 w-3.5 text-muted-foreground" />
                    容器列表
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-5 gap-1 text-[10px] text-primary hover:text-primary px-1"
                    @click="emit('update:open', false); emit('openSettings', 'containers')"
                  >
                    管理
                    <ArrowRight class="h-3 w-3" />
                  </Button>
                </div>
                <ScrollArea class="h-[240px]">
                  <div class="py-1">
                    <!-- 默认容器 -->
                    <div
                      class="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer transition-colors"
                      :class="{ 'bg-muted/30': containerId === DEFAULT_CONTAINER }"
                      @click="clearContainer"
                    >
                      <div class="shrink-0 w-4 h-4 flex items-center justify-center">
                        <CheckIcon
                          v-if="containerId === DEFAULT_CONTAINER"
                          class="h-3 w-3 text-primary"
                        />
                      </div>
                      <span class="text-xs">默认容器</span>
                    </div>
                    <!-- 容器列表 -->
                    <div
                      v-for="c in containers"
                      :key="c.id"
                      class="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer transition-colors"
                      :class="{ 'bg-muted/30': containerId === c.id }"
                      @click="selectContainer(c.id)"
                    >
                      <div class="shrink-0 w-4 h-4 flex items-center justify-center">
                        <CheckIcon
                          v-if="containerId === c.id"
                          class="h-3 w-3 text-primary"
                        />
                      </div>
                      <span class="shrink-0 w-5 h-5 flex items-center justify-center overflow-hidden">
                        <img
                          v-if="isCustomImageIcon(c.icon)"
                          :src="`account-icon://${c.icon.slice(4)}`"
                          alt=""
                          class="w-full h-full rounded-sm object-cover"
                        >
                        <EmojiRenderer
                          v-else-if="c.icon"
                          :emoji="c.icon"
                          class="text-sm"
                        />
                        <Box
                          v-else
                          class="h-3.5 w-3.5 text-muted-foreground"
                        />
                      </span>
                      <span class="text-xs truncate">{{ c.name }}</span>
                    </div>
                    <div
                      v-if="containers.length === 0"
                      class="py-4 text-center text-xs text-muted-foreground"
                    >
                      暂无容器
                    </div>
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
          </div>

          <!-- 自动创建新容器编辑区 -->
          <div
            v-else
            class="flex flex-col gap-2 p-3 rounded-md border bg-muted/20"
          >
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] text-muted-foreground">容器名称</label>
              <Input
                v-model="newContainerName"
                placeholder="默认与页面同名"
                class="h-8 text-sm"
                @input="onNewContainerNameInput"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-[11px] text-muted-foreground">容器代理</label>
              <Select v-model="newContainerProxyId">
                <SelectTrigger class="h-8 text-sm">
                  <SelectValue placeholder="不绑定代理" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="NO_PROXY">
                    不绑定代理
                  </SelectItem>
                  <SelectItem
                    v-for="p in proxyOptions"
                    :key="p.id"
                    :value="p.id"
                  >
                    {{ p.name }} ({{ p.type }}://{{ p.host }}:{{ p.port }})
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <!-- 代理 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">代理</label>
          <Select v-model="proxyId">
            <SelectTrigger>
              <SelectValue placeholder="不绑定代理" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="NO_PROXY">
                不绑定代理
              </SelectItem>
              <SelectItem
                v-for="p in proxyOptions"
                :key="p.id"
                :value="p.id"
              >
                {{ p.name }} ({{ p.type }}://{{ p.host }}:{{ p.port }})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- UA -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-muted-foreground">User-Agent</label>
          <Input
            v-model="userAgent"
            placeholder="留空使用默认 UA"
          />
        </div>
      </div>

      <DialogFooter class="gap-2">
        <Button
          v-if="page"
          variant="destructive"
          @click="handleDelete"
        >
          删除
        </Button>
        <div class="flex-1" />
        <Button
          variant="secondary"
          @click="emit('update:open', false)"
        >
          取消
        </Button>
        <Button
          :disabled="!name.trim()"
          @click="handleSave"
        >
          保存
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
