// jimeng-api 插件：把 SessionBox 页面（账号）的即梦 cookie 通过 HTTP bridge
// 提供给本地 OpenAI 兼容服务（service/server.mjs，随插件以 ELECTRON_RUN_AS_NODE 启动，零依赖）。
// 插件不保存账号；凭据每次从对应页面 partition 的 cookie 实时读取（带缓存）。
const { spawn } = require('node:child_process')
const path = require('node:path')
const readline = require('node:readline')

const SERVICE_PORT = 19203

let serviceProcess = null

module.exports = {
  activate(context) {
    const sessionConfig = context.sessionServer.start()
    const serviceDir = path.join(__dirname, 'service')
    // Electron 主进程里 process.execPath 是 electron.exe，ELECTRON_RUN_AS_NODE 使其按 Node 运行
    serviceProcess = spawn(process.execPath, [path.join(serviceDir, 'server.mjs')], {
      cwd: serviceDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        SESSIONBOX_API_URL: `http://127.0.0.1:${sessionConfig.port}`,
        SESSIONBOX_API_TOKEN: sessionConfig.token,
        JIMENG_PORT: String(SERVICE_PORT),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    for (const stream of [serviceProcess.stdout, serviceProcess.stderr]) {
      readline.createInterface({ input: stream }).on('line', (line) => context.logger.info(line))
    }
    serviceProcess.on('error', (error) => context.logger.error(`jimeng-api 服务启动失败: ${error.message}`))
    serviceProcess.on('exit', (code) => {
      if (code && code !== 0) context.logger.warn(`jimeng-api 服务退出 code=${code}`)
    })
    // 注册统一网关路由：/api/jimeng-api/** → 本服务（卸载时由 plugin-manager 自动注销）
    context.gateway?.register(SERVICE_PORT)
    context.logger.info(`Jimeng API Bridge 已激活: http://127.0.0.1:${SERVICE_PORT} （网关: http://127.0.0.1:${sessionConfig.port}/api/jimeng-api/）`)
  },
  deactivate(context) {
    if (serviceProcess && !serviceProcess.killed) serviceProcess.kill()
    serviceProcess = null
    // 不调用 context.sessionServer.stop()：bridge 为全局单例，doubao-api/liblib-api 等插件可能仍在使用
    context.logger.info('Jimeng API Bridge 已停用')
  },
}
