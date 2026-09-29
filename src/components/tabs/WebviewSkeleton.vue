<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <div class="flex h-full w-full flex-col overflow-hidden">
    <!-- 浏览器地址栏 -->
    <div class="flex items-center gap-3 border-b px-4 py-3">
      <div class="flex shrink-0 items-center gap-1.5">
        <Skeleton class="size-2.5 rounded-full" />
        <Skeleton class="size-2.5 rounded-full" />
        <Skeleton class="size-2.5 rounded-full" />
      </div>
      <Skeleton class="h-6 flex-1 rounded-full" />
      <Skeleton class="size-6 shrink-0 rounded-full" />
    </div>
    <!-- 站点导航栏 -->
    <div class="flex items-center gap-4 border-b px-4 py-2.5">
      <Skeleton class="size-6 shrink-0" />
      <Skeleton class="h-4 w-12" />
      <Skeleton class="h-4 w-12" />
      <Skeleton class="h-4 w-12" />
      <Skeleton class="ml-auto h-7 w-20 rounded-full" />
    </div>
    <!-- 主体：侧栏 + 内容 -->
    <div class="flex min-h-0 flex-1">
      <div class="hidden w-40 shrink-0 flex-col gap-3 border-r p-4 md:flex">
        <Skeleton v-for="i in 5" :key="i" class="h-4" :class="['w-3/4', 'w-1/2', 'w-2/3', 'w-1/3', 'w-3/5'][i - 1]" />
      </div>
      <div class="flex min-w-0 flex-1 flex-col gap-3 p-6">
        <Skeleton class="h-7 w-1/3" />
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-4 w-5/6" />
        <Skeleton class="h-4 w-2/3" />
        <div class="mt-3 grid grid-cols-3 gap-4">
          <div v-for="i in 3" :key="i" class="flex flex-col gap-2.5">
            <Skeleton class="aspect-video w-full" />
            <Skeleton class="h-4 w-4/5" />
            <Skeleton class="h-3 w-3/5" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
