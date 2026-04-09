let injected = false

export async function ensureBrowserActionInjected(): Promise<void> {
  if (injected || customElements.get('browser-action-list')) {
    injected = true
    return
  }

  const { injectBrowserAction: injectBrowserActionImpl } = await import(
    '../../node_modules/electron-chrome-extensions/dist/esm/browser-action.mjs'
  )

  injectBrowserActionImpl()
  injected = true
}
