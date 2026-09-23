const fields = {
  extensionId: document.getElementById('extensionId'),
  version: document.getElementById('version'),
  sessionUrl: document.getElementById('sessionUrl'),
  platform: document.getElementById('platform'),
  smokeStatus: document.getElementById('smokeStatus'),
}
const status = document.getElementById('status')
const reloadButton = document.getElementById('reloadButton')
const refreshButton = document.getElementById('refreshButton')

function setStatus(message) {
  status.textContent = message
}

async function readSessionInfo() {
  const manifest = chrome.runtime.getManifest()
  const platform = await chrome.runtime.getPlatformInfo()
  const [local, session] = await Promise.all([
    chrome.storage.local.get(['sessionBoxApiSmoke']),
    chrome.storage.session.get(['sessionBoxSessionSmoke']),
  ])

  fields.extensionId.textContent = chrome.runtime.id
  fields.version.textContent = manifest.version
  fields.sessionUrl.textContent = chrome.runtime.getURL('popup.html')
  fields.platform.textContent = platform.os
  fields.smokeStatus.textContent = local.sessionBoxApiSmoke && session.sessionBoxSessionSmoke
    ? 'API smoke 已通过'
    : '等待 service worker smoke'
}

reloadButton.addEventListener('click', async () => {
  reloadButton.disabled = true
  setStatus('正在 reload service worker...')
  await chrome.storage.session.set({ sessionBoxPopupReloadRequested: new Date().toISOString() })
  chrome.runtime.reload()
})

refreshButton.addEventListener('click', async () => {
  try {
    await readSessionInfo()
    setStatus('Session 信息已刷新')
  } catch (error) {
    setStatus(`读取失败：${error.message}`)
  }
})

void readSessionInfo().catch((error) => {
  setStatus(`读取失败：${error.message}`)
})
