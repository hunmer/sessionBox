#!/usr/bin/env node

/**
 * 插件商店本地开发服务器
 *
 * 在 8000 端口启动静态文件服务器，托管 plugins/ 目录。
 * /plugins.json 直接返回预构建的静态索引文件，不依赖文件系统扫描。
 *
 * 用法: node scripts/plugins-server.js
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = 8000
const PLUGINS_DIR = path.resolve(__dirname, '..', 'plugins')

const MIME_TYPES = {
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
  '.html': 'text/html',
  '.css': 'text/css',
}

function serve(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0])

  // 根路径重定向到 plugins.json
  if (urlPath === '/') {
    res.writeHead(302, { Location: '/plugins.json' })
    res.end()
    return
  }

  const filePath = path.join(PLUGINS_DIR, urlPath)

  // 防止路径穿越
  if (!filePath.startsWith(PLUGINS_DIR)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    })
    res.end(data)
  })
}

const server = http.createServer(serve)

server.listen(PORT, () => {
  console.log(`插件商店开发服务器已启动:`)
  console.log(`  地址:       http://127.0.0.1:${PORT}`)
  console.log(`  静态目录:   ${PLUGINS_DIR}`)
  console.log(`  插件列表:   http://127.0.0.1:${PORT}/plugins.json`)
  console.log(`\n提示: 先运行 node scripts/plugins-build.js 生成索引和 zip`)
  console.log(`按 Ctrl+C 停止`)
})
