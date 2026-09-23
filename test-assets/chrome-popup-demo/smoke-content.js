chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'sessionbox-content-smoke') {
    sendResponse({ ok: true })
  }
})
