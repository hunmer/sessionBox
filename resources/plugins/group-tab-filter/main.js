module.exports = {
  activate(context) {
    context.logger.info('Group Tab Filter 插件已激活')

    // 记录当前过滤的分组 ID
    let currentGroupId = null

    // 监听标签页激活事件
    context.events.on('tab:activated', function(data) {
      var groupId = data.groupId
      var tabId = data.tabId

      // 无分组信息时清除过滤
      if (!groupId) {
        if (currentGroupId !== null) {
          context.logger.info('标签页 ' + tabId + ' 无分组，清除过滤')
          context.sendToRenderer('on:tab:set-group-filter', null)
          currentGroupId = null
        }
        return
      }

      // 分组未变化时不重复发送
      if (groupId === currentGroupId) return

      currentGroupId = groupId
      context.logger.info('标签页 ' + tabId + ' 激活，过滤到分组: ' + groupId)
      context.sendToRenderer('on:tab:set-group-filter', groupId)
    })

    // 插件停用时清除过滤
    context.storage.set('activatedAt', new Date().toISOString())
  },

  deactivate(context) {
    // 停用时清除过滤，恢复显示所有标签
    if (context && context.sendToRenderer) {
      context.sendToRenderer('on:tab:set-group-filter', null)
    }
    console.log('[GroupTabFilter] 已停用，过滤已清除')
  }
}
