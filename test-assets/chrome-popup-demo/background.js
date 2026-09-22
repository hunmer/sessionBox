const userScript = {
  id: 'session-box-popup-demo-userscript',
  matches: ['<all_urls>'],
  js: [{ file: 'userscript.js' }],
  runAt: 'document_start',
  world: 'USER_SCRIPT'
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
