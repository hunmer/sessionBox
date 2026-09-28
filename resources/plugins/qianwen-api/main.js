const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
let child = null
module.exports = {
  activate(context) {
    const config = context.sessionServer.start()
    const dir = path.join(__dirname, 'service')
    const log = fs.createWriteStream(path.join(dir, 'service.log'), { flags: 'a' })
    const bundledPython = 'G:/doubao2api-1/.venv/Scripts/python.exe'
    const python = process.env.QIANWEN_PYTHON || process.env.DOUBAO_PYTHON || (fs.existsSync(bundledPython) ? bundledPython : 'python')
    child = spawn(python, ['qianwen_server.py'], { cwd: dir, env: { ...process.env, SESSIONBOX_API_URL: `http://127.0.0.1:${config.port}`, SESSIONBOX_API_TOKEN: config.token }, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.pipe(log); child.stderr.pipe(log)
    child.on('error', (e) => context.logger.error(`Qianwen 服务启动失败: ${e.message}`))
  },
  deactivate(context) { if (child && !child.killed) child.kill(); child = null; context.sessionServer.stop() }
}
