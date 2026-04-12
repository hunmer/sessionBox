<script setup lang="ts">
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

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
  openSettings: []
}>()
</script>

<template>
  <SidebarMenu :class="collapsed ? 'w-full justify-center' : ''">
    <SidebarMenuItem :class="collapsed ? 'flex justify-center' : ''">
      <SidebarMenuButton
        size="lg"
        :class="['data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground', collapsed ? '!w-full justify-center' : '']"
        @click="emit('openSettings')"
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
        </template>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
