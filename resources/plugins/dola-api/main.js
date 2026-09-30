// dola-api 插件：把 SessionBox 页面（账号）的 dola.com 会话通过 HTTP bridge
// 提供给本地 OpenAI 兼容服务（service/server.mjs，随插件以 ELECTRON_RUN_AS_NODE 启动，零依赖）。
// 上游请求全部经 bridge /execute 在 dola 页面内执行（Node 直连会被 TLS 风控拦截），
// 插件不保存账号；登录态由 SessionBox 页面（浏览器会话）持有。
const { spawn } = require('node:child_process')
const path = require('node:path')
const readline = require('node:readline')

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
        DOLA_PORT: '19204',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    for (const stream of [serviceProcess.stdout, serviceProcess.stderr]) {
      readline.createInterface({ input: stream }).on('line', (line) => context.logger.info(line))
    }
    serviceProcess.on('error', (error) => context.logger.error(`dola-api 服务启动失败: ${error.message}`))
    serviceProcess.on('exit', (code) => {
      if (code && code !== 0) context.logger.warn(`dola-api 服务退出 code=${code}`)
    })
    context.logger.info('Dola API Bridge 已激活: http://127.0.0.1:19204 （账号选择: x-session-page 头，缺省自动）')
  },
  deactivate(context) {
    if (serviceProcess && !serviceProcess.killed) serviceProcess.kill()
    serviceProcess = null
    // 不调用 context.sessionServer.stop()：bridge 为全局单例，其他插件可能仍在使用
    context.logger.info('Dola API Bridge 已停用')
  },
}
