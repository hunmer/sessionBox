import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.join(__dirname, '..')

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

    // 5. 清理旧构建产物并打包
    console.log('\n🧹 步骤 5/5: 清理并打包 Electron 应用...')
    if (fs.existsSync(distAppPath)) {
      await forceRemove(distAppPath)
    }

    // 根据模式选择配置文件
    const builderConfig = mode === 'local' ? 'electron-builder-local.json' : 'electron-builder.json'

    console.log(`\n🔨 打包 Electron 应用 (配置: ${builderConfig})...`)
    execSync(`npx electron-builder --config ${builderConfig}`, {
      stdio: 'inherit',
      cwd: projectRoot
    })

    // local 模式: 复制更新文件到 SMB 目录
    if (mode === 'local') {
      console.log('\n📂 复制更新文件到 SMB 目录...')
      const smbPath = '\\\\192.168.1.200\\web\\sessionbox_updates'

      try {
        // 确保 SMB 目录存在
        if (!fs.existsSync(smbPath)) {
          fs.mkdirSync(smbPath, { recursive: true })
        }

        // 清理旧文件
        const oldFiles = fs.readdirSync(smbPath)
        for (const file of oldFiles) {
          if (file.endsWith('.exe') || file.endsWith('.zip') || file === 'latest.yml') {
            const oldFilePath = path.join(smbPath, file)
            fs.unlinkSync(oldFilePath)
            console.log(`  已删除旧文件: ${file}`)
          }
        }

        // 复制新文件
        const newFiles = fs.readdirSync(distAppPath)
        for (const file of newFiles) {
          if (file.endsWith('.exe') || file.endsWith('.zip') || file === 'latest.yml') {
            const srcFile = path.join(distAppPath, file)
            const destFile = path.join(smbPath, file)
            fs.copyFileSync(srcFile, destFile)
            console.log(`  已复制: ${file}`)
          }
        }
        console.log('  ✓ 更新文件复制完成')
      } catch (error) {
        console.log(`  ⚠️  无法访问 SMB 目录: ${smbPath}`)
        console.log('  跳过文件复制，构建仍然成功')
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
        if (file.endsWith('.exe') || file.endsWith('.zip') || file === 'latest.yml') {
          console.log(`   - ${file}`)
        }
      }
    }

  } catch (error) {
    console.error('\n❌ 构建失败:', error.message)

    // 错误恢复: 还原开发环境依赖
    const nodeModulesPath = path.join(projectRoot, 'node_modules')
    const backupPath = path.join(projectRoot, 'node_modules.dev')

    if (fs.existsSync(backupPath) && !fs.existsSync(nodeModulesPath)) {
      console.log('🔄 恢复开发环境依赖...')
      try {
        await safeRename(backupPath, nodeModulesPath)
        console.log('✓ 开发环境已恢复')
      } catch (restoreError) {
        console.error('⚠️  自动恢复失败,请手动执行:')
        console.error(`   mv "${backupPath}" "${nodeModulesPath}"`)
      }
    }

    process.exit(1)
  }
})()
