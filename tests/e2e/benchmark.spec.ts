import { expect, test } from '@playwright/test'
import { deflateSync } from 'node:zlib'

function crc32(buffer: Buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, checksum])
}

function solidPng(red: number, green: number, blue: number) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(96, 0)
  header.writeUInt32BE(64, 4)
  header[8] = 8
  header[9] = 6
  const scanlines = Buffer.alloc((96 * 4 + 1) * 64)
  for (let y = 0; y < 64; y += 1) {
    const row = y * (96 * 4 + 1)
    for (let x = 0; x < 96; x += 1) {
      const offset = row + 1 + x * 4
      scanlines[offset] = red
      scanlines[offset + 1] = green
      scanlines[offset + 2] = blue
      scanlines[offset + 3] = 255
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

test('100 images and 25 pages @benchmark', async ({ page, browserName }) => {
  await page.goto('/')
  const images = Array.from({ length: 100 }, (_, index) => ({
    name: `benchmark-${String(index + 1).padStart(3, '0')}.png`,
    mimeType: 'image/png',
    buffer: solidPng(index, 255 - index, (index * 37) % 256),
  }))
  const startedAt = performance.now()
  await page
    .locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]')
    .first()
    .setInputFiles(images)
  await page.getByRole('tab', { name: 'Images' }).click()
  await expect(page.getByText('benchmark-100.png', { exact: true })).toBeVisible()
  const importedAt = performance.now()
  for (let pageNumber = 2; pageNumber <= 25; pageNumber += 1)
    await page.getByRole('button', { name: 'Add page' }).click()
  await expect(page.getByRole('button', { name: 'Choose page' })).toContainText('Page 25')
  const finishedAt = performance.now()

  console.info(
    JSON.stringify({
      benchmark: '100 images / 25 pages',
      browser: browserName,
      importMs: Math.round(importedAt - startedAt),
      pageCreationMs: Math.round(finishedAt - importedAt),
      totalMs: Math.round(finishedAt - startedAt),
    }),
  )
})
