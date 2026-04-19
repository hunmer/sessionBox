<script setup lang="ts">
import type { LucideIcon } from "lucide-vue-next"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

defineProps<{
  items: {
    title: string
    url: string
    icon: LucideIcon
    isActive?: boolean
    onClick?: () => void
  }[]
  collapsed?: boolean
}>()
</script>

<template>
  <SidebarMenu :class="collapsed ? 'w-full justify-center' : ''">
    <SidebarMenuItem
      v-for="item in items"
      :key="item.title"
    >
      <SidebarMenuButton
        as-child
        :is-active="item.isActive"
        :tooltip="collapsed ? item.title : undefined"
        :class="collapsed ? '!w-full justify-center' : ''"
      >
        <a
          v-if="!item.onClick"
          :href="item.url"
        >
          <component :is="item.icon" />
          <span v-if="!collapsed">{{ item.title }}</span>
        </a>
        <button
          v-else
          type="button"
          @click="item.onClick"
        >
          <component :is="item.icon" />
          <span v-if="!collapsed">{{ item.title }}</span>
        </button>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
