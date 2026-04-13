module.exports = {
  template: '<div class="p-4 space-y-4">'
    + '<h3 class="text-lg font-semibold">{{ pluginInfo.name }}</h3>'
    + '<p class="text-sm text-muted-foreground">{{ pluginInfo.description }}</p>'
    + '<div class="text-sm space-y-1">'
    + '  <div><span class="text-muted-foreground">版本：</span>{{ pluginInfo.version }}</div>'
    + '  <div><span class="text-muted-foreground">作者：</span>{{ pluginInfo.author.name }}</div>'
    + '</div>'
    + '<div class="text-xs text-muted-foreground bg-muted p-3 rounded-md">'
    + '  此插件为测试用，所有事件输出到主进程控制台。请打开 DevTools 查看日志。'
    + '</div>'
    + '</div>',

  props: {
    pluginInfo: { type: Object, default: function() { return {} } }
  },

  setup: function(props) {
    return { pluginInfo: props.pluginInfo }
  }
}
