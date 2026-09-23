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
    port.onMessage.addListener((response) => {
      if (response?.type === 'user-script-port-sender-response' && typeof response.tabId === 'number') {
        document.documentElement.dataset.chromeUserScriptsMv3RuntimePortSender = 'executed'
        document.documentElement.dataset.chromeUserScriptsMv3RuntimePortTabId = String(response.tabId)
        port.disconnect()
      }
    })
    port.postMessage({ type: 'user-script-port-sender-probe' })
  }
  chrome.runtime.sendMessage({ type: 'user-script-message-probe', value: 'round-trip' }, (response) => {
    if (response?.type === 'user-script-message-response' && response.value === 'round-trip') {
      document.documentElement.dataset.chromeUserScriptsMv3RuntimeMessage = 'executed'
    }
  })
  console.log('[chrome-userScripts-mv3] probe-executed')
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'tabs-message-async-callback-probe') {
    setTimeout(() => {
      sendResponse({
        type: 'tabs-message-async-callback-response',
        value: message.value,
      })
    }, 25)
    return true
  }

  if (message?.type === 'tabs-message-promise-probe') {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          type: 'tabs-message-promise-response',
          value: message.value,
        })
      }, 25)
    })
  }

  return undefined
})

if (location.search.includes('port-lifecycle=1')) {
  chrome.runtime.connect({ name: 'lifecycle-probe' })
}

markExecuted()
