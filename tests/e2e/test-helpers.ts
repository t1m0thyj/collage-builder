import { expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { createProject } from '../../src/lib/domain/factories'
import { collageMimeType } from '../../src/lib/persistence/archive'

export type BrowserPage = import('@playwright/test').Page
type Locator = import('@playwright/test').Locator

export async function useWideSystemFont(page: BrowserPage) {
  // Exercise Linux CI's wider fallback metrics on other operating systems too.
  await page.addStyleTag({
    content: ':root { font-family: "DejaVu Sans", Verdana, sans-serif; }',
  })
}

export async function dropLocalFiles(
  target: Locator,
  files: Array<{ name: string; buffer: Buffer; mimeType?: string }>,
  point?: { x: number; y: number },
) {
  await target.evaluate(
    (element, { files, point }) => {
      const transfer = new DataTransfer()
      for (const file of files)
        transfer.items.add(
          new File([new Uint8Array(file.bytes)], file.name, { type: file.mimeType }),
        )
      const bounds = element.getBoundingClientRect()
      const eventOptions = {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
        clientX: point?.x ?? bounds.left + bounds.width / 2,
        clientY: point?.y ?? bounds.top + bounds.height / 2,
      }
      element.dispatchEvent(new DragEvent('dragover', eventOptions))
      element.dispatchEvent(new DragEvent('drop', eventOptions))
    },
    {
      files: files.map((file) => ({
        name: file.name,
        bytes: [...file.buffer],
        mimeType: file.mimeType ?? 'image/png',
      })),
      point,
    },
  )
}

export function crc32(buffer: Buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
export function pngChunk(type: string, data: Buffer) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, checksum])
}
export function solidPng(red: number, green: number, blue: number, width = 96, height = 64) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const scanlines = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    for (let x = 0; x < width; x += 1) {
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
export const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
export const redPng = solidPng(238, 45, 54)
export const bluePng = solidPng(30, 110, 230)
export const realPhotoPath = join(process.cwd(), 'tests', 'fixtures', 'real-photo-still-life.png')
export function visualParityArchive() {
  const document = createProject('Visual parity')
  const assetId = '11111111-1111-4111-8111-111111111111'
  document.assets[assetId] = {
    id: assetId,
    originalName: 'red.png',
    mediaType: 'image/png',
    byteLength: redPng.byteLength,
    width: 96,
    height: 64,
    sha256: createHash('sha256').update(redPng).digest('hex'),
    storage: { kind: 'embedded', archivePath: `assets/${assetId}` },
  }

  const page = (
    name: string,
    options: {
      padding: number
      cornerRadius: number
      transparentBackground: boolean
      shadow: {
        enabled: boolean
        color: string
        opacity: number
        blur: number
        offsetX: number
        offsetY: number
      }
    },
  ) => {
    const result = createProject().pages[0]
    const slotId = Object.keys(result.slots)[0]
    result.name = name
    result.width = 100
    result.height = 100
    result.layout = {
      presetId: `visual-${name.toLowerCase().replaceAll(' ', '-')}`,
      presetRevision: 1,
      root: { kind: 'leaf', slotId },
    }
    result.slots = {
      [slotId]: { assetId, placement: { zoom: 1, positionX: 0.5, positionY: 0.5 } },
    }
    result.style = {
      backgroundColor: '#00FF00',
      padding: options.padding,
      gap: 0,
      cornerRadius: options.cornerRadius,
      transparentBackground: options.transparentBackground,
      shadow: options.shadow,
    }
    return result
  }

  document.pages = [
    page('Rounded', {
      padding: 0,
      cornerRadius: 20,
      transparentBackground: true,
      shadow: { enabled: false, color: '#000000', opacity: 0, blur: 0, offsetX: 0, offsetY: 0 },
    }),
    page('Transparent', {
      padding: 10,
      cornerRadius: 0,
      transparentBackground: true,
      shadow: { enabled: false, color: '#000000', opacity: 0, blur: 0, offsetX: 0, offsetY: 0 },
    }),
    page('Shadow', {
      padding: 20,
      cornerRadius: 0,
      transparentBackground: true,
      shadow: { enabled: true, color: '#000000', opacity: 0.5, blur: 0, offsetX: 8, offsetY: 0 },
    }),
  ]

  return zipSync({
    mimetype: strToU8(collageMimeType),
    'document.json': strToU8(JSON.stringify(document)),
    [`assets/${assetId}`]: redPng,
  })
}
export function missingPhotoArchive() {
  const document = createProject('Missing photo')
  const assetId = '11111111-1111-4111-8111-111111111111'
  document.assets[assetId] = {
    id: assetId,
    originalName: 'red.png',
    mediaType: 'image/png',
    byteLength: redPng.byteLength,
    width: 96,
    height: 64,
    sha256: createHash('sha256').update(redPng).digest('hex'),
    storage: { kind: 'embedded', archivePath: `assets/${assetId}` },
  }
  document.pages[0].slots[Object.keys(document.pages[0].slots)[0]] = {
    assetId,
    placement: { zoom: 1, positionX: 0.5, positionY: 0.5 },
  }
  return zipSync({
    mimetype: strToU8(collageMimeType),
    'document.json': strToU8(JSON.stringify(document)),
  })
}
export async function importImage(
  page: BrowserPage,
  name: string,
  buffer = onePixelPng,
  mimeType = 'image/png',
  expectedSummary = '1 added · 0 skipped',
) {
  const previousSummary = page.getByRole('button', { name: 'Dismiss import summary' })
  if (await previousSummary.isVisible()) {
    await previousSummary.click()
    await expect(previousSummary).toBeHidden()
  }
  await page.getByTestId('photo-upload-input').setInputFiles({
    name,
    mimeType,
    buffer,
  })
  const summary = page.locator('.import-summary')
  if (expectedSummary.startsWith('1 added')) {
    await expect(page.locator('.toast')).toHaveText('1 photo added.')
    await expect(summary).toHaveCount(0)
    await expect(page.getByText(name, { exact: true })).toBeAttached()
  } else {
    await expect(summary).toHaveClass(/import-has-errors/)
    await expect(summary).toContainText(expectedSummary)
  }
}
export async function encodedRaster(
  page: BrowserPage,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
) {
  const encoded = await page.evaluate(async (type) => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const context = canvas.getContext('2d')!
    context.fillStyle = '#e83f57'
    context.fillRect(0, 0, 2, 2)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type))
    if (!blob) throw new Error(`Unable to encode ${type}`)
    return { type: blob.type, bytes: [...new Uint8Array(await blob.arrayBuffer())] }
  }, mimeType)
  expect(encoded.type).toBe(mimeType)
  return Buffer.from(encoded.bytes)
}
export async function pngDimensions(download: import('@playwright/test').Download) {
  const png = await downloadBytes(download)
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}
export async function downloadBytes(download: import('@playwright/test').Download) {
  const stream = await download.createReadStream()
  if (!stream) throw new Error('Export download could not be read')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}
export function comparableProjectDocument(document: unknown) {
  // Layout-grid cell keys are legacy editor metadata. They are intentionally
  // removed by the archive parser and do not affect the rendered project.
  return JSON.parse(JSON.stringify(document, (key, value) => (key === 'key' ? undefined : value)))
}
export async function rasterDimensions(page: BrowserPage, bytes: Buffer) {
  return page.evaluate(
    async (encoded) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(encoded)]))
      try {
        return { width: bitmap.width, height: bitmap.height }
      } finally {
        bitmap.close()
      }
    },
    [...bytes],
  )
}
export async function sampleDownloadedPng(
  page: BrowserPage,
  download: import('@playwright/test').Download,
  points: Array<{ x: number; y: number }>,
) {
  const bytes = await downloadBytes(download)
  return page.evaluate(
    async ({ encoded, points }) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(encoded)]))
      try {
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext('2d', { willReadFrequently: true })!
        context.drawImage(bitmap, 0, 0)
        return points.map(({ x, y }) => [
          ...context.getImageData(Math.round(x), Math.round(y), 1, 1).data,
        ])
      } finally {
        bitmap.close()
      }
    },
    { encoded: [...bytes], points },
  )
}
export async function exportCurrentPng(page: BrowserPage, longSide: number) {
  await page.getByRole('button', { name: 'Export…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export pages' })
  await dialog.getByRole('spinbutton', { name: 'Long side (px)' }).fill(String(longSide))
  // Wait for the bound settings to reach the output preview before downloading.
  await expect(dialog).toContainText(
    new RegExp(
      `(?:Output|Current page output):\\s*(?:${longSide}\\s*×\\s*\\d+|\\d+\\s*×\\s*${longSide})\\s*px`,
    ),
  )
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  return downloadPromise
}
export async function chooseTwoColumnLayout(page: BrowserPage) {
  await page.getByRole('tab', { name: 'Layouts' }).click()
  await page.getByRole('tab', { name: '2', exact: true }).click()
  await page.locator('[data-layout-id="generated-2-ta31c7d0995c75a09"]').click()
  await expect(page.locator('.canvas-frame-controls button')).toHaveCount(2)
}
export async function canvasDocumentPoint(page: BrowserPage, point: { x: number; y: number }) {
  const host = page.getByRole('region', { name: 'Collage canvas' })
  const box = await host.boundingBox()
  expect(box).not.toBeNull()
  const scale = Number(await host.getAttribute('data-fit-scale'))
  const stageX = Number(await host.getAttribute('data-stage-x'))
  const stageY = Number(await host.getAttribute('data-stage-y'))
  const scroll = await host.evaluate((element) => ({
    left: element.scrollLeft,
    top: element.scrollTop,
  }))
  expect(scale).toBeGreaterThan(0)
  return {
    x: box!.x - scroll.left + stageX + point.x * scale,
    y: box!.y - scroll.top + stageY + point.y * scale,
  }
}
export async function twoColumnFrameCenters(page: BrowserPage) {
  const host = page.getByRole('region', { name: 'Collage canvas' })
  const frames = JSON.parse((await host.getAttribute('data-frame-hitboxes')) ?? '[]') as Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  expect(frames).toHaveLength(2)
  return Promise.all(
    frames.map((frame) =>
      canvasDocumentPoint(page, {
        x: frame.x + frame.width / 2,
        y: frame.y + frame.height / 2,
      }),
    ),
  )
}
export async function assignSidebarImage(page: BrowserPage, name: string, frameNumber: number) {
  const frame = page.getByRole('button', { name: new RegExp(`^Frame ${frameNumber},`) })
  await frame.focus()
  await frame.press('Enter')
  await page.getByText(name, { exact: true }).click()
  await expect(page.getByRole('button', { name: `Frame ${frameNumber}, ${name}` })).toBeAttached()
}
export async function sampleStagePixel(page: BrowserPage, point: { x: number; y: number }) {
  const host = page.getByRole('region', { name: 'Collage canvas' })
  const hostBox = await host.boundingBox()
  const canvas = host.locator('canvas').first()
  const canvasBox = await canvas.boundingBox()
  expect(hostBox).not.toBeNull()
  expect(canvasBox).not.toBeNull()
  return canvas.evaluate(
    (element, relative) => {
      const x = Math.max(
        0,
        Math.min(element.width - 1, Math.round((relative.x * element.width) / element.clientWidth)),
      )
      const y = Math.max(
        0,
        Math.min(
          element.height - 1,
          Math.round((relative.y * element.height) / element.clientHeight),
        ),
      )
      return [
        ...element.getContext('2d', { willReadFrequently: true })!.getImageData(x, y, 1, 1).data,
      ]
    },
    { x: point.x - canvasBox!.x, y: point.y - canvasBox!.y },
  )
}
export async function sampleStageColor(page: BrowserPage, point: { x: number; y: number }) {
  const [red, green, blue] = await sampleStagePixel(page, point)
  if (red > 180 && green < 90 && blue < 100) return 'red'
  if (blue > 160 && red < 90 && green < 160) return 'blue'
  return `other(${red},${green},${blue})`
}
export async function setNumber(page: BrowserPage, label: string, value: string) {
  const input = page.getByRole('spinbutton', { name: label })
  await input.fill(value)
  await input.press('Tab')
}
export async function expectOnTop(page: import('@playwright/test').Page, dialogName: string) {
  const dialog = page.getByRole('dialog', { name: dialogName })
  const box = await dialog.boundingBox()
  expect(box).not.toBeNull()
  const isTopmost = await page.evaluate(
    ({ x, y, dialogName }) => {
      const element = document.elementFromPoint(x, y)
      return element?.closest('[role="dialog"]')?.getAttribute('aria-labelledby') === dialogName
    },
    {
      x: box!.x + box!.width / 2,
      y: box!.y + box!.height / 2,
      dialogName: dialogName === 'Photo library' ? 'image-manager-title' : 'export-title',
    },
  )
  expect(isTopmost).toBe(true)
}

export {
  createHash,
  join,
  deflateSync,
  strFromU8,
  strToU8,
  unzipSync,
  zipSync,
  createProject,
  collageMimeType,
}
