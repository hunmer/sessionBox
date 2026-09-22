const script = {
  id: 'mv3-user-script-probe',
  matches: ['http://127.0.0.1/*'],
  js: [{ file: 'probe.js' }],
  runAt: 'document_start',
  world: 'USER_SCRIPT',
  worldId: 'probe-world'
}

async function registerProbe() {
  await chrome.userScripts.configureWorld({
    worldId: script.worldId,
    csp: "script-src 'self' 'unsafe-eval'; object-src 'self'",
    messaging: true
  })
  const existing = await chrome.userScripts.getScripts({ ids: [script.id] })
  if (existing.length > 0) {
    await chrome.userScripts.update([script])
  } else {
    await chrome.userScripts.register([script])
  }
  console.log('[chrome-userScripts-mv3] probe-ready')
}

registerProbe().catch((error) => {
  console.error('[chrome-userScripts-mv3] probe-register-failed', error)
})
