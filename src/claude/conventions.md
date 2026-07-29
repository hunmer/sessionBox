[根目录](../../CLAUDE.md) > [src](../CLAUDE.md) > 详情

# src/ 开发约定

- 组件用 `<script setup lang="ts">`；样式 Tailwind 4 + CSS 变量；UI 原语用 `components/ui/`（shadcn-vue）。
- 改领域模型同步 `src/types/index.ts` + `electron/services/store.ts` + `preload/index.ts`。
- 订阅主进程事件用 `composables/useIpc.ts`（自动清理），避免手动 `api.on` 忘记解绑。
- 拖拽排序用 `composables/useDragSort.ts`（封装 vuedraggable）；书签拖拽用 `useBookmarkDragDrop.ts`。
- 类名合并用 `lib/utils.ts` 的 `cn()`；图标动态解析用 `lib/lucide-resolver.ts`。
- 历史/聊天本地库：`lib/db.ts`、`lib/chat-db.ts`（Dexie）。
- Agent 流式：`lib/agent/agent.ts`（`runAgentStream`）+ `lib/agent/stream.ts`（IPC 事件→回调）。
