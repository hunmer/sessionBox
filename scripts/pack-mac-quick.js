// 快速打包 macOS 版本 (不签名, 供本地测试)
// 用法: npm run pack:mac           -> 仅产出可直接运行的 .app (最快)
//       npm run pack:mac -- --dmg  -> 额外产出 dmg
// 说明: 跳过 build-production.js 的生产依赖切换流程, 直接用开发依赖打包;
//       以 ad-hoc 签名替代 Developer ID 签名 (无需证书/时间戳, 本机可运行, 不可对外分发)
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.join(__dirname, '..')
const outMain = path.join(projectRoot, 'out', 'main')
const distPath = path.join(projectRoot, 'dist-app-quick')

const wantDmg = process.argv.includes('--dmg')
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'

// out/ 缺失或 --rebuild 时先编译
if (!fs.existsSync(outMain) || process.argv.includes('--rebuild')) {
  console.log('📦 编译 electron-vite...')
  execSync('npx electron-vite build', { stdio: 'inherit', cwd: projectRoot })
}

// 清空输出目录 (增量复制会破坏 framework 符号链接结构, 必须干净构建)
if (fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true, force: true })
}

// electron-builder 真证书签名会就地改写 electronDist 里的 Electron.app (物化符号链接,
// 导致 bundle format is ambiguous), 这里克隆一份隔离副本作为 electronDist, 保护原始依赖
const isoDist = path.join(projectRoot, '.electron-dist-iso')
execSync('rm -rf .electron-dist-iso && cp -Rc node_modules/electron/dist .electron-dist-iso', { cwd: projectRoot })

console.log(`🚀 快速打包 (macOS ${arch}, ad-hoc 签名${wantDmg ? ', 含 dmg' : ''})...`)
execSync(
  `npx electron-builder --mac ${wantDmg ? 'dmg' : '--dir'} --${arch} --config electron-builder-local.json --config.directories.output=dist-app-quick --config.electronDist=.electron-dist-iso`,
  {
    stdio: 'inherit',
    cwd: projectRoot,
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
  }
)

console.log(`\n✅ 完成: ${distPath}/`)
const appDir = fs.readdirSync(distPath).find((f) => f.endsWith('.app'))
if (appDir && !wantDmg) {
  console.log(`▶️  运行: open "${path.join(distPath, appDir)}"`)
}
