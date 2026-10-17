// ChatGLM（智谱清言）反代服务：通过 SessionBox 页面会话拿登录 cookie，
// 自算 x-sign 签名后直连 chatglm.cn，对外提供 OpenAI 兼容 API。
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')

const SERVICE_PORT = Number(process.env.CHATGLM_API_PORT || 19206)

let serviceProcess = null

module.exports = {
  activate(context) {
    const sessionConfig = context.sessionServer.start()
    context.gateway.register(SERVICE_PORT)
    const serviceDir = path.join(__dirname, 'service')
    const log = fs.createWriteStream(path.join(serviceDir, 'service.log'), { flags: 'a' })
    serviceProcess = spawn(process.execPath, [path.join(serviceDir, 'server.js')], {
      cwd: serviceDir,
      env: {
        ...process.env,
        SESSIONBOX_API_URL: `http://127.0.0.1:${sessionConfig.port}`,
        SESSIONBOX_API_TOKEN: sessionConfig.token,
        CHATGLM_API_PORT: String(SERVICE_PORT)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    serviceProcess.stdout.pipe(log)
    serviceProcess.stderr.pipe(log)
    for (const stream of [serviceProcess.stdout, serviceProcess.stderr]) {
      readline.createInterface({ input: stream }).on('line', (line) => {
        if (line.startsWith('CHATGLM_DIAG ')) context.logger.info(line)
      })
    }
    serviceProcess.on('error', (error) => context.logger.error(`ChatGLM 服务启动失败: ${error.message}`))
    context.logger.info(`ChatGLM API Bridge 已激活，端口 ${SERVICE_PORT}，经 /api/chatglm-api/** 访问`)
  },
  deactivate(context) {
    if (serviceProcess && !serviceProcess.killed) serviceProcess.kill()
    serviceProcess = null
    context.sessionServer.stop()
    context.logger.info('ChatGLM API Bridge 已停用')
  }
}
