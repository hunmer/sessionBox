<script setup lang="ts">
import { ChevronsUpDown, Settings2, Network } from 'lucide-vue-next'

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
  useSidebar,
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
  openProxy: []
}>()

const { isMobile } = useSidebar()
</script>

<template>
  <SidebarMenu :class="collapsed ? 'w-full justify-center' : ''">
    <SidebarMenuItem :class="collapsed ? 'flex justify-center' : ''">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton
            size="lg"
            :class="['data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground', collapsed ? '!w-full justify-center' : '']"
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
              <ChevronsUpDown class="ml-auto size-4" />
            </template>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          class="w-(--reka-dropdown-menu-trigger-width) min-w-56 rounded-lg"
          :side="isMobile ? 'bottom' : 'right'"
          align="end"
          :side-offset="4"
        >
          <DropdownMenuItem @click="emit('openSettings')">
            <Settings2 class="mr-2 size-4" />
            设置
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem @click="emit('openProxy')">
            <Network class="mr-2 size-4" />
            代理设置
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
