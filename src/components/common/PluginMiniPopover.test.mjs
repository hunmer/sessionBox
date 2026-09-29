import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse } from 'vue/compiler-sfc'

test('mini popover opens default behavior only for configured plugins', () => {
  const source = readFileSync(new URL('./PluginMiniPopover.vue', import.meta.url), 'utf8')
  const { descriptor } = parse(source)
  const template = descriptor.template.ast
  const buttons = []
  const visit = (node) => {
    if (node.type === 1 && node.tag === 'Button') buttons.push(node)
    for (const child of node.children ?? []) visit(child)
  }
  visit(template)

  const button = buttons.find((node) => node.props.some((prop) =>
    prop.type === 7 && prop.name === 'if' && prop.exp?.content === 'plugin.defaultBehavior'
  ))
  assert.ok(button, 'default behavior button should be conditional')
  assert.ok(button.props.some((prop) => prop.type === 7 && prop.name === 'on'
    && prop.arg?.content === 'click' && prop.exp?.content === 'handleOpenDefault(plugin.id)'))
  assert.match(descriptor.scriptSetup.content, /window\.api\.plugin\.openDefault\(pluginId\)/)
})
