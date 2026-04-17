<script setup lang="ts">
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import NodeProperties from './NodeProperties.vue'
import VersionControl from './VersionControl.vue'
</script>

<template>
  <div class="border-l border-border bg-background flex flex-col h-full">
    <Tabs default-value="properties" class="flex flex-col h-full">
      <div class="px-2 pt-2">
        <TabsList class="w-full h-7">
          <TabsTrigger value="properties" class="text-xs h-5">
            节点属性
          </TabsTrigger>
          <TabsTrigger value="version" class="text-xs h-5">
            版本控制
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="properties" class="flex-1 min-h-0 mt-0">
        <NodeProperties :embedded="true" />
      </TabsContent>

      <TabsContent value="version" class="flex-1 min-h-0 mt-0">
        <VersionControl />
      </TabsContent>
    </Tabs>
  </div>
</template>
