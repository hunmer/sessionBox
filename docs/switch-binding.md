# Switch 组件绑定规范

## 规则

统一用 `:model-value` + `@update:model-value`，禁止用 `:checked` + `@update:checked`。

```vue
<!-- 正确 -->
<Switch :model-value="val" @update:model-value="handler" />

<!-- 错误 - 状态不同步 -->
<Switch :checked="val" @update:checked="handler" />
```

## 原因

`Switch.vue` 内部把 prop 传给 reka-ui 的 `SwitchRoot`，它用 `useVModel` 做受控绑定。走 `checked` 间接传入会导致 `useVModel` 的同步更新链断裂，switch 拨了但视觉状态不更新。
