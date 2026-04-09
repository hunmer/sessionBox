const countValue = document.getElementById('countValue')
const countButton = document.getElementById('countButton')
const resetButton = document.getElementById('resetButton')

async function readCount() {
  const result = await chrome.storage.local.get(['clickCount'])
  return Number(result.clickCount || 0)
}

async function writeCount(count) {
  await chrome.storage.local.set({ clickCount: count })
  countValue.textContent = String(count)
}

countButton.addEventListener('click', async () => {
  const current = await readCount()
  await writeCount(current + 1)
})

resetButton.addEventListener('click', async () => {
  await writeCount(0)
})

void readCount().then((count) => {
  countValue.textContent = String(count)
})
