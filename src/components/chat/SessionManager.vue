<script setup lang="ts">
import { computed } from 'vue'
import type { ChatStoreInstance } from '@/stores/chat'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { MessageSquarePlus, Trash2, History } from 'lucide-vue-next'

const props = defineProps<{
  chat: ChatStoreInstance
}>()

const recentSessions = computed(() =>
  props.chat.sessions.slice(0, 20)
)

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return date.toLocaleDateString()
}

async function handleNewSession() {
  await props.chat.createSession()
}

async function handleDeleteSession(id: string) {
  await props.chat.deleteSessionById(id)
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="h-7 w-7"
      >
        <History class="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      class="w-[260px]"
    >
      <DropdownMenuItem @click="handleNewSession">
        <MessageSquarePlus class="h-4 w-4 mr-2" />
        新建对话
      </DropdownMenuItem>
      <DropdownMenuSeparator v-if="recentSessions.length" />
      <DropdownMenuItem
        v-for="session in recentSessions"
        :key="session.id"
        class="flex items-center justify-between cursor-pointer"
        :class="session.id === chat.currentSessionId ? 'bg-accent' : ''"
        @click="chat.switchSession(session.id)"
      >
        <div class="flex-1 min-w-0">
          <div class="text-sm truncate">
            {{ session.title }}
          </div>
          <div class="text-[10px] text-muted-foreground">
            {{ formatTime(session.updatedAt) }}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
          @click.stop="handleDeleteSession(session.id)"
        >
          <Trash2 class="h-3 w-3 text-destructive" />
        </Button>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
