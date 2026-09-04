import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { strToU8, zipSync } from 'fflate'
import { createProject } from '../../src/lib/domain/factories'
import { collageMimeType } from '../../src/lib/persistence/archive'

type BrowserPage = import('@playwright/test').Page

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

function solidPng(red: number, green: number, blue: number, width = 96, height = 64) {
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

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

const redPng = solidPng(238, 45, 54)
const bluePng = solidPng(30, 110, 230)
const realPhotoPath = join(process.cwd(), 'tests', 'fixtures', 'real-photo-still-life.png')

async function importImage(
  page: BrowserPage,
  name: string,
  buffer = onePixelPng,
  mimeType = 'image/png',
) {
  await page
    .locator(
      'input[type="file"][accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"]',
    )
    .first()
    .setInputFiles({
      name,
      mimeType,
      buffer,
    })
}

async function encodedRaster(
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

async function pngDimensions(download: import('@playwright/test').Download) {
  const png = await downloadBytes(download)
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

async function downloadBytes(download: import('@playwright/test').Download) {
  const stream = await download.createReadStream()
  if (!stream) throw new Error('Export download could not be read')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function rasterDimensions(page: BrowserPage, bytes: Buffer) {
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

async function sampleDownloadedPng(
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

async function chooseTwoColumnLayout(page: BrowserPage) {
  await page.getByRole('tab', { name: 'Layouts' }).click()
  await page.getByRole('tab', { name: '2', exact: true }).click()
  await page.getByRole('button', { name: 'Layout 1', exact: true }).click()
}

async function twoColumnFrameCenters(page: BrowserPage) {
  const host = page.getByRole('region', { name: 'Collage canvas' })
  const box = await host.boundingBox()
  expect(box).not.toBeNull()
  const scale = Math.min((box!.width - 48) / 3840, (box!.height - 48) / 2880, 1)
  const stageX = Math.max(0, (box!.width - 3840 * scale) / 2)
  const stageY = Math.max(0, (box!.height - 2880 * scale) / 2)
  const frameWidth = (3840 - 30 * 2 - 30) / 2
  const frameHeight = 2880 - 30 * 2
  const y = box!.y + stageY + (30 + frameHeight / 2) * scale
  return [
    { x: box!.x + stageX + (30 + frameWidth / 2) * scale, y },
    { x: box!.x + stageX + (30 + frameWidth + 30 + frameWidth / 2) * scale, y },
  ]
}

async function assignSidebarImage(
  page: BrowserPage,
  name: string,
  point: { x: number; y: number },
) {
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.mouse.click(point.x, point.y)
  await page.getByText(name, { exact: true }).click()
}

async function sampleStagePixel(page: BrowserPage, point: { x: number; y: number }) {
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

async function sampleStageColor(page: BrowserPage, point: { x: number; y: number }) {
  const [red, green, blue] = await sampleStagePixel(page, point)
  if (red > 180 && green < 90 && blue < 100) return 'red'
  if (blue > 160 && red < 90 && green < 160) return 'blue'
  return `other(${red},${green},${blue})`
}

async function setNumber(page: BrowserPage, label: string, value: string) {
  const input = page.getByRole('spinbutton', { name: label })
  await input.fill(value)
  await input.press('Tab')
}

async function expectOnTop(page: import('@playwright/test').Page, dialogName: string) {
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
      dialogName: dialogName === 'Image Manager' ? 'image-manager-title' : 'export-title',
    },
  )
  expect(isTopmost).toBe(true)
}

test('renders the editor shell and opens image manager', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('textbox', { name: 'Project title' })).toHaveValue('Untitled collage')
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByRole('button', { name: 'Manage images' }).click()
  await expect(page.getByRole('dialog', { name: 'Image Manager' })).toBeVisible()
  await expectOnTop(page, 'Image Manager')
})

test('page-range export dialog overlays the editor', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Choose export scope' }).click()
  await page.getByRole('menuitem', { name: 'Page range…' }).click()
  await expect(page.getByRole('dialog', { name: 'Export pages' })).toBeVisible()
  await expectOnTop(page, 'Export pages')
})

test('opening tab actions does not remove the active page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add page' }).click()
  await expect(page.getByRole('button', { name: 'Page 2' })).toBeVisible()
  await page.getByRole('button', { name: 'Page actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Page 2' })).toBeVisible()
})

test('layout count tabs stay compact and follow the active page', async ({ page }) => {
  await page.goto('/')
  const photoCounts = page.getByRole('tablist', { name: 'Photo count' })
  await expect(photoCounts.getByRole('tab')).toHaveCount(10)
  await expect(photoCounts.getByRole('tab', { name: '3', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  await photoCounts.getByRole('tab', { name: '2', exact: true }).click()
  await expect(page.locator('.layout-card')).toHaveCount(2)
  await page.getByRole('button', { name: 'Layout 2', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Layout 2 layout selected')

  await photoCounts.getByRole('tab', { name: '4', exact: true }).click()
  await page.getByRole('button', { name: 'Add page' }).click()
  await expect(photoCounts.getByRole('tab', { name: '2', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('page actions rename and duplicate without accidental deletion', async ({ page }) => {
  await page.goto('/')
  page.once('dialog', (dialog) => dialog.accept('Cover'))
  await page.getByRole('button', { name: 'Page actions' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await expect(page.getByRole('button', { name: 'Cover' })).toBeVisible()

  await page.getByRole('button', { name: 'Page actions' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect(page.getByRole('button', { name: /Cover/ })).toHaveCount(2)
})

test('many pages use the compact chooser and working previous/next controls', async ({ page }) => {
  await page.goto('/')
  for (let pageNumber = 2; pageNumber <= 5; pageNumber += 1)
    await page.getByRole('button', { name: 'Add page' }).click()

  await expect(page.getByRole('button', { name: 'Choose page' })).toContainText('Page 5')
  await page.getByRole('button', { name: 'Previous page' }).click()
  await expect(page.getByRole('button', { name: 'Choose page' })).toContainText('Page 4')
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByRole('button', { name: 'Choose page' })).toContainText('Page 5')
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled()

  await page.getByRole('button', { name: 'Choose page' }).click()
  await page.getByRole('option', { name: 'Page 1' }).click()
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled()
})

test('New protects unsaved work and Escape cancels navigation', async ({ page }) => {
  await page.goto('/')
  const title = page.getByRole('textbox', { name: 'Project title' })
  await title.fill('Keep this project')
  await title.press('Tab')
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Save before continuing?' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Save before continuing?' })).toBeHidden()
  await expect(title).toHaveValue('Keep this project')

  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Save before continuing?' })
    .getByRole('button', { name: 'Discard' })
    .click()
  await expect(title).toHaveValue('Untitled collage')
})

test('imports and removes an image from the project collection', async ({ page }) => {
  await page.goto('/')
  await page
    .locator(
      'input[type="file"][accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"]',
    )
    .first()
    .setInputFiles({
      name: 'remove-me.png',
      mimeType: 'image/png',
      buffer: onePixelPng,
    })
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByRole('button', { name: 'Manage images' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Image Manager' }).getByText('remove-me.png'),
  ).toBeVisible()
  await page
    .getByRole('dialog', { name: 'Image Manager' })
    .getByRole('button', { name: 'Actions for remove-me.png' })
    .click()
  await page.getByRole('menuitem', { name: 'Remove from project' }).click()
  await expect(page.getByText('remove-me.png', { exact: true })).toHaveCount(0)
})

test('imports JPEG, PNG, and WebP images', async ({ page }) => {
  await page.goto('/')
  for (const [name, mimeType] of [
    ['photo.jpg', 'image/jpeg'],
    ['graphic.png', 'image/png'],
    ['modern.webp', 'image/webp'],
  ] as const)
    await importImage(page, name, await encodedRaster(page, mimeType), mimeType)

  await page.getByRole('tab', { name: 'Images' }).click()
  await expect(page.getByText('photo.jpg', { exact: true })).toBeVisible()
  await expect(page.getByText('graphic.png', { exact: true })).toBeVisible()
  await expect(page.getByText('modern.webp', { exact: true })).toBeVisible()
})

test('gives conversion guidance when a HEIC image cannot be decoded', async ({ page }) => {
  await page.goto('/')
  await importImage(page, 'damaged.heic', Buffer.from('not a valid HEIC image'), 'image/heic')
  await expect(page.getByRole('status')).toContainText('Convert it to JPEG or PNG and try again.')
})

test('large originals use bounded thumbnails in the image library', async ({ page }) => {
  await page.goto('/')
  await importImage(page, 'large-photo.png', solidPng(80, 140, 210, 1200, 800))
  await page.getByRole('tab', { name: 'Images' }).click()
  const thumbnail = page.locator('.asset-row img').first()
  await expect(thumbnail).toBeVisible()
  expect(
    await thumbnail.evaluate((image) => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
    })),
  ).toEqual({ width: 256, height: 171 })
})

test('imports stay unused until assigned and used removal requires confirmation', async ({
  page,
}) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'used.png', redPng)
  await importImage(page, 'unused.png', bluePng)
  const [firstFrame] = await twoColumnFrameCenters(page)

  await page.getByRole('tab', { name: 'Images' }).click()
  await expect(page.getByTitle(/^used\.png.*0 uses/)).toBeVisible()
  await expect(page.getByTitle(/^unused\.png.*0 uses/)).toBeVisible()
  await assignSidebarImage(page, 'used.png', firstFrame)
  await expect(page.getByTitle(/^used\.png.*1 use/)).toBeVisible()

  await page.getByRole('button', { name: 'Manage images' }).click()
  const manager = page.getByRole('dialog', { name: 'Image Manager' })
  await manager.getByRole('radio', { name: 'Used', exact: true }).click()
  await expect(manager.getByText('used.png', { exact: true })).toBeVisible()
  await expect(manager.getByText('unused.png', { exact: true })).toHaveCount(0)
  await manager.getByRole('radio', { name: 'Unused', exact: true }).click()
  await expect(manager.getByText('unused.png', { exact: true })).toBeVisible()

  await manager.getByRole('button', { name: 'Remove unused images' }).click()
  await expect(manager.getByText('unused.png', { exact: true })).toHaveCount(0)
  await expect(manager.getByRole('button', { name: 'Remove unused images' })).toBeDisabled()

  await manager.getByRole('radio', { name: 'All', exact: true }).click()
  await manager.getByRole('button', { name: 'Actions for used.png' }).click()
  await page.getByRole('menuitem', { name: 'Remove from project' }).click()
  const removal = page.getByRole('dialog', { name: 'Remove 1 image?' })
  await expect(removal).toContainText('1 frame placement')
  await removal.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(manager.getByText('used.png', { exact: true })).toBeVisible()
})

test('Image Manager supports list view, search, sorting, and modal dismissal', async ({ page }) => {
  await page.goto('/')
  await importImage(page, 'zebra.png', redPng)
  await importImage(page, 'apple.png', bluePng)
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByRole('button', { name: 'Manage images' }).click()
  const manager = page.getByRole('dialog', { name: 'Image Manager' })

  await manager.getByRole('radio', { name: 'List view' }).click()
  await expect(manager.locator('.manager-asset-list')).toHaveClass(/manager-list-view/)
  await manager.getByRole('button', { name: 'Sort project images' }).click()
  await page.getByRole('option', { name: 'Filename' }).click()
  await expect(manager.locator('.manager-asset-card strong')).toHaveText(['apple.png', 'zebra.png'])

  await manager.getByRole('textbox', { name: 'Search project images' }).fill('zeb')
  await expect(manager.getByText('zebra.png', { exact: true })).toBeVisible()
  await expect(manager.getByText('apple.png', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(manager).toBeHidden()
})

test('normal-mode frame dragging swaps images without enabling crop', async ({ page }) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'red.png', redPng)
  await importImage(page, 'blue.png', bluePng)
  const [left, right] = await twoColumnFrameCenters(page)
  await assignSidebarImage(page, 'red.png', left)
  await assignSidebarImage(page, 'blue.png', right)

  await expect.poll(() => sampleStageColor(page, left)).toBe('red')
  await expect.poll(() => sampleStageColor(page, right)).toBe('blue')
  await page.mouse.move(left.x, left.y)
  await page.mouse.down()
  await page.mouse.move(right.x, right.y, { steps: 10 })
  await page.mouse.up()
  await expect.poll(() => sampleStageColor(page, left)).toBe('blue')
  await expect.poll(() => sampleStageColor(page, right)).toBe('red')
  await expect(page.getByRole('button', { name: 'Crop image' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Crop zoom value' })).toHaveValue('1.00')
})

test('Escape cancels an in-progress normal-mode frame swap', async ({ page }) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'red.png', redPng)
  await importImage(page, 'blue.png', bluePng)
  const [left, right] = await twoColumnFrameCenters(page)
  await assignSidebarImage(page, 'red.png', left)
  await assignSidebarImage(page, 'blue.png', right)

  await page.mouse.move(left.x, left.y)
  await page.mouse.down()
  await page.mouse.move((left.x + right.x) / 2, left.y, { steps: 5 })
  await page.keyboard.press('Escape')
  await page.mouse.move(right.x, right.y, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => sampleStageColor(page, left)).toBe('red')
  await expect.poll(() => sampleStageColor(page, right)).toBe('blue')
})

test('dragging a layout splitter re-renders the page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: '4', exact: true }).click()
  await page.getByRole('button', { name: 'Layout 2', exact: true }).click()
  const host = page.getByRole('region', { name: 'Collage canvas' })
  const stageContainer = page.locator('.konvajs-content').first()
  const box = await host.boundingBox()
  expect(box).not.toBeNull()
  const scale = Number(await host.getAttribute('data-fit-scale'))
  const stageX = Number(await host.getAttribute('data-stage-x'))
  const stageY = Number(await host.getAttribute('data-stage-y'))
  const dividers = JSON.parse((await host.getAttribute('data-divider-hitboxes')) ?? '[]') as Array<{
    axis: 'x' | 'y'
    x: number
    y: number
    width: number
    height: number
  }>
  const divider = dividers.find((candidate) => candidate.axis === 'x')
  expect(divider).toBeDefined()
  const dividerX = box!.x + stageX + (divider!.x + divider!.width / 2) * scale
  const dividerY = box!.y + stageY + (divider!.y + divider!.height / 2) * scale
  await page.mouse.move(dividerX, dividerY)
  await expect(stageContainer).toBeAttached()
  const canvas = host.locator('canvas').first()
  const before = await canvas.evaluate((element) => element.toDataURL())
  await page.mouse.down()
  await page.mouse.move(dividerX + 42, dividerY, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => canvas.evaluate((element) => element.toDataURL())).not.toBe(before)
})

test('dragging crop edges changes zoom', async ({ page }) => {
  await page.goto('/')
  await page
    .locator(
      'input[type="file"][accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"]',
    )
    .first()
    .setInputFiles({
      name: 'crop.png',
      mimeType: 'image/png',
      buffer: onePixelPng,
    })
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByText('crop.png', { exact: true }).click()

  const host = page.getByRole('region', { name: 'Collage canvas' })
  const hostBox = await host.boundingBox()
  expect(hostBox).not.toBeNull()
  await page.mouse.click(hostBox!.x + hostBox!.width * 0.38, hostBox!.y + hostBox!.height * 0.45)
  await page.getByRole('button', { name: 'Crop image' }).click()

  const cropZoom = page.getByRole('spinbutton', { name: 'Crop zoom value' })
  await expect(cropZoom).toHaveValue('1.00')
  const cropCanvas = page.locator('canvas').last()
  await expect
    .poll(async () =>
      cropCanvas.evaluate((canvas) => {
        const pixels = canvas
          .getContext('2d', { willReadFrequently: true })!
          .getImageData(0, 0, canvas.width, canvas.height).data
        for (let index = 0; index < pixels.length; index += 4)
          if (pixels[index] < 8 && pixels[index + 1] > 245 && pixels[index + 2] < 8) return true
        return false
      }),
    )
    .toBe(true)
  const edge = await cropCanvas.evaluate((canvas) => {
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let minX = canvas.width
    let minY = canvas.height
    let maxX = 0
    let maxY = 0
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 8 && pixels[index + 1] > 245 && pixels[index + 2] < 8) {
        const pixel = index / 4
        const x = pixel % canvas.width
        const y = Math.floor(pixel / canvas.width)
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
    if (minX === canvas.width) throw new Error('Crop outline was not drawn')
    return {
      x: (minX + maxX) / 2,
      y: minY,
      scaleX: canvas.clientWidth / canvas.width,
      scaleY: canvas.clientHeight / canvas.height,
    }
  })
  const canvasBox = await cropCanvas.boundingBox()
  expect(canvasBox).not.toBeNull()
  await page.mouse.move(canvasBox!.x + edge.x * edge.scaleX, canvasBox!.y + edge.y * edge.scaleY)
  await page.mouse.down()
  await page.mouse.move(
    canvasBox!.x + edge.x * edge.scaleX,
    canvasBox!.y + (edge.y - 36) * edge.scaleY,
    { steps: 8 },
  )
  await page.mouse.up()
  await expect(cropZoom).not.toHaveValue('1.00')
})

test('crop changes cancel with Escape and commit as one undo entry', async ({ page }) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'transactional-crop.png', redPng)
  const [firstFrame] = await twoColumnFrameCenters(page)
  await assignSidebarImage(page, 'transactional-crop.png', firstFrame)
  await page.getByRole('button', { name: 'Crop image' }).click()

  await setNumber(page, 'Crop zoom value', '1.75')
  await setNumber(page, 'Crop horizontal position', '25')
  await setNumber(page, 'Crop vertical position', '70')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Crop image' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Crop zoom value' })).toHaveValue('1.00')
  await expect(page.getByRole('spinbutton', { name: 'Crop horizontal position' })).toHaveValue('50')
  await expect(page.getByRole('spinbutton', { name: 'Crop vertical position' })).toHaveValue('50')

  await page.getByRole('button', { name: 'Crop image' }).click()
  await setNumber(page, 'Crop zoom value', '1.60')
  await setNumber(page, 'Crop horizontal position', '30')
  await setNumber(page, 'Crop vertical position', '65')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('spinbutton', { name: 'Crop zoom value' })).toHaveValue('1.00')
  await expect(page.getByRole('spinbutton', { name: 'Crop horizontal position' })).toHaveValue('50')
  await expect(page.getByRole('spinbutton', { name: 'Crop vertical position' })).toHaveValue('50')

  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(page.getByRole('spinbutton', { name: 'Crop zoom value' })).toHaveValue('1.60')
  await expect(page.getByRole('spinbutton', { name: 'Crop horizontal position' })).toHaveValue('30')
  await expect(page.getByRole('spinbutton', { name: 'Crop vertical position' })).toHaveValue('65')
})

test('automatic recovery restores an unsaved project', async ({ page }) => {
  await page.goto('/')
  const title = page.getByRole('textbox', { name: 'Project title' })
  await title.fill('Recovered project')
  await title.press('Tab')
  await page.waitForTimeout(1_200)
  await page.reload()
  await expect(title).toHaveValue('Recovered project')
  await expect(page.getByRole('status')).toContainText('Local recovery restored')
})

test('keyboard focus is visible and returns to the image-manager trigger', async ({ page }) => {
  await page.goto('/')
  const newProject = page.getByRole('button', { name: 'New', exact: true })
  const openProject = page.getByRole('button', { name: 'Open', exact: true })
  await newProject.focus()
  await expect(newProject).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(openProject).toBeFocused()

  await page.getByRole('tab', { name: 'Images' }).click()
  const managerTrigger = page.getByRole('button', { name: 'Manage images' })
  await managerTrigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Image Manager' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Image Manager' })).toBeHidden()
  await expect(managerTrigger).toBeFocused()
})

test('initial keyboard focus skips hidden file inputs and canvas frames are named', async ({
  page,
}) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'New', exact: true })).toBeFocused()

  const frameControls = page.locator('.canvas-frame-controls button')
  await expect(frameControls).toHaveCount(3)
  await expect(frameControls.first()).toHaveAttribute('aria-label', 'Frame 1, empty')
  await frameControls.first().focus()
  await expect(frameControls.first()).toBeFocused()
  await expect(frameControls.first()).toHaveAttribute('aria-pressed', 'true')
})

test('honors reduced-motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const duration = await page
    .getByRole('button', { name: 'New', exact: true })
    .evaluate((element) => getComputedStyle(element).transitionDuration)
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.001)
})

test('page-range export validates input and downloads the requested pages', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add page' }).click()
  await page.getByRole('button', { name: 'Choose export scope' }).click()
  await page.getByRole('menuitem', { name: 'Page range…' }).click()
  const exportDialog = page.getByRole('dialog', { name: 'Export pages' })
  const range = exportDialog.getByPlaceholder('1-3')
  await range.fill('2-1')
  await exportDialog.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Choose pages between 1 and 2')
  await expect(exportDialog).toBeVisible()

  await range.fill('1-2')
  const downloadPromise = page.waitForEvent('download')
  await exportDialog.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('Untitled collage-pages.zip')
  await expect(exportDialog).toBeHidden()
})

test('exports current-page PNGs at normal and default 4K resolutions', async ({
  page,
  browserName,
}) => {
  await page.goto('/')
  await importImage(page, 'export.png', redPng)
  const host = page.getByRole('region', { name: 'Collage canvas' })
  const hostBox = await host.boundingBox()
  expect(hostBox).not.toBeNull()
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.mouse.click(hostBox!.x + hostBox!.width * 0.5, hostBox!.y + hostBox!.height * 0.5)
  await page.getByText('export.png', { exact: true }).click()

  await page.getByRole('button', { name: 'Export PNG' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export pages' })
  const width = dialog.getByRole('spinbutton', { name: 'Width (px)' })
  await width.fill('800')
  const normalDownload = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(await pngDimensions(await normalDownload)).toEqual({ width: 800, height: 600 })

  await page.getByRole('button', { name: 'Export PNG' }).click()
  await width.fill('3840')
  const largeDownload = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(await pngDimensions(await largeDownload)).toEqual({ width: 3840, height: 2880 })

  const renderMeasurements = await page.evaluate(() =>
    performance.getEntriesByName('collage-export-render').map((entry) => {
      const detail = (entry as PerformanceMeasure).detail as {
        pixelCount: number
        renderer: string
      }
      return { durationMs: entry.duration, ...detail }
    }),
  )
  expect(renderMeasurements).toHaveLength(2)
  expect(renderMeasurements.map(({ pixelCount }) => pixelCount)).toEqual([800 * 600, 3840 * 2880])
  expect(renderMeasurements.every(({ durationMs }) => durationMs > 0)).toBe(true)
  if (browserName === 'chromium')
    expect(renderMeasurements.every(({ renderer }) => renderer === 'worker')).toBe(true)
})

test('exports JPEG with configurable quality', async ({ page }) => {
  await page.goto('/')
  await importImage(page, 'export.png', redPng)
  const host = page.getByRole('region', { name: 'Collage canvas' })
  const hostBox = await host.boundingBox()
  expect(hostBox).not.toBeNull()
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.mouse.click(hostBox!.x + hostBox!.width * 0.5, hostBox!.y + hostBox!.height * 0.5)
  await page.getByText('export.png', { exact: true }).click()

  await page.getByRole('button', { name: 'Export PNG' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export pages' })
  await dialog.getByRole('button', { name: 'Export format' }).click()
  await page.getByRole('option', { name: 'JPEG', exact: true }).click()
  await dialog.getByRole('spinbutton', { name: 'Width (px)' }).fill('800')
  await dialog.getByRole('spinbutton', { name: 'JPEG quality (%)' }).fill('72')
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('Untitled collage-01.jpg')
  const bytes = await downloadBytes(download)
  expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
  expect(await rasterDimensions(page, bytes)).toEqual({ width: 800, height: 600 })
  await expect(page.getByRole('button', { name: 'Export JPEG' })).toBeVisible()
})

test('export pixels preserve image colors and the configured page gap', async ({ page }) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'red.png', redPng)
  await importImage(page, 'blue.png', bluePng)
  const [left, right] = await twoColumnFrameCenters(page)
  await assignSidebarImage(page, 'red.png', left)
  await assignSidebarImage(page, 'blue.png', right)
  await page.getByRole('switch', { name: 'Frame shadow enabled' }).click()

  await page.getByRole('button', { name: 'Export PNG' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export pages' })
  await dialog.getByRole('spinbutton', { name: 'Width (px)' }).fill('400')
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  const [leftPixel, gapPixel, rightPixel] = await sampleDownloadedPng(page, await downloadPromise, [
    { x: 100, y: 150 },
    { x: 200, y: 150 },
    { x: 300, y: 150 },
  ])
  expect(leftPixel.slice(0, 3)).toEqual([238, 45, 54])
  expect(gapPixel.slice(0, 3)).toEqual([128, 128, 128])
  expect(rightPixel.slice(0, 3)).toEqual([30, 110, 230])
})

test('real photo import, crop, thumbnail, and export stay visually consistent', async ({
  page,
}) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await page
    .locator(
      'input[type="file"][accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"]',
    )
    .first()
    .setInputFiles(realPhotoPath)
  await page.getByRole('tab', { name: 'Images' }).click()
  await expect(page.getByText('real-photo-still-life.png', { exact: true })).toBeVisible()

  const thumbnail = page.locator('.asset-row img').first()
  await expect(thumbnail).toBeVisible()
  expect(
    await thumbnail.evaluate((image) => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
    })),
  ).toEqual({ width: 256, height: 171 })

  const [left] = await twoColumnFrameCenters(page)
  await assignSidebarImage(page, 'real-photo-still-life.png', left)
  await page.getByRole('button', { name: 'Crop image' }).click()
  await setNumber(page, 'Crop zoom value', '1.20')
  await setNumber(page, 'Crop horizontal position', '45')
  await page.getByRole('button', { name: 'Done' }).click()

  await expect.poll(() => sampleStagePixel(page, left)).not.toEqual([229, 226, 217, 255])
  const renderedStagePixel = await sampleStagePixel(page, left)
  expect(renderedStagePixel[3]).toBe(255)

  await page.getByRole('button', { name: 'Export PNG' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export pages' })
  await dialog.getByRole('spinbutton', { name: 'Width (px)' }).fill('600')
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  const [exportedPixel] = await sampleDownloadedPng(page, await downloadPromise, [
    { x: 151, y: 225 },
  ])
  for (let channel = 0; channel < 3; channel += 1)
    expect(Math.abs(exportedPixel[channel] - renderedStagePixel[channel])).toBeLessThanOrEqual(12)
  expect(exportedPixel[3]).toBe(255)
})

test('a failed project open keeps the current document and decoded assets intact', async ({
  page,
}) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  const title = page.getByRole('textbox', { name: 'Project title' })
  await title.fill('Keep current project')
  await title.press('Tab')
  await importImage(page, 'current.png', redPng)
  const [left] = await twoColumnFrameCenters(page)
  await assignSidebarImage(page, 'current.png', left)
  await expect.poll(() => sampleStageColor(page, left)).toBe('red')

  const invalidBytes = Buffer.from('not actually a PNG')
  const invalidDocument = createProject('Broken incoming project')
  const assetId = '11111111-1111-4111-8111-111111111111'
  invalidDocument.assets[assetId] = {
    id: assetId,
    originalName: 'broken.png',
    mediaType: 'image/png',
    byteLength: invalidBytes.byteLength,
    width: 10,
    height: 10,
    sha256: createHash('sha256').update(invalidBytes).digest('hex'),
    storage: { kind: 'embedded', archivePath: `assets/${assetId}` },
  }
  const slotId = Object.keys(invalidDocument.pages[0].slots)[0]
  invalidDocument.pages[0].slots[slotId] = {
    assetId,
    placement: { zoom: 1, positionX: 0.5, positionY: 0.5 },
  }
  const archive = zipSync({
    mimetype: strToU8(collageMimeType),
    'document.json': strToU8(JSON.stringify(invalidDocument)),
    [`assets/${assetId}`]: invalidBytes,
  })
  await page.locator('input[type="file"][accept*=".collage.json"]').setInputFiles({
    name: 'broken.collage',
    mimeType: collageMimeType,
    buffer: Buffer.from(archive),
  })

  await expect(page.getByRole('status')).toContainText(/decode|image|source/i)
  await expect(title).toHaveValue('Keep current project')
  await expect.poll(() => sampleStageColor(page, left)).toBe('red')
})

test('Save retains the current format while Save As offers both project extensions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })
  await page.goto('/')

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const formatDialog = page.getByRole('dialog', { name: 'Choose a project format' })
  await expect(formatDialog).toContainText('Embedded archive (.collage)')
  await expect(formatDialog).toContainText('Linked project (.collage.json)')
  const embeddedDownload = page.waitForEvent('download')
  await formatDialog.getByRole('button', { name: 'Save embedded archive' }).click()
  expect((await embeddedDownload).suggestedFilename()).toBe('Untitled collage.collage')

  const repeatedSave = page.waitForEvent('download')
  await page.keyboard.press('Control+s')
  expect((await repeatedSave).suggestedFilename()).toBe('Untitled collage.collage')
  await expect(formatDialog).toBeHidden()

  await page.getByRole('button', { name: 'Save', exact: true }).click({ modifiers: ['Shift'] })
  await expect(formatDialog).toBeVisible()
  await formatDialog.getByRole('button', { name: 'Cancel', exact: true }).click()

  await page.keyboard.press('Control+Shift+s')
  await expect(formatDialog).toBeVisible()
  const linkedDownload = page.waitForEvent('download')
  await formatDialog.getByRole('button', { name: 'Save linked JSON' }).click()
  expect((await linkedDownload).suggestedFilename()).toBe('Untitled collage.collage.json')
})

test('opens a linked project from the .collage.json extension', async ({ page }) => {
  await page.goto('/')
  const linkedDocument = createProject('Linked JSON project')
  await page.locator('input[type="file"][accept*=".collage.json"]').setInputFiles({
    name: 'linked-project.collage.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(linkedDocument)),
  })
  await expect(page.getByRole('textbox', { name: 'Project title' })).toHaveValue(
    'Linked JSON project',
  )
  await expect(page.getByRole('status')).toContainText('Project opened')
})
