function markExecuted() {
  if (!document.documentElement) {
    setTimeout(markExecuted, 0)
    return
  }
  document.documentElement.dataset.chromeUserScriptsMv3Probe = 'executed'
  if (typeof chrome?.runtime?.id === 'string') {
    document.documentElement.dataset.chromeUserScriptsMv3RuntimeId = 'executed'
  }
  const port = chrome?.runtime?.connect?.({ name: 'probe' })
  if (port && typeof port.postMessage === 'function') {
    document.documentElement.dataset.chromeUserScriptsMv3RuntimeConnect = 'executed'
    port.disconnect()
  }
  chrome.runtime.sendMessage({ type: 'user-script-message-probe', value: 'round-trip' }, (response) => {
    if (response?.type === 'user-script-message-response' && response.value === 'round-trip') {
      document.documentElement.dataset.chromeUserScriptsMv3RuntimeMessage = 'executed'
    }
  })
  console.log('[chrome-userScripts-mv3] probe-executed')
}

markExecuted()
