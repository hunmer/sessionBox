#!/usr/bin/env node

/**
 * 插件商店构建脚本
 *
 * 读取 resources/plugins/ 下的所有插件目录，
 * 将每个插件打包为 zip 并生成 plugins.json 索引文件。
 *
 * 用法: node scripts/plugins-build.js
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { copyFileSync } = fs

const RESOURCES_DIR = path.resolve(__dirname, '..', 'resources')
const PLUGINS_DIR = path.join(RESOURCES_DIR, 'plugins')
const OUTPUT_DIR = path.resolve(__dirname, '..', 'plugins')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function build() {
  if (!fs.existsSync(PLUGINS_DIR)) {
    console.error(`插件目录不存在: ${PLUGINS_DIR}`)
    process.exit(1)
  }

  ensureDir(OUTPUT_DIR)

  const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
  const plugins = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const pluginDir = path.join(PLUGINS_DIR, entry.name)
    const infoPath = path.join(pluginDir, 'info.json')

    if (!fs.existsSync(infoPath)) {
      console.warn(`跳过 (缺少 info.json): ${entry.name}`)
      continue
    }

    let info
    try {
      info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'))
    } catch (err) {
      console.warn(`跳过 (info.json 解析失败): ${entry.name}`, err.message)
      continue
    }

    // 验证必需字段
    if (!info.id || !info.name || !info.version) {
      console.warn(`跳过 (缺少必需字段): ${entry.name}`)
      continue
    }

    // 打包为 zip（使用 node 内置或系统 zip 命令）
    const zipName = `${entry.name}.zip`
    const zipPath = path.join(OUTPUT_DIR, zipName)

    // 删除旧 zip
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath)
    }

    try {
      // 使用 PowerShell (Windows) 或 zip (Unix) 打包
      if (process.platform === 'win32') {
        // PowerShell Compress-Archive
        const psCmd = `Compress-Archive -Path "${pluginDir}\\*" -DestinationPath "${zipPath}" -Force`
        execSync(`powershell -Command "${psCmd}"`, { stdio: 'pipe' })
      } else {
        // Unix: 使用 cd + zip 避免包含完整路径
        execSync(`cd "${pluginDir}" && zip -r "${zipPath}" .`, { stdio: 'pipe' })
      }
      console.log(`打包: ${zipName}`)
    } catch (err) {
      console.warn(`打包失败: ${entry.name}`, err.message)
      continue
    }

    // 复制 icon.png 到输出目录，确保 iconUrl 可访问
    const srcIcon = path.join(pluginDir, 'icon.png')
    const hasIcon = fs.existsSync(srcIcon)
    if (hasIcon) {
      const iconDir = path.join(OUTPUT_DIR, entry.name)
      ensureDir(iconDir)
      copyFileSync(srcIcon, path.join(iconDir, 'icon.png'))
    }

    // 添加到索引
    plugins.push({
      id: info.id,
      name: info.name,
      version: info.version,
      description: info.description || '',
      author: info.author || { name: 'Unknown' },
      tags: info.tags || [],
      hasView: info.hasView || false,
      downloadUrl: `${zipName}`,
      iconUrl: fs.existsSync(path.join(pluginDir, 'icon.png'))
        ? `${entry.name}/icon.png`
        : undefined,
    })
  }

  // 写入 plugins.json
  const jsonPath = path.join(OUTPUT_DIR, 'plugins.json')
  fs.writeFileSync(jsonPath, JSON.stringify(plugins, null, 2), 'utf-8')
  console.log(`\n已生成: ${jsonPath}`)
  console.log(`共 ${plugins.length} 个插件`)
}

build()
