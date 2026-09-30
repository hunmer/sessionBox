// gemini-api 插件：把 SessionBox 页面（账号）的 Gemini cookie 通过 HTTP bridge
// 提供给本地 OpenAI 兼容服务（service/server.mjs，随插件以 ELECTRON_RUN_AS_NODE 启动，零依赖）。
// 协议移植自 Nativu5/Gemini-FastAPI + HanaokaYuzu/Gemini-API（MIT）。
// 插件不保存账号；凭据每次从对应页面 partition 的 cookie 实时读取（带缓存）。
const { spawn } = require('node:child_process')
const path = require('node:path')
const readline = require('node:readline')

const SERVICE_PORT = 19205

let serviceProcess = null

module.exports = {
  activate(context) {
    const sessionConfig = context.sessionServer.start()
    const serviceDir = path.join(__dirname, 'service')

    // Google 域通常需要代理访问：GEMINI_PROXY 显式指定，否则回落 HTTPS_PROXY/HTTP_PROXY。
    // Node ≥ 24 支持 NODE_USE_ENV_PROXY 让 fetch 走 env 代理；旧版需自带代理环境。
    const proxyUrl = process.env.GEMINI_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ''
    const nodeMajor = Number(String(process.versions.node).split('.')[0]) || 0

    // Electron 主进程里 process.execPath 是 electron.exe，ELECTRON_RUN_AS_NODE 使其按 Node 运行。
    // --max-http-header-size: gemini.google.com 首页 set-cookie 极多，默认 16KB 会溢出。
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
    if (proxyUrl && nodeMajor < 24) {
      context.logger.warn(
        `gemini-api: 检测到代理 ${proxyUrl} 但内嵌 Node ${process.versions.node} < 24，` +
          'NODE_USE_ENV_PROXY 可能不生效；若上游连接超时，请升级或改用系统级 TUN 模式代理',
      )
    }
    // 注册统一网关路由：/api/gemini-api/** → 本服务（卸载时由 plugin-manager 自动注销）
    context.gateway?.register(SERVICE_PORT)
    context.logger.info(`Gemini API Bridge 已激活: http://127.0.0.1:${SERVICE_PORT} （网关: http://127.0.0.1:${sessionConfig.port}/api/gemini-api/）`)
  },
  deactivate(context) {
    if (serviceProcess && !serviceProcess.killed) serviceProcess.kill()
    serviceProcess = null
    // 不调用 context.sessionServer.stop()：bridge 为全局单例，doubao-api/liblib-api 等插件可能仍在使用
    context.logger.info('Gemini API Bridge 已停用')
  },
}
