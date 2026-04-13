module.exports = {
  template: '<div class="p-4 space-y-4">'
    + '<h3 class="text-lg font-semibold">{{ pluginInfo.name }}</h3>'
    + '<p class="text-sm text-muted-foreground">{{ pluginInfo.description }}</p>'
    + '<div class="text-sm space-y-1">'
    + '  <div><span class="text-muted-foreground">版本：</span>{{ pluginInfo.version }}</div>'
    + '  <div><span class="text-muted-foreground">作者：</span>{{ pluginInfo.author.name }}</div>'
    + '</div>'
    + '<div class="text-xs text-muted-foreground bg-muted p-3 rounded-md">'
    + '  <p>启用后，切换标签页时标签栏会自动过滤，只展示当前标签所属分组的标签。</p>'
    + '  <p class="mt-1">停用插件后过滤自动清除，恢复显示所有标签。</p>'
    + '</div>'
    + '</div>',

  props: {
    pluginInfo: { type: Object, default: function() { return {} } }
  },

  setup: function(props) {
    return { pluginInfo: props.pluginInfo }
  }
}
