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
const createWindowButton = document.getElementById('createWindowButton')
const removeWindowButton = document.getElementById('removeWindowButton')
const smokeToggle = document.getElementById('smokeToggle')
let testWindowId = null

function setStatus(message) {
  status.textContent = message
}

async function readSessionInfo() {
  const manifest = chrome.runtime.getManifest()
  const platform = await chrome.runtime.getPlatformInfo()
  const [local, session] = await Promise.all([
    chrome.storage.local.get(['sessionBoxApiSmoke', 'sessionBoxApiSmokeEnabled']),
    chrome.storage.session.get(['sessionBoxSessionSmoke']),
  ])

  fields.extensionId.textContent = chrome.runtime.id
  fields.version.textContent = manifest.version
  fields.sessionUrl.textContent = chrome.runtime.getURL('popup.html')
  fields.platform.textContent = platform.os
  fields.smokeStatus.textContent = local.sessionBoxApiSmoke && session.sessionBoxSessionSmoke
    ? 'API smoke 已通过'
    : '等待 service worker smoke'
  smokeToggle.checked = local.sessionBoxApiSmokeEnabled !== false
}

smokeToggle.addEventListener('change', async () => {
  await chrome.storage.local.set({ sessionBoxApiSmokeEnabled: smokeToggle.checked })
  setStatus(smokeToggle.checked ? '已开启自动 API Smoke' : '已关闭自动 API Smoke')
})

createWindowButton.addEventListener('click', async () => {
  try {
    const windowInfo = await chrome.windows.create({
      url: chrome.runtime.getURL('recording.html'),
      type: 'popup',
      width: 640,
      height: 420,
      focused: true,
    })
    testWindowId = windowInfo?.id ?? null
    setStatus(`windows.create 成功，windowId=${testWindowId}`)
  } catch (error) {
    setStatus(`windows.create 失败：${error.message}`)
  }
})

removeWindowButton.addEventListener('click', async () => {
  if (testWindowId == null) {
    setStatus('请先创建测试窗口')
    return
  }
  try {
    await chrome.windows.remove(testWindowId)
    setStatus(`windows.remove 已调用，windowId=${testWindowId}`)
    testWindowId = null
  } catch (error) {
    setStatus(`windows.remove 失败：${error.message}`)
  }
})

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
