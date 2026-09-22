function markExecuted() {
  if (!document.documentElement) {
    setTimeout(markExecuted, 0)
    return
  }
  document.documentElement.dataset.chromeUserScriptsMv3Probe = 'executed'
  console.log('[chrome-userScripts-mv3] probe-executed')
}

markExecuted()
