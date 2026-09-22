const script = {
  id: 'mv3-user-script-probe',
  matches: ['http://127.0.0.1/*'],
  js: [{ file: 'probe.js' }],
  runAt: 'document_start',
  world: 'USER_SCRIPT',
  worldId: 'probe-world'
}

const secondScript = {
  id: 'mv3-user-script-probe-second',
  matches: ['http://127.0.0.1/*'],
  js: [{ file: 'probe-second.js' }],
  runAt: 'document_start',
  world: 'USER_SCRIPT',
  worldId: 'probe-world'
}

const pendingScript = {
  id: 'mv3-user-script-pending-probe',
  matches: ['http://127.0.0.1/*'],
  js: [{ file: 'probe-pending.js' }],
  runAt: 'document_start',
  world: 'USER_SCRIPT',
  worldId: 'probe-world'
}

const worldLimitScript = {
  id: 'mv3-user-script-world-limit-probe',
  matches: ['http://127.0.0.1/*'],
  js: [{ file: 'probe-world-limit.js' }],
  runAt: 'document_start',
  world: 'USER_SCRIPT',
  worldId: 'limit-probe-0'
}

async function registerProbe() {
  await chrome.userScripts.configureWorld({
    worldId: script.worldId,
    csp: "script-src 'self' 'unsafe-eval'; object-src 'self'",
    messaging: true
  })
  await chrome.userScripts.configureWorld({
    worldId: worldLimitScript.worldId,
    csp: "script-src 'self'; object-src 'self'",
    messaging: true
  })
  const existing = await chrome.userScripts.getScripts({
    ids: [script.id, secondScript.id, pendingScript.id, worldLimitScript.id]
  })
  if (existing.length === 4) {
    await chrome.userScripts.update([script, secondScript, pendingScript, worldLimitScript])
  } else {
    await chrome.userScripts.register([script])
    await chrome.userScripts.register([secondScript])
    await chrome.userScripts.register([pendingScript])
    await chrome.userScripts.register([worldLimitScript])
  }
  console.log('[chrome-userScripts-mv3] probe-ready')
}

registerProbe().catch((error) => {
  console.error('[chrome-userScripts-mv3] probe-register-failed', error)
})
