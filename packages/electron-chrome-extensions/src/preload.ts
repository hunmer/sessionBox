import { injectExtensionAPIs } from './renderer'
import { injectUserScriptsAtDocumentStart } from './renderer/user-scripts'

injectUserScriptsAtDocumentStart()

// Only load extension APIs within extension page context.
const extensionUrl = typeof location === 'undefined' ? undefined : location.href
if (process.type === 'service-worker' || extensionUrl?.startsWith('chrome-extension://')) {
  console.info('[electron-chrome-extensions] injecting extension APIs', {
    type: process.type,
    url: extensionUrl,
  })
  injectExtensionAPIs()
}
