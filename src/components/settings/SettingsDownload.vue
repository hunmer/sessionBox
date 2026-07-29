<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useDownloadStore } from '@/stores/download'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Server, RefreshCw } from 'lucide-vue-next'

const store = useDownloadStore()
const editConfig = ref<Record<string, any>>({})

/** 分组预设：none=不分组，其余为固定模板，custom=展开自定义输入 */
const groupPreset = ref<'none' | 'host' | 'type' | 'host_date' | 'host_type_date' | 'custom'>('none')
const customGroup = ref('')

/** 分组预设选项（template 为对应模板字符串，与主进程 {host}/{type}/{date} 变量一致） */
const groupOptions: { value: typeof groupPreset.value; label: string; template: string }[] = [
  { value: 'none', label: '不分组', template: '' },
  { value: 'host', label: '按站点', template: '{host}' },
  { value: 'type', label: '按文件类型', template: '{type}' },
  { value: 'host_date', label: '站点 / 日期', template: '{host}/{date}' },
  { value: 'host_type_date', label: '站点 / 类型 / 日期', template: '{host}/{type}/{date}' },
  { value: 'custom', label: '自定义…', template: '' }
]

/** 从配置同步初始预设：能匹配预设则选中预设，否则进入自定义 */
function syncPresetFromConfig(template: string) {
  const matched = groupOptions.find((o) => o.template && o.template === template)
  if (matched) {
    groupPreset.value = matched.value
    customGroup.value = ''
  } else if (template) {
    groupPreset.value = 'custom'
    customGroup.value = template
  } else {
    groupPreset.value = 'none'
    customGroup.value = ''
  }
}

/** 当前生效的分组模板字符串 */
const categoryTemplate = computed(() => {
  if (groupPreset.value === 'custom') return customGroup.value.trim()
  const opt = groupOptions.find((o) => o.value === groupPreset.value)
  return opt?.template || ''
})

/** 预览：展示当前配置将创建的子目录路径（用示例值替换变量） */
const groupPreview = computed(() => {
  const tpl = categoryTemplate.value
  if (!tpl) return '直接保存到下载目录'
  return tpl
    .replace(/\{host\}/gi, 'example.com')
    .replace(/\{type\}/gi, '压缩包')
    .replace(/\{date\}/gi, new Date().toISOString().slice(0, 10))
})

/** 预设变化时保存到配置（自定义则在输入时保存） */
watch(groupPreset, (val) => {
  if (val !== 'custom') {
    const opt = groupOptions.find((o) => o.value === val)
    saveField('defaultCategory', opt?.template || '')
  }
})

watch(customGroup, (val) => {
  saveField('defaultCategory', val.trim())
})

watch(
  () => store.config,
  (config) => {
    if (config) {
      editConfig.value = { ...config }
      // 同步分组预设选择（配置加载后才知 defaultCategory 值）
      syncPresetFromConfig(config.defaultCategory || '')
    }
  },
  { immediate: true }
)

// 切换到本设置页时，确保配置已加载：不依赖 DownloadMiniPopover 的挂载时序
// （右侧栏未渲染或 init 异步未完成时 store.config 可能为 null，导致表单空白）
onMounted(() => {
  if (!store.config) {
    void store.loadConfig()
  }
})

function saveField(key: string, value: unknown) {
  editConfig.value[key] = value
  store.saveConfig({ [key]: value })
}

async function handleToggleConnection() {
  if (store.connected) {
    await store.stop()
  } else {
    await store.start()
  }
}
</script>

<template>
  <div
    v-if="editConfig"
    class="space-y-6"
  >
    <!-- Aria2 连接 -->
    <section>
      <h3 class="text-sm font-medium mb-3">
        Aria2 连接
      </h3>
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">服务器地址</label>
            <Input
              :model-value="editConfig.host"
              placeholder="localhost"
              @update:model-value="saveField('host', $event)"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">端口</label>
            <Input
              :model-value="editConfig.port"
              type="number"
              @update:model-value="saveField('port', Number($event))"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">RPC 密钥</label>
            <Input
              :model-value="editConfig.secret"
              type="password"
              @update:model-value="saveField('secret', $event)"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs text-muted-foreground">aria2c 路径</label>
            <Input
              :model-value="editConfig.aria2Path"
              placeholder="aria2c"
              @update:model-value="saveField('aria2Path', $event)"
            />
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Button
            size="sm"
            :disabled="store.loading"
            @click="handleToggleConnection"
          >
            <template v-if="store.connected">
              <Server class="w-3.5 h-3.5 mr-1" /> 停止
            </template>
            <template v-else>
              <Server class="w-3.5 h-3.5 mr-1" /> 启动
            </template>
          </Button>
          <Button
            size="sm"
            variant="outline"
            @click="store.checkConnection()"
          >
            <RefreshCw class="w-3.5 h-3.5 mr-1" /> 检测连接
          </Button>
          <span class="flex-1" />
          <span
            class="text-xs"
            :class="store.connected ? 'text-green-600' : 'text-muted-foreground'"
          >
            {{ store.connected ? '已连接' : '未连接' }}
          </span>
        </div>

        <div class="flex items-center justify-between">
          <label class="text-xs text-muted-foreground">自动启动 aria2</label>
          <Switch
            :model-value="editConfig.autoStart"
            @update:model-value="saveField('autoStart', $event)"
          />
        </div>
      </div>
    </section>

    <Separator />

    <!-- 下载路径 -->
    <section>
      <h3 class="text-sm font-medium mb-3">
        下载路径
      </h3>
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label class="text-xs text-muted-foreground">总是询问下载位置</label>
          <Switch
            :model-value="editConfig.alwaysAsk"
            @update:model-value="saveField('alwaysAsk', $event)"
          />
        </div>
        <div class="space-y-1">
          <label class="text-xs text-muted-foreground">下载目录（留空使用系统默认）</label>
          <Input
            :model-value="editConfig.downloadDir"
            placeholder="系统下载目录"
            :disabled="editConfig.alwaysAsk"
            @update:model-value="saveField('downloadDir', $event)"
          />
        </div>

        <!-- 默认分组归档 -->
        <div class="space-y-1.5">
          <label class="text-xs text-muted-foreground">默认分组归档</label>
          <Select v-model="groupPreset">
            <SelectTrigger class="h-8 text-sm">
              <SelectValue placeholder="选择分组方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="opt in groupOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </SelectItem>
            </SelectContent>
          </Select>

          <!-- 自定义模板输入 -->
          <Input
            v-if="groupPreset === 'custom'"
            v-model="customGroup"
            placeholder="如 {host}/{type}/{date} 或 {host}/{date}"
            class="h-8 text-sm font-mono"
          />

          <!-- 变量说明 -->
          <div class="rounded-md bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground space-y-1">
            <p class="font-medium text-foreground/70">
              可用变量（用 <code class="px-0.5 py-px rounded bg-muted text-foreground/80">/</code> 分隔多级目录）：
            </p>
            <p><code class="text-foreground/80">{host}</code> 站点域名，如 example.com</p>
            <p><code class="text-foreground/80">{type}</code> 文件类型，如 视频 / 音频 / 压缩包 / 图片 / 文档 / 其他</p>
            <p><code class="text-foreground/80">{date}</code> 当天日期，如 2026-07-29</p>
            <p class="text-foreground/50 pt-0.5">
              示例：<code class="text-foreground/70">{host}/{type}/{date}</code> → 自动创建子目录并归档，不存在的文件夹会自动创建。
            </p>
          </div>

          <!-- 预览 -->
          <p
            v-if="categoryTemplate"
            class="text-[11px] text-muted-foreground truncate"
            :title="`子目录：${groupPreview}`"
          >
            子目录预览：<span class="text-foreground/70 font-mono">{{ groupPreview }}</span>
          </p>
        </div>
      </div>
    </section>

    <Separator />

    <!-- 下载通知 -->
    <section>
      <h3 class="text-sm font-medium mb-3">
        下载通知
      </h3>
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <label class="text-xs text-muted-foreground">开始下载时通知</label>
          <Switch
            :model-value="editConfig.notifyOnStart"
            @update:model-value="saveField('notifyOnStart', $event)"
          />
        </div>
        <div class="flex items-center justify-between">
          <label class="text-xs text-muted-foreground">下载成功时通知</label>
          <Switch
            :model-value="editConfig.notifyOnSuccess"
            @update:model-value="saveField('notifyOnSuccess', $event)"
          />
        </div>
        <div class="flex items-center justify-between">
          <label class="text-xs text-muted-foreground">下载失败时通知</label>
          <Switch
            :model-value="editConfig.notifyOnFailure"
            @update:model-value="saveField('notifyOnFailure', $event)"
          />
        </div>
      </div>
    </section>
  </div>
</template>
