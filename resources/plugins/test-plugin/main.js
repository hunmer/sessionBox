module.exports = {
  activate(context) {
    context.logger.info('Test Plugin 已激活！')

    // 监听所有 IPC 调用
    context.events.on('ipc:**', function(data) {
      context.logger.info('[IPC] ' + this.event + ' → ' + data.channel)
    })

    // 监听数据模型事件
    context.events.on('group:*', function(data) {
      context.logger.info('[Group] ' + this.event)
    })

    context.events.on('container:*', function(data) {
      context.logger.info('[Container] ' + this.event)
    })

    context.events.on('workspace:*', function(data) {
      context.logger.info('[Workspace] ' + this.event)
    })

    context.events.on('page:*', function(data) {
      context.logger.info('[Page] ' + this.event)
    })

    context.events.on('tab:*', function(data) {
      context.logger.info('[Tab] ' + this.event)
    })

    // 写入存储测试
    context.storage.set('activatedAt', new Date().toISOString())
    context.storage.set('eventCount', 0)
    context.logger.info('存储测试数据已写入')
  },

  deactivate() {
    console.log('[TestPlugin] 已停用')
  }
}
