import { ipcRenderer } from 'electron'

const formatIpcName = (name: string) => `crx-${name}`
const shouldLogExtensionEvents = process.env.ELECTRON_CHROME_EXTENSIONS_DEBUG === 'verbose'

const listenerMap = new Map<string, number>()

export const addExtensionListener = (extensionId: string, name: string, callback: Function) => {
  if (shouldLogExtensionEvents && (name === 'runtime.onMessage' || name === 'runtime.onConnect')) {
    console.info('[electron-chrome-extensions] registering extension listener', { extensionId, name })
  }
  const listenerCount = listenerMap.get(name) || 0

  if (listenerCount === 0) {
    // TODO: should these IPCs be batched in a microtask?
    ipcRenderer.send('crx-add-listener', extensionId, name)
  }

  listenerMap.set(name, listenerCount + 1)

  ipcRenderer.addListener(formatIpcName(name), function (event, ...args) {
    if (shouldLogExtensionEvents) {
      console.log(name, '(result)', ...args)
    }
    callback(...args)
  })
}

export const removeExtensionListener = (extensionId: string, name: string, callback: any) => {
  if (listenerMap.has(name)) {
    const listenerCount = listenerMap.get(name) || 0

    if (listenerCount <= 1) {
      listenerMap.delete(name)

      ipcRenderer.send('crx-remove-listener', extensionId, name)
    } else {
      listenerMap.set(name, listenerCount - 1)
    }
  }

  ipcRenderer.removeListener(formatIpcName(name), callback)
}
