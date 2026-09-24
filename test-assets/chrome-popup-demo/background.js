const userScript = {
  id: 'session-box-popup-demo-userscript',
  matches: ['<all_urls>'],
  js: [{ file: 'userscript.js' }],
  runAt: 'document_start',
  world: 'USER_SCRIPT'
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'sessionbox-recording-mvp') {
    const tabId = Number(message.tabId)
    if (!Number.isInteger(tabId)) {
      sendResponse({ ok: false, error: 'active tabId is required' })
      return false
    }
    chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ['recording-mvp.js'],
      injectImmediately: true,
      world: 'MAIN',
    }).then((results) => {
      const frames = Array.isArray(results) ? results.length : 0
      if (!Array.isArray(results)) {
        sendResponse({ ok: false, error: 'scripting.executeScript returned no results' })
        return
      }
      console.log('[SessionBox Popup Demo] RECORDING_MVP_INJECTED', JSON.stringify({ tabId, frames }))
      sendResponse({ ok: true, results })
    }).catch((error) => {
      console.error('[SessionBox Popup Demo] RECORDING_MVP_FAILURE', error)
      sendResponse({ ok: false, error: error?.message || String(error) })
    })
    return true
  }
  if (message?.type === 'sessionbox-download-mvp') {
    chrome.downloads.download({
      url: 'data:text/plain,sessionbox-download-mvp',
      filename: 'sessionbox/download-mvp.txt',
      saveAs: false,
    }).then(async (id) => {
      const [item] = await chrome.downloads.search({ id })
      if (!item) throw new Error(`downloads.search did not find id ${id}`)
      console.log('[SessionBox Popup Demo] DOWNLOAD_MVP_STARTED', JSON.stringify({ id, state: item.state }))
      sendResponse({ ok: true, id, state: item.state })
    }).catch((error) => {
      console.error('[SessionBox Popup Demo] DOWNLOAD_MVP_FAILURE', error)
      sendResponse({ ok: false, error: error?.message || String(error) })
    })
    return true
  }
  if (message?.type !== 'sessionbox-api-smoke') return false
  sendResponse({ ok: true, echo: message.value })
  return false
})
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sessionbox-api-smoke') port.disconnect()
})
chrome.storage.onChanged.addListener(() => {})

const smokeFailures = []
for (const [name, value] of [
  ['runtime.reload', chrome.runtime.reload],
  ['tabs.reload', chrome.tabs.reload],
  ['tabs.update', chrome.tabs.update],
  ['downloads.download', chrome.downloads.download],
  ['scripting.executeScript', chrome.scripting.executeScript],
]) {
  if (typeof value !== 'function') smokeFailures.push(`${name} unavailable`)
}
const smokeEvents = [
  ['runtime.onInstalled', chrome.runtime.onInstalled],
  ['runtime.onConnect', chrome.runtime.onConnect],
  ['runtime.onMessageExternal', chrome.runtime.onMessageExternal],
  ['tabs.onActivated', chrome.tabs.onActivated],
  ['tabs.onHighlighted', chrome.tabs.onHighlighted],
  ['tabs.onRemoved', chrome.tabs.onRemoved],
  ['tabs.onUpdated', chrome.tabs.onUpdated],
  ['webNavigation.onBeforeNavigate', chrome.webNavigation.onBeforeNavigate],
  ['webNavigation.onCommitted', chrome.webNavigation.onCommitted],
  ['webNavigation.onCompleted', chrome.webNavigation.onCompleted],
  ['webNavigation.onHistoryStateUpdated', chrome.webNavigation.onHistoryStateUpdated],
  ['webRequest.onBeforeRequest', chrome.webRequest.onBeforeRequest],
  ['webRequest.onErrorOccurred', chrome.webRequest.onErrorOccurred],
  ['webRequest.onResponseStarted', chrome.webRequest.onResponseStarted],
  ['webRequest.onSendHeaders', chrome.webRequest.onSendHeaders],
  ['windows.onFocusChanged', chrome.windows.onFocusChanged],
  ['contextMenus.onClicked', chrome.contextMenus.onClicked],
  ['commands.onCommand', chrome.commands.onCommand],
  ['downloads.onChanged', chrome.downloads.onChanged],
]
for (const [name, event] of smokeEvents) {
  try {
    const filter = name.startsWith('webRequest.') ? { urls: ['<all_urls>'] } : undefined
    if (filter) event?.addListener(() => {}, filter)
    else event?.addListener(() => {})
  } catch (error) {
    smokeFailures.push(`${name}: ${error.message}`)
  }
}

async function runApiSmokeTest() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
  await chrome.sidePanel.setOptions({ path: 'popup.html' })
  const panelBehavior = await chrome.sidePanel.getPanelBehavior()
  await chrome.storage.local.set({ sessionBoxApiSmoke: true })
  const stored = await chrome.storage.local.get(['sessionBoxApiSmoke'])
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const response = await chrome.runtime.sendMessage({
    type: 'sessionbox-api-smoke',
    value: 'runtime.sendMessage'
  })
  await chrome.action.setBadgeText({ text: 'OK' })

  await chrome.action.setTitle({ title: 'SessionBox API smoke' })
  await chrome.action.setIcon({ path: 'smoke-icon.svg' })
  await chrome.storage.sync.set({ sessionBoxSyncSmoke: true })
  await chrome.storage.session.set({ sessionBoxSessionSmoke: true })
  const platform = await chrome.runtime.getPlatformInfo()
  const manifest = chrome.runtime.getManifest()
  const smokeUrl = chrome.runtime.getURL('popup.html')
  const port = chrome.runtime.connect({ name: 'sessionbox-api-smoke' })
  port.disconnect()
  await chrome.contextMenus.removeAll()
  chrome.contextMenus.create({ id: 'sessionbox-api-smoke', title: 'SessionBox API smoke', contexts: ['page'] })
  const frames = await chrome.webNavigation.getAllFrames({ tabId: tabs[0]?.id })
  const tab = tabs[0]?.id == null ? null : await chrome.tabs.get(tabs[0].id)
  const currentTab = await chrome.tabs.getCurrent()
  if (tabs[0]?.id != null) await chrome.tabs.update(tabs[0].id, { active: true })
  const executed = await chrome.scripting.executeScript({
    target: { tabId: tabs[0]?.id },
    files: ['smoke-script.js'],
  })
  if (tabs[0]?.id != null) {
    await chrome.tabs.highlight({ tabs: [tabs[0].index] })
    const contentResponse = await chrome.tabs.sendMessage(tabs[0].id, { type: 'sessionbox-content-smoke' })
    if (contentResponse?.ok !== true) {
      console.log('[SessionBox Popup Demo] tabs.sendMessage had no receiver on existing tab')
    }
  }
  const createdTab = await chrome.tabs.create({ url: 'about:blank', active: false })
  if (createdTab?.id != null) await chrome.tabs.remove(createdTab.id)
  const downloadId = await chrome.downloads.download({ url: 'data:text/plain,sessionbox-download-smoke', filename: 'sessionbox-api-smoke.txt', saveAs: false })
  if (typeof downloadId !== 'number') smokeFailures.push('downloads.download did not return an id')
  const downloadItems = await chrome.downloads.search({ id: downloadId })
  if (downloadItems[0]?.id !== downloadId) smokeFailures.push('downloads.search did not return the new download')

  if (chrome.alarms) {
    chrome.alarms.onAlarm.addListener(() => {})
    await chrome.alarms.create('sessionbox-api-smoke', { delayInMinutes: 1 })
    await chrome.alarms.get('sessionbox-api-smoke')
  } else smokeFailures.push('alarms namespace unavailable')
  if (chrome.declarativeNetRequest) {
    await chrome.declarativeNetRequest.getSessionRules()
    await chrome.declarativeNetRequest.updateSessionRules({ addRules: [], removeRuleIds: [] })
  } else smokeFailures.push('declarativeNetRequest namespace unavailable')

  if (typeof chrome.management?.uninstallSelf === 'function') {
    console.log('[SessionBox Popup Demo] management.uninstallSelf skipped (destructive API)')
  }

  if (
    panelBehavior?.openPanelOnActionClick !== false ||
    stored.sessionBoxApiSmoke !== true ||
    !Array.isArray(tabs) ||
    response?.ok !== true
    || !Array.isArray(frames)
    || !tab
    || !Array.isArray(executed)
    || !executed[0] || executed[0].error
    || smokeFailures.length > 0
  ) {
    throw new Error(`Chrome API smoke assertion failed: ${smokeFailures.join('; ')}`)
  }

  console.log('[SessionBox Popup Demo] API_SMOKE_SUCCESS', JSON.stringify({
    sidePanel: panelBehavior.openPanelOnActionClick,
    storage: stored.sessionBoxApiSmoke,
    tabs: tabs.length,
    runtime: response.echo,
    frames: frames.length,
    currentTab: currentTab?.id ?? null,
    downloadId,
    platform: platform.os,
    manifest: manifest.version,
    smokeUrl,
    apiGroups: ['action', 'alarms', 'commands', 'contextMenus', 'declarativeNetRequest', 'downloads', 'runtime', 'scripting', 'sidePanel', 'storage', 'tabs', 'webNavigation', 'webRequest', 'windows'],
  }))
}

async function registerUserScript() {
  const existing = await chrome.userScripts.getScripts({ ids: [userScript.id] })
  if (existing.length === 0) {
    await chrome.userScripts.register([userScript])
  } else {
    await chrome.userScripts.update([userScript])
  }
  console.log('[SessionBox Popup Demo] userscript registered')
}

void registerUserScript().catch((error) => {
  console.error('[SessionBox Popup Demo] userscript registration failed', error)
})

void chrome.storage.local.get(['sessionBoxApiSmokeEnabled']).then(({ sessionBoxApiSmokeEnabled }) => {
  // Smoke 只应由 popup 开关显式开启，避免 service worker 每次唤醒都创建临时 tab。
  if (sessionBoxApiSmokeEnabled !== true) {
    console.log('[SessionBox Popup Demo] API_SMOKE_DISABLED')
    return
  }
  return runApiSmokeTest().catch((error) => {
    console.error('[SessionBox Popup Demo] API_SMOKE_FAILURE', error)
  }).finally(() => {
    // Smoke 是一次性诊断动作；完成后自动关闭，避免 MV3 worker 周期性唤醒时重复创建 tab。
    return chrome.storage.local.set({ sessionBoxApiSmokeEnabled: false })
  })
})
