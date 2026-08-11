import { expect, test } from '@playwright/test'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function expectOnTop(page: import('@playwright/test').Page, dialogName: string) {
  const dialog = page.getByRole('dialog', { name: dialogName })
  const box = await dialog.boundingBox()
  expect(box).not.toBeNull()
  const isTopmost = await page.evaluate(
    ({ x, y, dialogName }) => {
      const element = document.elementFromPoint(x, y)
      return element?.closest('dialog')?.getAttribute('aria-labelledby') === dialogName
    },
    { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, dialogName: dialogName === 'Image Manager' ? 'image-manager-title' : 'export-title' },
  )
  expect(isTopmost).toBe(true)
}

test('renders the editor shell and opens image manager', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('textbox', { name: 'Project title' })).toHaveValue('Untitled collage')
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByRole('button', { name: 'Open image manager' }).click()
  await expect(page.getByRole('dialog', { name: 'Image Manager' })).toBeVisible()
  await expectOnTop(page, 'Image Manager')
})

test('page-range export dialog overlays the editor', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Choose export scope' }).click()
  await page.getByRole('button', { name: 'Page range…' }).click()
  await expect(page.getByRole('dialog', { name: 'Export pages' })).toBeVisible()
  await expectOnTop(page, 'Export pages')
})

test('imports and removes an image from the project collection', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').first().setInputFiles({
    name: 'remove-me.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  })
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByRole('button', { name: 'Open image manager' }).click()
  await expect(page.getByRole('dialog', { name: 'Image Manager' }).getByText('remove-me.png')).toBeVisible()
  await page.getByRole('button', { name: 'Actions for remove-me.png' }).click()
  await page.getByRole('menuitem', { name: 'Remove from project' }).click()
  await page.getByRole('button', { name: 'Remove images' }).click()
  await expect(page.getByText('remove-me.png', { exact: true })).toHaveCount(0)
})

test('dragging a layout splitter re-renders the page', async ({ page }) => {
  await page.goto('/')
  const host = page.getByRole('region', { name: 'Collage canvas' })
  const stageContainer = host.locator('.konvajs-content')
  const box = await host.boundingBox()
  expect(box).not.toBeNull()
  let divider: { x: number; y: number; cursor: string } | undefined
  for (let y = 24; y < box!.height - 24 && !divider; y += 12) for (let x = 24; x < box!.width - 24; x += 12) {
    await page.mouse.move(box!.x + x, box!.y + y)
    const cursor = await stageContainer.evaluate((element) => element.style.cursor)
    if (cursor === 'col-resize' || cursor === 'row-resize') { divider = { x, y, cursor }; break }
  }
  expect(divider).toBeDefined()
  const canvas = page.locator('canvas').first()
  const before = await canvas.evaluate((element) => element.toDataURL())
  await page.mouse.move(box!.x + divider!.x, box!.y + divider!.y)
  await page.mouse.down()
  await page.mouse.move(
    box!.x + divider!.x + (divider!.cursor === 'col-resize' ? 42 : 0),
    box!.y + divider!.y + (divider!.cursor === 'row-resize' ? 42 : 0),
    { steps: 8 },
  )
  await page.mouse.up()
  await expect.poll(() => canvas.evaluate((element) => element.toDataURL())).not.toBe(before)
})

test('dragging crop edges and corners changes zoom', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"][accept="image/jpeg,image/png,image/webp"]').first().setInputFiles({
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
        const pixels = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data
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
    return { x: (minX + maxX) / 2, y: minY, scaleX: canvas.clientWidth / canvas.width, scaleY: canvas.clientHeight / canvas.height }
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

  await page.getByRole('button', { name: 'Reset crop' }).click()
  await expect(cropZoom).toHaveValue('1.00')
  const corner = await cropCanvas.evaluate((canvas) => {
    const pixels = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data
    let minX = canvas.width
    let minY = canvas.height
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 8 && pixels[index + 1] > 245 && pixels[index + 2] < 8) {
        const pixel = index / 4
        minX = Math.min(minX, pixel % canvas.width)
        minY = Math.min(minY, Math.floor(pixel / canvas.width))
      }
    }
    return { x: minX + 8, y: minY + 8 }
  })
  await page.mouse.move(canvasBox!.x + corner.x, canvasBox!.y + corner.y)
  await page.mouse.down()
  await page.mouse.move(canvasBox!.x + corner.x - 32, canvasBox!.y + corner.y - 32, { steps: 8 })
  await page.mouse.up()
  await expect(cropZoom).not.toHaveValue('1.00')
})
