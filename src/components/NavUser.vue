<script setup lang="ts">
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { MoreVertical, Settings, Keyboard } from 'lucide-vue-next'

const props = defineProps<{
  user: {
    name: string
    email: string
    avatar: string
    emoji?: string
  }
  collapsed?: boolean
}>()

const emit = defineEmits<{
  openSettings: [tab?: string]
}>()
</script>

<template>
  <SidebarMenu :class="collapsed ? 'w-full justify-center' : ''">
    <SidebarMenuItem :class="collapsed ? 'flex justify-center' : ''">
      <SidebarMenuButton
        size="lg"
        :class="['data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground', collapsed ? '!w-full justify-center' : '']"
        @click="emit('openSettings', 'user')"
      >
        <Avatar class="h-8 w-8 rounded-lg">
          <AvatarImage v-if="user.avatar" :src="user.avatar" :alt="user.name" />
          <AvatarFallback class="rounded-lg">
            {{ user.emoji || user.name?.[0]?.toUpperCase() || 'U' }}
          </AvatarFallback>
        </Avatar>
        <template v-if="!collapsed">
          <div class="grid flex-1 text-left text-sm leading-tight">
            <span class="truncate font-medium">{{ user.name }}</span>
            <span class="truncate text-xs">{{ user.email }}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger as-child @click.stop>
              <button
                class="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <MoreVertical class="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <DropdownMenuItem @click="emit('openSettings', 'general')">
                <Settings class="mr-2 h-4 w-4" />
                设置
              </DropdownMenuItem>
              <DropdownMenuItem @click="emit('openSettings', 'shortcuts')">
                <Keyboard class="mr-2 h-4 w-4" />
                快捷键设置
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </template>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
