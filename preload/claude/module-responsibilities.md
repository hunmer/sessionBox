[根目录](../../CLAUDE.md) > [preload](../CLAUDE.md) > 详情

# preload/ 模块职责

| 文件 | 职责 |
|------|------|
| `preload/index.ts` | 预加载脚本：定义 `api` 对象（32 命名空间）+ `contextBridge.exposeInMainWorld('api', api)` + 类型导出 |
| `preload/index.d.ts` | TypeScript 类型声明（`IpcAPI` 接口） |

本目录仅含上述两文件，无子目录。
