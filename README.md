# SessionBox

多账号浏览器管理工具，基于 Electron + Vue 3 构建。通过 `partition` 隔离不同账号的 Cookie/Session，支持分组管理、代理配置、标签页拖拽排序。

## 功能特性

- **多账号隔离** — 每个账号独立 Session，互不干扰
- **分组管理** — 按用途对账号进行分组，支持拖拽排序
- **代理配置** — 为不同账号设置独立代理，支持热更新
- **常用网站** — 收藏常用网址，快速访问
- **深色/浅色主题** — 自定义外观
- **桌面快捷方式** — 通过 `sessionbox://` 协议直接打开指定账号

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 33 |
| 前端 | Vue 3 + TypeScript |
| 状态管理 | Pinia |
| UI 组件 | shadcn-vue (Radix Vue) |
| 样式 | Tailwind CSS 4 |
| 图标 | Lucide |
| 构建 | electron-vite + electron-builder |

## 快速开始

```bash
# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm dev

# 构建
pnpm build

# 生产打包
pnpm pack
```

## 项目结构

```
sessionBox/
├── electron/          # 主进程 - 窗口管理、IPC、数据持久化
│   ├── main.ts        # 入口
│   ├── ipc/           # IPC 处理器
│   └── services/      # 核心服务（store、webview、proxy）
├── preload/           # 预加载 - contextBridge API 桥接
├── src/               # 渲染进程 - Vue 3 UI
│   ├── components/    # UI 组件
│   ├── stores/        # Pinia 状态管理
│   └── types/         # 类型定义
├── scripts/           # 构建脚本
└── resources/         # 应用图标
```

## 许可证

MIT
