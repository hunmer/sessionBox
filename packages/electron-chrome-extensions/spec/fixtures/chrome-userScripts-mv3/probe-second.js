function markSecondExecution() {
  if (!document.documentElement) {
    setTimeout(markSecondExecution, 0)
    return
  }
  document.documentElement.dataset.chromeUserScriptsMv3ProbeSecond = 'executed'
}

markSecondExecution()
