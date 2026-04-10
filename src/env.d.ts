/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module 'vue3-emoji-picker' {
  import type { DefineComponent } from 'vue'
  const EmojiPicker: DefineComponent<{
    native?: boolean
    hideSearch?: boolean
    hideGroupIcons?: boolean
    hideGroupNames?: boolean
    disableStickyGroupNames?: boolean
    disableSkinTones?: boolean
    disabledGroups?: string[]
    groupNames?: Record<string, string>
    staticTexts?: { placeholder?: string; skinTone?: string }
    pickerType?: string
    mode?: string
    offset?: number
    additionalGroups?: Record<string, unknown[]>
    groupOrder?: string[]
    groupIcons?: Record<string, unknown>
    displayRecent?: boolean
    theme?: string
  }>
  export default EmojiPicker
}

interface Window {
  api: import('../preload/index').IpcAPI
}
