(function () {
  const existing = document.getElementById('sessionBoxRecordingMvp')
  if (existing) {
    existing.focus()
    return
  }

  const panel = document.createElement('section')
  panel.id = 'sessionBoxRecordingMvp'
  panel.tabIndex = -1
  panel.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'top:10%',
    'right:24px',
    'width:300px',
    'padding:12px',
    'border:1px solid #c7c7c7',
    'border-radius:6px',
    'background:rgba(255,255,255,.96)',
    'color:#111827',
    'font:13px/1.5 system-ui,sans-serif',
    'box-shadow:0 8px 24px rgba(15,23,42,.2)',
  ].join(';')
  panel.innerHTML = '<strong>Video Recording MVP</strong><p id="sessionBoxRecordingMvpStatus">面板已显示，可开始录制。</p><button type="button">关闭</button>'
  panel.querySelector('button').addEventListener('click', () => panel.remove())
  document.documentElement.appendChild(panel)
  panel.focus()
  console.log('[SessionBox Popup Demo] recording MVP panel displayed')
})()
