# SessionBox 数据同步后端

免密、按用户标识符隔离的跨设备数据同步服务（零依赖，Node.js ≥ 18）。

## 启动

```bash
pnpm sync-server                  # 默认端口 37400，数据目录 server/data
PORT=9000 pnpm sync-server        # 自定义端口
pnpm sync-server -- --dir /var/lib/sessionbox-sync --port 9000
```

## 客户端配置

在 SessionBox：设置 → 数据同步 → 填写后端地址（如 `http://192.168.1.5:37400`）和用户标识符，按需勾选同步内容后点击"立即同步"。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查，返回版本与支持类型 |
| GET | `/api/:user` | 列出该用户已存储的数据类型 |
| GET | `/api/:user/:type` | 拉取某类型数据 `{ updatedAt, payload }` |
| PUT | `/api/:user/:type` | 推送 `{ payload }`，整体快照覆盖 |
| DELETE | `/api/:user/:type` | 清除某类型数据 |

- `type` 白名单：`bookmarks` / `history` / `extensions` / `plugins` / `proxies` / `containers`
- `user` 仅允许 `A-Za-z0-9_-`（≤64 位）
- 所有响应带 `Access-Control-Allow-Origin: *`（供客户端渲染进程跨域访问）
- 存储为 `data/<user>/<type>.json`，原子写入

## 安全说明

无鉴权设计，任何知道地址 + 标识符的人都能读写该标识符的数据（含 cookies、代理凭据，均为明文）。
请仅在可信内网自建使用，或自行加反向代理鉴权（如 nginx basic auth / 内网 VPN）。

## 测试

```bash
pnpm sync-server-test
```
