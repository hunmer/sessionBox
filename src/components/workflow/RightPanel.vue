<script setup lang="ts">
import { ref, watch } from 'vue'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Settings2, GitBranch, History, Bot } from 'lucide-vue-next'
import NodeProperties from './NodeProperties.vue'
import VersionControl from './VersionControl.vue'
import OperationHistory from './OperationHistory.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import { createChatStore } from '@/stores/chat'
import { useWorkflowStore } from '@/stores/workflow'

const workflowStore = useWorkflowStore()
const activeTab = ref('properties')
const workflowChat = createChatStore('workflow')

// 监听 tab 切换，自动绑定工作流会话
watch(activeTab, async (tab) => {
  if (tab === 'ai-assistant') {
    const workflowId = workflowStore.currentWorkflow?.id
    if (workflowId) {
      await workflowChat.switchToWorkflowSession(workflowId)
    }
  }
})
</script>

<template>
  <div class="border-l border-border bg-background flex flex-col h-full">
    <Tabs
      v-model="activeTab"
      default-value="properties"
      class="flex flex-col h-full"
    >
      <div class="px-2 pt-2">
        <TooltipProvider :delay-duration="300">
          <TabsList class="w-full h-7">
            <Tooltip>
              <TooltipTrigger as-child>
                <TabsTrigger
                  value="properties"
                  class="text-xs h-5"
                >
                  <Settings2 class="w-3.5 h-3.5" />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                class="text-xs"
              >
                节点属性
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <TabsTrigger
                  value="version"
                  class="text-xs h-5"
                >
                  <GitBranch class="w-3.5 h-3.5" />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                class="text-xs"
              >
                版本控制
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <TabsTrigger
                  value="operations"
                  class="text-xs h-5"
                >
                  <History class="w-3.5 h-3.5" />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                class="text-xs"
              >
                操作历史
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger as-child>
                <TabsTrigger
                  value="ai-assistant"
                  class="text-xs h-5"
                >
                  <Bot class="w-3.5 h-3.5" />
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                class="text-xs"
              >
                AI 助手
              </TooltipContent>
            </Tooltip>
          </TabsList>
        </TooltipProvider>
      </div>

      <TabsContent
        value="properties"
        class="flex-1 min-h-0 mt-0"
      >
        <NodeProperties :embedded="true" />
      </TabsContent>

      <TabsContent
        value="version"
        class="flex-1 min-h-0 mt-0"
      >
        <VersionControl />
      </TabsContent>

      <TabsContent
        value="operations"
        class="flex-1 min-h-0 mt-0"
      >
        <OperationHistory />
      </TabsContent>

      <TabsContent
        value="ai-assistant"
        class="flex-1 min-h-0 mt-0"
      >
        <ChatPanel
          :chat="workflowChat"
          embedded
        />
      </TabsContent>
    </Tabs>
  </div>
</template>
