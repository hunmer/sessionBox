export function buildWebStoreDownloadUrl(extensionId: string, chromiumVersion: string): string {
  const url = new URL('https://clients2.google.com/service/update2/crx')
  url.searchParams.set('response', 'redirect')
  url.searchParams.set('prodversion', chromiumVersion)
  url.searchParams.set('acceptformat', 'crx2,crx3')
  url.searchParams.set('x', `id=${extensionId}&installsource=ondemand&uc`)
  return url.toString()
}

export interface ExtensionDownloadProgress {
  received: number
  total: number | null
}

export async function readExtensionArchive(
  response: Response,
  onProgress: (progress: ExtensionDownloadProgress) => void
): Promise<Buffer> {
  const length = Number(response.headers.get('content-length'))
  const total = Number.isFinite(length) && length > 0 ? length : null
  if (!response.body) {
    const archive = Buffer.from(await response.arrayBuffer())
    onProgress({ received: archive.length, total })
    return archive
  }

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let received = 0
  let lastUpdate = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(Buffer.from(value))
    received += value.byteLength
    const now = Date.now()
    if (now - lastUpdate >= 100 || (total !== null && received >= total)) {
      onProgress({ received, total })
      lastUpdate = now
    }
  }
  onProgress({ received, total })
  return Buffer.concat(chunks, received)
}
