// Doubao 的 Python 服务通过 SessionBox HTTP bridge 使用页面会话。
// 插件本身不保存账号；激活时仅声明能力，便于后续扩展为其他站点服务。
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
let serviceProcess = null

module.exports = {
  activate(context) {
    const sessionConfig = context.sessionServer.start()
    const serviceDir = path.join(__dirname, 'service')
    const log = fs.createWriteStream(path.join(serviceDir, 'service.log'), { flags: 'a' })
    const bundledPython = 'G:/doubao2api-1/.venv/Scripts/python.exe'
    const python = process.env.DOUBAO_PYTHON || (fs.existsSync(bundledPython) ? bundledPython : 'python')
    serviceProcess = spawn(python, ['-m', 'doubao2api'], {
      cwd: serviceDir,
      env: {
        ...process.env,
        PYTHONPATH: serviceDir,
        SESSIONBOX_API_URL: `http://127.0.0.1:${sessionConfig.port}`,
        SESSIONBOX_API_TOKEN: sessionConfig.token
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    serviceProcess.stdout.pipe(log)
    serviceProcess.stderr.pipe(log)
    serviceProcess.on('error', (error) => context.logger.error(`Doubao 服务启动失败: ${error.message}`))
    context.logger.info('Doubao API Bridge 已激活，使用 DOUBAO_PAGE_ID 选择页面')
  },
  deactivate(context) {
    if (serviceProcess && !serviceProcess.killed) serviceProcess.kill()
    serviceProcess = null
    context.sessionServer.stop()
    context.logger.info('Doubao API Bridge 已停用')
  }
}
