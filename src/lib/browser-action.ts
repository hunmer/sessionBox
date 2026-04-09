import { injectBrowserAction as injectBrowserActionImpl } from '../../node_modules/electron-chrome-extensions/dist/esm/browser-action.mjs'

let injected = false

export function ensureBrowserActionInjected(): void {
  if (injected || customElements.get('browser-action-list')) {
    injected = true
    return
  }

  injectBrowserActionImpl()
  injected = true
}
