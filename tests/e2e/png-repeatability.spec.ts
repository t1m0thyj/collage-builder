import { test, expect } from './test-fixtures'
import {
  assignSidebarImage,
  createHash,
  downloadBytes,
  exportCurrentPng,
  realPhotoPath,
  unzipSync,
} from './test-helpers'

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

for (const renderer of ['worker', 'main-thread', 'legacy-canvas', 'offscreen-failure']) {
  test(`repeated PNG exports have identical bytes on the ${renderer}`, async ({
    page,
  }, testInfo) => {
    if (renderer !== 'worker')
      await page.addInitScript(() => {
        Object.defineProperty(window, 'Worker', { value: undefined, configurable: true })
      })
    if (renderer === 'legacy-canvas')
      await page.addInitScript(() => {
        Object.defineProperty(window, 'OffscreenCanvas', { value: undefined, configurable: true })
      })
    if (renderer === 'offscreen-failure')
      await page.addInitScript(() => {
        OffscreenCanvas.prototype.convertToBlob = async () => {
          throw new Error('Offscreen encoding unavailable')
        }
      })
    await page.goto('/')
    await page.getByTestId('photo-upload-input').setInputFiles(realPhotoPath)
    await assignSidebarImage(page, 'real-photo-still-life.png', 1)
    const first = await downloadBytes(await exportCurrentPng(page, 800))
    const second = await downloadBytes(await exportCurrentPng(page, 800))
    expect(hash(second)).toBe(hash(first))
    expect(second.length).toBe(first.length)
    if (renderer === 'worker') {
      // A supported worker can fail and force the canvas fallback on a later export.
      await page.evaluate(() => {
        Object.defineProperty(window, 'Worker', { value: undefined, configurable: true })
      })
      const fallback = await downloadBytes(await exportCurrentPng(page, 800))
      await testInfo.attach('worker.png', { body: first, contentType: 'image/png' })
      await testInfo.attach('fallback.png', { body: fallback, contentType: 'image/png' })
      expect(hash(fallback)).toBe(hash(first))
    }
  })
}

test('repeated bulk PNG exports have identical image and ZIP bytes across different export times', async ({
  page,
}) => {
  await page.goto('/')
  await page.clock.setFixedTime(new Date('2026-10-09T13:20:14Z'))
  await page.getByTestId('photo-upload-input').setInputFiles(realPhotoPath)
  await assignSidebarImage(page, 'real-photo-still-life.png', 1)
  await page.getByRole('button', { name: 'Add page' }).click()
  const exportZip = async (time: string) => {
    await page.clock.setFixedTime(new Date(time))
    await page.getByRole('button', { name: 'Choose export scope' }).click()
    await page.getByRole('menuitem', { name: 'All pages (ZIP)' }).click()
    const dialog = page.getByRole('dialog', { name: 'Export pages' })
    await dialog.getByRole('spinbutton', { name: 'Long side (px)' }).fill('800')
    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Export', exact: true }).click()
    return downloadBytes(await download)
  }
  const first = await exportZip('2026-10-10T12:00:00Z')
  const second = await exportZip('2026-10-10T12:00:10Z')
  expect(first.readUInt16LE(10)).toBe((13 << 11) | (20 << 5) | 7)
  expect(first.readUInt16LE(12)).toBe((46 << 9) | (10 << 5) | 9)
  const firstImages = unzipSync(first)
  const secondImages = unzipSync(second)
  expect(Object.keys(secondImages)).toEqual(Object.keys(firstImages))
  for (const name of Object.keys(firstImages))
    expect(hash(secondImages[name]), name).toBe(hash(firstImages[name]))
  expect(hash(second)).toBe(hash(first))
})
