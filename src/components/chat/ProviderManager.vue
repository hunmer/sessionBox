<script setup lang="ts">
import { ref } from 'vue'
import { useAIProviderStore } from '@/stores/ai-provider'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Plus, Trash2, TestTube2, ChevronDown, Loader2 } from 'lucide-vue-next'
import type { AIProvider, AIModel } from '@/types'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const providerStore = useAIProviderStore()
const expandedProviderId = ref<string | null>(null)
const testing = ref(false)
const testResult = ref<{ success: boolean; error?: string } | null>(null)

const showAddProvider = ref(false)
const newProviderName = ref('')
const newProviderApiBase = ref('https://api.anthropic.com')
const newProviderApiKey = ref('')

const addingModelForProvider = ref<string | null>(null)
const newModelId = ref('')
const newModelName = ref('')
const newModelMaxTokens = ref(4096)
const newModelSupportsVision = ref(false)
const newModelSupportsThinking = ref(false)

async function handleAddProvider() {
  if (!newProviderName.value.trim() || !newProviderApiKey.value.trim()) return
  await providerStore.createProvider({
    name: newProviderName.value.trim(),
    apiBase: newProviderApiBase.value.trim(),
    apiKey: newProviderApiKey.value.trim(),
    models: [],
    enabled: true,
  })
  newProviderName.value = ''
  newProviderApiBase.value = 'https://api.anthropic.com'
  newProviderApiKey.value = ''
  showAddProvider.value = false
}

async function handleDeleteProvider(id: string) {
  await providerStore.deleteProvider(id)
}

async function handleTestConnection(id: string) {
  testing.value = true
  testResult.value = null
  testResult.value = await providerStore.testConnection(id)
  testing.value = false
}

async function handleAddModel(providerId: string) {
  if (!newModelId.value.trim()) return
  const provider = providerStore.providers.find((p) => p.id === providerId)
  if (!provider) return

  const newModel: AIModel = {
    id: newModelId.value.trim(),
    name: newModelName.value.trim() || newModelId.value.trim(),
    providerId,
    maxTokens: newModelMaxTokens.value,
    supportsVision: newModelSupportsVision.value,
    supportsThinking: newModelSupportsThinking.value,
  }

  await providerStore.updateProvider(providerId, {
    models: [...provider.models.map((m) => ({ ...m })), newModel],
  })

  newModelId.value = ''
  newModelName.value = ''
  newModelMaxTokens.value = 4096
  newModelSupportsVision.value = false
  newModelSupportsThinking.value = false
  addingModelForProvider.value = null
}

async function handleDeleteModel(providerId: string, modelId: string) {
  const provider = providerStore.providers.find((p) => p.id === providerId)
  if (!provider) return
  await providerStore.updateProvider(providerId, {
    models: provider.models.filter((m) => m.id !== modelId).map((m) => ({ ...m })),
  })
}

async function handleToggleProvider(provider: AIProvider) {
  await providerStore.updateProvider(provider.id, { enabled: !provider.enabled })
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="max-w-lg max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>管理 AI 供应商</DialogTitle>
      </DialogHeader>

      <div class="space-y-3">
        <div
          v-for="provider in providerStore.providers"
          :key="provider.id"
          class="border rounded-lg"
        >
          <Collapsible
            :open="expandedProviderId === provider.id"
            @update:open="expandedProviderId = $event ? provider.id : null"
          >
            <div class="flex items-center justify-between px-3 py-2">
              <div class="flex items-center gap-2">
                <CollapsibleTrigger class="cursor-pointer">
                  <ChevronDown
                    class="h-4 w-4 transition-transform"
                    :class="expandedProviderId === provider.id ? '' : '-rotate-90'"
                  />
                </CollapsibleTrigger>
                <span class="text-sm font-medium">{{ provider.name }}</span>
              </div>
              <div class="flex items-center gap-2">
                <Switch
                  :model-value="provider.enabled"
                  @update:model-value="handleToggleProvider(provider)"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6"
                  @click="handleTestConnection(provider.id)"
                >
                  <Loader2
                    v-if="testing"
                    class="h-3 w-3 animate-spin"
                  />
                  <TestTube2
                    v-else
                    class="h-3 w-3"
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-6 w-6"
                  @click="handleDeleteProvider(provider.id)"
                >
                  <Trash2 class="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
            <CollapsibleContent>
              <div class="px-3 pb-2 space-y-1 text-xs text-muted-foreground">
                <div>API Base: {{ provider.apiBase }}</div>
                <div>模型数量: {{ provider.models.length }}</div>
              </div>
              <div class="px-3 pb-2 space-y-1">
                <div
                  v-for="model in provider.models"
                  :key="model.id"
                  class="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1"
                >
                  <span>{{ model.name }} <span class="text-muted-foreground">({{ model.maxTokens }} tokens)</span></span>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-5 w-5"
                    @click="handleDeleteModel(provider.id, model.id)"
                  >
                    <Trash2 class="h-3 w-3" />
                  </Button>
                </div>
                <div
                  v-if="addingModelForProvider === provider.id"
                  class="space-y-1.5 pt-1"
                >
                  <Input
                    v-model="newModelId"
                    placeholder="模型 ID (如 claude-sonnet-4-6)"
                    class="h-7 text-xs"
                  />
                  <Input
                    v-model="newModelName"
                    placeholder="显示名称"
                    class="h-7 text-xs"
                  />
                  <Input
                    v-model.number="newModelMaxTokens"
                    type="number"
                    placeholder="maxTokens"
                    class="h-7 text-xs"
                  />
                  <div class="flex items-center gap-3 text-xs">
                    <label class="flex items-center gap-1"><Switch
                      :model-value="newModelSupportsVision"
                      class="scale-75"
                      @update:model-value="newModelSupportsVision = $event"
                    /> 视觉</label>
                    <label class="flex items-center gap-1"><Switch
                      :model-value="newModelSupportsThinking"
                      class="scale-75"
                      @update:model-value="newModelSupportsThinking = $event"
                    /> 思考</label>
                  </div>
                  <div class="flex gap-1">
                    <Button
                      size="sm"
                      class="h-6 text-xs"
                      @click="handleAddModel(provider.id)"
                    >
                      添加
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      class="h-6 text-xs"
                      @click="addingModelForProvider = null"
                    >
                      取消
                    </Button>
                  </div>
                </div>
                <Button
                  v-else
                  variant="ghost"
                  size="sm"
                  class="h-6 text-xs"
                  @click="addingModelForProvider = provider.id"
                >
                  <Plus class="h-3 w-3 mr-1" /> 添加模型
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div
          v-if="testResult"
          class="text-xs rounded px-2 py-1"
          :class="testResult.success ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'"
        >
          {{ testResult.success ? '连接成功' : `连接失败: ${testResult.error}` }}
        </div>

        <div
          v-if="showAddProvider"
          class="border rounded-lg p-3 space-y-2"
        >
          <Input
            v-model="newProviderName"
            placeholder="供应商名称 (如 Anthropic)"
            class="h-7 text-xs"
          />
          <Input
            v-model="newProviderApiBase"
            placeholder="API Base URL"
            class="h-7 text-xs"
          />
          <Input
            v-model="newProviderApiKey"
            type="password"
            placeholder="API Key"
            class="h-7 text-xs"
          />
          <div class="flex gap-1">
            <Button
              size="sm"
              class="h-7 text-xs"
              @click="handleAddProvider"
            >
              添加
            </Button>
            <Button
              size="sm"
              variant="ghost"
              class="h-7 text-xs"
              @click="showAddProvider = false"
            >
              取消
            </Button>
          </div>
        </div>
        <Button
          v-else
          variant="outline"
          size="sm"
          class="w-full text-xs"
          @click="showAddProvider = true"
        >
          <Plus class="h-3 w-3 mr-1" /> 添加供应商
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
