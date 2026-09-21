import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.join(__dirname, '..')
const electronDistPath = path.join(projectRoot, 'node_modules', 'electron', 'dist')
// 各平台 Electron 可执行文件路径
const electronExePath =
  process.platform === 'win32'
    ? path.join(electronDistPath, 'electron.exe')
    : process.platform === 'darwin'
      ? path.join(electronDistPath, 'Electron.app', 'Contents', 'MacOS', 'Electron')
      : path.join(electronDistPath, 'electron')

// 解析命令行参数
const args = process.argv.slice(2)
const mode = args[0] || 'local' // 默认 local

if (mode !== 'local' && mode !== 'release') {
  console.error(`❌ 无效的构建模式: ${mode}`)
  console.error('使用方式: node scripts/build-production.js [local|release]')
  process.exit(1)
}

console.log(`🚀 开始构建 SessionBox 生产版本 (模式: ${mode})...\n`)

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// 安全删除目录
async function forceRemove(dirPath, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
        await sleep(500)
        return true
      }
      return true
    } catch (error) {
      if (i === retries - 1) throw error
      console.log(`  重试删除 (${i + 1}/${retries})...`)
      await sleep(1000)
    }
  }
}

// 安全重命名
async function safeRename(oldPath, newPath, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      if (fs.existsSync(newPath)) {
        await forceRemove(newPath)
      }
      fs.renameSync(oldPath, newPath)
      await sleep(300)
      return true
    } catch (error) {
      if (i === retries - 1) {
        throw new Error(`无法重命名目录: ${error.message}`)
      }
      console.log(`  重试重命名 (${i + 1}/${retries})...`)
      await sleep(1000)
    }
  }
}

// 获取版本号
function getVersion() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'))
  return packageJson.version
}

function ensureElectronRuntime() {
  if (!fs.existsSync(electronExePath)) {
    throw new Error(`Electron runtime missing: ${electronExePath}. Run "pnpm rebuild electron" or reinstall dependencies.`)
  }
}

// 判断是否为更新分发产物 (win: .exe/.zip/latest.yml; mac: .dmg/.zip/.blockmap/latest-mac.yml)
const isUpdateArtifact = (file) =>
  file === 'latest.yml' ||
  file === 'latest-mac.yml' ||
  ['.exe', '.dmg', '.zip', '.blockmap'].some((ext) => file.endsWith(ext))

// 更新文件目录: 环境变量优先，其次按平台默认 (macOS 需先挂载 SMB 共享)
function detectUpdateDir() {
  if (process.env.SESSIONBOX_UPDATE_DIR) return process.env.SESSIONBOX_UPDATE_DIR
  if (process.platform === 'win32') return '\\\\192.168.1.200\\web\\sessionbox_updates'
  // macOS/Linux: 探测已挂载 SMB 共享中的 sessionbox_updates
  if (fs.existsSync('/Volumes')) {
    for (const vol of fs.readdirSync('/Volumes')) {
      for (const rel of ['sessionbox_updates', path.join('web', 'sessionbox_updates')]) {
        const candidate = path.join('/Volumes', vol, rel)
        if (fs.existsSync(candidate)) return candidate
      }
    }
  }
  return null
}

// 校验打包配置引用的资源 (extraResources from 目录 / 平台图标)，缺失时给出明确错误
function validatePackagingResources(builderConfig) {
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, builderConfig), 'utf-8'))
  const missing = []
  for (const res of config.extraResources || []) {
    if (res.from && !fs.existsSync(path.join(projectRoot, res.from))) missing.push(res.from)
  }
  const icon = process.platform === 'darwin' ? config.mac?.icon : config.win?.icon
  if (icon && !fs.existsSync(path.join(projectRoot, icon))) missing.push(icon)
  if (missing.length) {
    throw new Error(`缺少打包资源: ${missing.join(', ')} (配置: ${builderConfig})`)
  }
}

;(async () => {
  try {
    const version = getVersion()
    const nodeModulesPath = path.join(projectRoot, 'node_modules')
    const backupPath = path.join(projectRoot, 'node_modules.dev')
    const distAppPath = path.join(projectRoot, 'dist-app')

    // 1. 使用 electron-vite 构建（同时编译 main + preload + renderer）
    console.log('\n📦 步骤 1/5: 使用 electron-vite 构建...')
    execSync('npx electron-vite build', {
      stdio: 'inherit',
      cwd: projectRoot
    })

    // 2. 备份当前 node_modules
    console.log('\n💾 步骤 2/5: 备份开发环境依赖...')

    if (fs.existsSync(backupPath)) {
      console.log('  清理旧备份...')
      await forceRemove(backupPath)
    }

    if (fs.existsSync(nodeModulesPath)) {
      console.log('  重命名 node_modules -> node_modules.dev')
      await safeRename(nodeModulesPath, backupPath)
      console.log('  ✓ 备份完成')
    }

    // 3. 仅安装生产依赖
    console.log('\n📥 步骤 3/5: 安装生产依赖...')
    execSync('pnpm install --prod --no-optional', {
      stdio: 'inherit',
      cwd: projectRoot
    })

    // 4. 安装 electron 和 electron-builder（electron-builder 需要）
    console.log('\n📦 步骤 4/5: 安装 electron & electron-builder...')
    execSync('pnpm add electron electron-builder -D', {
      stdio: 'inherit',
      cwd: projectRoot
    })
    ensureElectronRuntime()

    // 5. 清理旧构建产物并打包
    console.log('\n🧹 步骤 5/5: 清理并打包 Electron 应用...')
    if (fs.existsSync(distAppPath)) {
      await forceRemove(distAppPath)
    }

    // 根据模式选择配置文件
    const builderConfig = mode === 'local' ? 'electron-builder-local.json' : 'electron-builder.json'
    validatePackagingResources(builderConfig)

    console.log(`\n🔨 打包 Electron 应用 (配置: ${builderConfig})...`)
    execSync(`npx electron-builder --config ${builderConfig}`, {
      stdio: 'inherit',
      cwd: projectRoot
    })

    // local 模式: 复制更新文件到更新服务器目录
    if (mode === 'local') {
      const updateDir = detectUpdateDir()
      if (!updateDir) {
        console.log('\n⚠️  未找到更新目录，跳过复制')
        console.log('   Windows: 确保可访问 \\\\192.168.1.200\\web\\sessionbox_updates')
        console.log('   macOS:   先在 Finder 挂载 SMB (smb://192.168.1.200/web)，或设置环境变量 SESSIONBOX_UPDATE_DIR')
      } else {
        console.log(`\n📂 复制更新文件到: ${updateDir}`)
        try {
          // 清理旧更新产物
          const oldFiles = fs.readdirSync(updateDir)
          for (const file of oldFiles) {
            if (isUpdateArtifact(file)) {
              fs.unlinkSync(path.join(updateDir, file))
              console.log(`  已删除旧文件: ${file}`)
            }
          }

          // 复制新更新产物
          const newFiles = fs.readdirSync(distAppPath)
          for (const file of newFiles) {
            if (isUpdateArtifact(file)) {
              fs.copyFileSync(path.join(distAppPath, file), path.join(updateDir, file))
              console.log(`  已复制: ${file}`)
            }
          }
          console.log('  ✓ 更新文件复制完成')
        } catch (error) {
          console.log(`  ⚠️  无法访问更新目录: ${updateDir} (${error.message})`)
          console.log('  跳过文件复制，构建仍然成功')
        }
      }
    }

    // 恢复开发环境依赖
    console.log('\n🔄 恢复开发环境依赖...')
    if (fs.existsSync(nodeModulesPath)) {
      await forceRemove(nodeModulesPath)
    }
    if (fs.existsSync(backupPath)) {
      await safeRename(backupPath, nodeModulesPath)
      console.log('  ✓ 恢复完成')
    }

    console.log('\n✅ 构建完成! 输出目录: dist-app/')

    if (mode === 'release') {
      console.log('\n📢 Release 模式构建完成!')
      console.log('   请手动创建 GitHub Release 并上传以下文件:')
      const files = fs.readdirSync(distAppPath)
      for (const file of files) {
        if (isUpdateArtifact(file)) {
          console.log(`   - ${file}`)
        }
      }
    }

  } catch (error) {
    console.error('\n❌ 构建失败:', error.message)

    // 错误恢复: 还原开发环境依赖（当前 node_modules 可能是步骤3/4生成的生产版）
    const nodeModulesPath = path.join(projectRoot, 'node_modules')
    const backupPath = path.join(projectRoot, 'node_modules.dev')

    if (fs.existsSync(backupPath)) {
      console.log('🔄 恢复开发环境依赖...')
      try {
        if (fs.existsSync(nodeModulesPath)) {
          await forceRemove(nodeModulesPath)
        }
        await safeRename(backupPath, nodeModulesPath)
        console.log('✓ 开发环境已恢复')
      } catch (restoreError) {
        console.error('⚠️  自动恢复失败,请手动执行:')
        console.error(`   rm -rf "${nodeModulesPath}" && mv "${backupPath}" "${nodeModulesPath}"`)
      }
    }

    process.exit(1)
  }
})()
