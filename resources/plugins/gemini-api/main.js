// gemini-api 插件：把 SessionBox 页面（账号）的 Gemini cookie 通过 HTTP bridge
// 提供给本地 OpenAI 兼容服务（service/server.mjs，随插件以 ELECTRON_RUN_AS_NODE 启动，零依赖）。
// 协议移植自 Nativu5/Gemini-FastAPI + HanaokaYuzu/Gemini-API（MIT）。
// 插件不保存账号；凭据每次从对应页面 partition 的 cookie 实时读取（带缓存）。
const { spawn } = require('node:child_process')
const path = require('node:path')
const readline = require('node:readline')

const SERVICE_PORT = 19205

let serviceProcess = null

/**
 * 解析访问 gemini.google.com 所需代理（Node fetch 不读系统代理，需显式注入 env）。
 * 优先级: GEMINI_PROXY > HTTPS_PROXY/HTTP_PROXY > npm_config_* 遗留变量 > Electron 系统代理。
 * @returns {Promise<string>} 代理 URL（如 http://127.0.0.1:7890），无代理返回 ''
 */
async function detectProxyUrl() {
  const fromEnv = process.env.GEMINI_PROXY
    || process.env.HTTPS_PROXY
    || process.env.HTTP_PROXY
    || process.env.npm_config_https_proxy
    || process.env.npm_config_proxy
  if (fromEnv) return fromEnv

  // Electron 主进程: 经 Chromium 网络栈解析系统代理（macOS/Windows 系统代理均覆盖）
  try {
    const { session } = require('electron')
    const rule = await session.defaultSession.resolveProxy('https://gemini.google.com/')
    // 形如 "PROXY 127.0.0.1:7890" / "DIRECT"；undici 仅支持 HTTP(S) 代理，SOCKS 端口为混合模式时同样可用
    const m = rule.match(/PROXY\s+([^;\s]+)/) || rule.match(/SOCKS5?\s+([^;\s]+)/)
    if (m) {
      const target = m[1]
      return /^https?:\/\//.test(target) ? target : `http://${target}`
    }
  } catch (error) {
    console.warn(`gemini-api: 系统代理检测失败: ${error.message}`)
  }
  return ''
}

module.exports = {
  activate(context) {
    const sessionConfig = context.sessionServer.start()
    const serviceDir = path.join(__dirname, 'service')

    ;(async () => {
      const proxyUrl = await detectProxyUrl()
      // Electron 主进程里 process.execPath 是 electron.exe，ELECTRON_RUN_AS_NODE 使其按 Node 运行。
      // --max-http-header-size: gemini.google.com 首页 set-cookie 极多，默认 16KB 会溢出。
      // Node ≥ 24（Electron 44 内嵌 24.21）支持 NODE_USE_ENV_PROXY 让 fetch 走 env 代理。
      serviceProcess = spawn(
        process.execPath,
        ['--max-http-header-size=262144', path.join(serviceDir, 'server.mjs')],
        {
          cwd: serviceDir,
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            SESSIONBOX_API_URL: `http://127.0.0.1:${sessionConfig.port}`,
            SESSIONBOX_API_TOKEN: sessionConfig.token,
            GEMINI_PORT: String(SERVICE_PORT),
            ...(proxyUrl
              ? { GEMINI_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl, NODE_USE_ENV_PROXY: '1' }
              : {}),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        },
      )
      for (const stream of [serviceProcess.stdout, serviceProcess.stderr]) {
        readline.createInterface({ input: stream }).on('line', (line) => context.logger.info(line))
      }
      serviceProcess.on('error', (error) => context.logger.error(`gemini-api 服务启动失败: ${error.message}`))
      serviceProcess.on('exit', (code) => {
        if (code && code !== 0) context.logger.warn(`gemini-api 服务退出 code=${code}`)
      })
      if (!proxyUrl) {
        context.logger.warn('gemini-api: 未检测到代理，gemini.google.com 可能无法直连（可设 GEMINI_PROXY 环境变量）')
      } else {
        context.logger.info(`gemini-api: 上游代理 ${proxyUrl}`)
      }
      // 注册统一网关路由：/api/gemini-api/** → 本服务（卸载时由 plugin-manager 自动注销）
      context.gateway?.register(SERVICE_PORT)
      context.logger.info(`Gemini API Bridge 已激活: http://127.0.0.1:${SERVICE_PORT} （网关: http://127.0.0.1:${sessionConfig.port}/api/gemini-api/）`)
    })().catch((error) => context.logger.error(`gemini-api 激活失败: ${error.message}`))
  },
  deactivate(context) {
    if (serviceProcess && !serviceProcess.killed) serviceProcess.kill()
    serviceProcess = null
    // 不调用 context.sessionServer.stop()：bridge 为全局单例，doubao-api/liblib-api 等插件可能仍在使用
    context.logger.info('Gemini API Bridge 已停用')
  },
}
