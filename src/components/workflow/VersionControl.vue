<script setup lang="ts">
import { useWorkflowStore } from '@/stores/workflow'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { History, Trash2, ArrowDownToLine } from 'lucide-vue-next'

const store = useWorkflowStore()

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function handleRestoreVersion(versionId: string) {
  await store.restoreVersion(versionId)
}

async function handleDeleteVersion(versionId: string) {
  await store.deleteVersion(versionId)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <Tabs default-value="history" class="flex flex-col flex-1 min-h-0">
      <div class="px-3 pt-2">
        <TabsList class="w-full h-7">
          <TabsTrigger value="history" class="text-xs h-5">
            版本历史
          </TabsTrigger>
          <TabsTrigger value="operations" class="text-xs h-5">
            操作历史
          </TabsTrigger>
        </TabsList>
      </div>

      <!-- 版本历史 -->
      <TabsContent value="history" class="flex-1 min-h-0 mt-0">
        <div class="flex flex-col h-full">
          <!-- 版本列表 -->
          <ScrollArea class="flex-1">
            <div class="p-2 space-y-1">
              <div
                v-for="version in store.versions"
                :key="version.id"
                class="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
              >
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium truncate">{{ version.name }}</div>
                  <div class="text-[10px] text-muted-foreground">
                    {{ formatTime(version.createdAt) }}
                  </div>
                  <div class="text-[10px] text-muted-foreground">
                    {{ version.snapshot.nodes.length }} 个节点, {{ version.snapshot.edges.length }} 条连线
                  </div>
                </div>
                <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-5 w-5 p-0"
                    title="恢复此版本"
                    @click="handleRestoreVersion(version.id)"
                  >
                    <ArrowDownToLine class="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-5 w-5 p-0 text-destructive hover:text-destructive"
                    title="删除此版本"
                    @click="handleDeleteVersion(version.id)"
                  >
                    <Trash2 class="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div v-if="store.versions.length === 0" class="text-xs text-muted-foreground text-center py-6">
                暂无保存的版本
              </div>
            </div>
          </ScrollArea>
        </div>
      </TabsContent>

      <!-- 操作历史 -->
      <TabsContent value="operations" class="flex-1 min-h-0 mt-0">
        <ScrollArea class="h-full">
          <div class="p-2 space-y-0.5">
            <div
              v-for="(op, index) in store.operationLog"
              :key="index"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
            >
              <History class="w-3 h-3 text-muted-foreground shrink-0" />
              <span class="flex-1 truncate">{{ op.description }}</span>
              <span class="text-[10px] text-muted-foreground shrink-0">
                {{ formatTime(op.timestamp) }}
              </span>
            </div>

            <div v-if="store.operationLog.length === 0" class="text-xs text-muted-foreground text-center py-6">
              暂无操作记录
            </div>

            <div v-if="store.operationLog.length > 0" class="text-[10px] text-muted-foreground text-center pt-2">
              共 {{ store.operationLog.length }} 条操作记录（最多 1000 条）
            </div>
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  </div>
</template>
