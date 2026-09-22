(() => {
  document.documentElement.dataset.sessionBoxPopupDemoUserscript = 'before-alert'
  console.log('[SessionBox Popup Demo] userscript', { time: new Date().toISOString(), phase: 'before-alert' })

  alert(1)

  document.documentElement.dataset.sessionBoxPopupDemoUserscript = 'after-alert'
  console.log('[SessionBox Popup Demo] userscript', { time: new Date().toISOString(), phase: 'after-alert' })
})()
