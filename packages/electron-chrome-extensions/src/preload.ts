import { injectExtensionAPIs } from './renderer'
import { injectUserScriptsAtDocumentStart } from './renderer/user-scripts'

// MV3 service workers execute their background script immediately after the
// preload. Install the API bridge first so the worker cannot capture Chromium's
// partial `chrome.*` objects before SessionBox extends them.
if (process.type === 'service-worker') {
  injectExtensionAPIs()
} else {
  injectUserScriptsAtDocumentStart()
}

// Only load extension APIs within extension page context.
const extensionUrl = typeof location === 'undefined' ? undefined : location.href
if (process.type === 'service-worker' || extensionUrl?.startsWith('chrome-extension://')) {
  if (process.type !== 'service-worker') injectExtensionAPIs()
}
