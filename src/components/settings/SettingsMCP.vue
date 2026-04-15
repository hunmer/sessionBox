<script setup lang="ts">
import { onMounted } from 'vue'
import { Server, Copy } from 'lucide-vue-next'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useMcpStore } from '@/stores/mcp'
import { toast } from 'vue-sonner'

const mcpStore = useMcpStore()

onMounted(() => {
  mcpStore.init()
})

async function toggleEnabled(checked: boolean) {
  try {
    if (checked) {
      await mcpStore.startServer()
      toast.success('MCP Server 已启动')
    } else {
      await mcpStore.stopServer()
      toast.success('MCP Server 已停止')
    }
  } catch (error: any) {
    toast.error('操作失败: ' + error.message)
    await mcpStore.refreshStatus()
  }
}

function copyConfig() {
  const config = JSON.stringify({
    mcpServers: {
      sessionbox: {
        url: mcpStore.sseUrl
      }
    }
  }, null, 2)
  navigator.clipboard.writeText(config)
  toast.success('配置已复制到剪贴板')
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Server class="w-5 h-5" />
        <h3 class="text-lg font-semibold">MCP Server</h3>
      </div>
      <Switch :checked="mcpStore.enabled" @update:checked="toggleEnabled" />
    </div>

    <div class="space-y-3 text-sm">
      <div class="flex items-center gap-2">
        <span class="text-muted-foreground">状态：</span>
        <span v-if="mcpStore.running" class="flex items-center gap-1.5 text-green-600">
          <span class="w-2 h-2 rounded-full bg-green-500" />
          运行中
        </span>
        <span v-else class="flex items-center gap-1.5 text-muted-foreground">
          <span class="w-2 h-2 rounded-full bg-muted-foreground/50" />
          已停止
        </span>
      </div>
      <div v-if="mcpStore.running" class="text-muted-foreground">
        已注册工具：{{ mcpStore.toolCount }} 个 | 端口：{{ mcpStore.port }}
      </div>
    </div>

    <div class="space-y-3">
      <p class="text-sm text-muted-foreground">
        在 MCP 客户端（如 Claude Desktop、Cursor）中配置以下内容以连接 SessionBox：
      </p>

      <div class="relative">
        <pre class="bg-muted rounded-lg p-4 text-xs overflow-x-auto"><code>{
  "mcpServers": {
    "sessionbox": {
      "url": "{{ mcpStore.sseUrl }}"
    }
  }
}</code></pre>
        <Button
          variant="ghost"
          size="icon"
          class="absolute top-2 right-2"
          @click="copyConfig"
        >
          <Copy class="w-4 h-4" />
        </Button>
      </div>

      <p class="text-xs text-muted-foreground">
        连接后，AI 可以查询工作区/标签/书签、创建标签页、执行 JS、发送 CDP 指令等操作。
      </p>
    </div>
  </div>
</template>
