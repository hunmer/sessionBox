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
  }[]
  collapsed?: boolean
}>()
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem v-for="item in items" :key="item.title">
      <SidebarMenuButton as-child :is-active="item.isActive" :tooltip="collapsed ? item.title : undefined">
        <a :href="item.url">
          <component :is="item.icon" />
          <span v-if="!collapsed">{{ item.title }}</span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
