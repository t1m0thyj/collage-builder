import { test, expect } from './test-fixtures'
import {
  redPng,
  bluePng,
  realPhotoPath,
  visualParityArchive,
  importImage,
  pngDimensions,
  downloadBytes,
  rasterDimensions,
  sampleDownloadedPng,
  exportCurrentPng,
  fillExportInput,
  chooseTwoColumnLayout,
  twoColumnFrameCenters,
  assignSidebarImage,
  sampleStagePixel,
  setNumber,
  expectOnTop,
  collageMimeType,
  unzipSync,
} from './test-helpers'

test('page-range export dialog overlays the editor', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Choose export scope' }).click()
  await page.getByRole('menuitem', { name: 'Page range…' }).click()
  await expect(page.getByRole('dialog', { name: 'Export pages' })).toBeVisible()
  await expectOnTop(page, 'Export pages')
})

test('bulk export previews filename templates and applies them to the ZIP', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Project title' }).fill('Summer trip')
  await page.getByRole('textbox', { name: 'Project title' }).press('Tab')
  await page.getByRole('button', { name: 'Add page' }).click()
  await page.getByRole('button', { name: 'Add page' }).click()
  await page.getByRole('button', { name: 'Choose export scope' }).click()
  await page.getByRole('menuitem', { name: 'Page range…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export pages' })
  await dialog.getByPlaceholder('1-3').fill('2-3')
  await dialog.getByRole('spinbutton', { name: 'Long side (px)' }).fill('400')
  const template = dialog.getByRole('textbox', { name: 'Filename template' })
  await expect(template).toHaveValue('Summer trip-{number}')
  await template.fill('same-name')
  await expect(dialog).toContainText('different filename')
  await expect(dialog.getByRole('button', { name: 'Export', exact: true })).toBeDisabled()
  await template.fill('Album-{number}-{title}')
  await expect(dialog).toContainText('Preview: Album-02-Page 2.png')
  await expect(dialog.locator('#export-filename-preview')).not.toContainText('Album-03')
  await expect(dialog).toContainText('2 PNGs in a ZIP')
  await dialog.getByRole('button', { name: 'Export format' }).click()
  await page.getByRole('option', { name: 'JPEG', exact: true }).click()
  await expect(dialog).toContainText('Preview: Album-02-Page 2.jpg')
  await dialog.screenshot({ path: testInfo.outputPath('bulk-export-dialog.png') })
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('Summer trip-pages.zip')
  expect(Object.keys(unzipSync(await downloadBytes(download)))).toEqual([
    'Album-02-Page 2.jpg',
    'Album-03-Page 3.jpg',
  ])
})

test('page-range export validates input and downloads the requested pages', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit' && process.platform === 'win32',
    'Playwright WebKit on Windows exhausts canvas encoders across test contexts',
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Add page' }).click()
  await page.getByRole('button', { name: 'Choose export scope' }).click()
  await page.getByRole('menuitem', { name: 'Page range…' }).click()
  const exportDialog = page.getByRole('dialog', { name: 'Export pages' })
  await fillExportInput(exportDialog.getByRole('spinbutton', { name: 'Long side (px)' }), '400')
  const range = exportDialog.getByPlaceholder('1-3')
  await fillExportInput(range, '2-1')
  await exportDialog.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(page.locator('.toast')).toContainText('Choose pages between 1 and 2')
  await expect(exportDialog).toBeVisible()

  await fillExportInput(range, '1-2')
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
  await page.locator('.sidebar-asset-card').getByText('export.png', { exact: true }).click()

  await page.getByRole('button', { name: 'Export…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export pages' })
  const width = dialog.getByRole('spinbutton', { name: 'Long side (px)' })
  await width.fill('800')
  const normalDownload = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(await pngDimensions(await normalDownload)).toEqual({ width: 800, height: 600 })

  await page.getByRole('button', { name: 'Export…' }).click()
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

test('portrait export uses the requested long side as its height', async ({ page }) => {
  await page.goto('/')
  const pageWidth = page.getByRole('spinbutton', { name: 'Page width' })
  const pageHeight = page.getByRole('spinbutton', { name: 'Page height' })
  await pageWidth.fill('600')
  await pageWidth.press('Tab')
  await pageHeight.fill('800')
  await pageHeight.press('Tab')

  await page.getByRole('button', { name: 'Export…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export pages' })
  await dialog.getByRole('spinbutton', { name: 'Long side (px)' }).fill('1000')
  await expect(dialog).toContainText('Output: 750 × 1000 px')
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(await pngDimensions(await downloadPromise)).toEqual({ width: 750, height: 1000 })
})

test('all-page export applies the long side to each page orientation', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add page' }).click()
  const pageWidth = page.getByRole('spinbutton', { name: 'Page width' })
  const pageHeight = page.getByRole('spinbutton', { name: 'Page height' })
  await pageWidth.fill('600')
  await pageWidth.press('Tab')
  await pageHeight.fill('800')
  await pageHeight.press('Tab')

  await page.getByRole('button', { name: 'Choose export scope' }).click()
  await page.getByRole('menuitem', { name: 'All pages (ZIP)' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export pages' })
  await dialog.getByRole('spinbutton', { name: 'Long side (px)' }).fill('1000')
  await expect(dialog).toContainText('Current page output: 750 × 1000 px')
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  const images = Object.values(unzipSync(await downloadBytes(await downloadPromise)))
  expect(
    images.map((image) => {
      const png = Buffer.from(image)
      return [png.readUInt32BE(16), png.readUInt32BE(20)]
    }),
  ).toEqual([
    [1000, 750],
    [750, 1000],
  ])
})

test('exports JPEG with configurable quality', async ({ page }) => {
  await page.goto('/')
  await importImage(page, 'export.png', redPng)
  const host = page.getByRole('region', { name: 'Collage canvas' })
  const hostBox = await host.boundingBox()
  expect(hostBox).not.toBeNull()
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.mouse.click(hostBox!.x + hostBox!.width * 0.5, hostBox!.y + hostBox!.height * 0.5)
  await page.locator('.sidebar-asset-card').getByText('export.png', { exact: true }).click()

  await page.getByRole('button', { name: 'Export…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export pages' })
  await dialog.getByRole('button', { name: 'Export format' }).click()
  await page.getByRole('option', { name: 'JPEG', exact: true }).click()
  await dialog.getByRole('spinbutton', { name: 'Long side (px)' }).fill('800')
  await dialog.getByRole('spinbutton', { name: 'JPEG quality (%)' }).fill('72')
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('Untitled collage-01.jpg')
  const bytes = await downloadBytes(download)
  expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
  expect(await rasterDimensions(page, bytes)).toEqual({ width: 800, height: 600 })
  await expect(page.getByRole('button', { name: 'Export…' })).toBeVisible()
})

test('export pixels preserve image colors and the configured page gap', async ({ page }) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'red.png', redPng)
  await importImage(page, 'blue.png', bluePng)
  await assignSidebarImage(page, 'red.png', 1)
  await assignSidebarImage(page, 'blue.png', 2)
  await setNumber(page, 'Inner spacing value', '30')
  const shadow = page.getByRole('switch', { name: 'Frame shadow enabled' })
  await shadow.click()
  await expect(shadow).not.toBeChecked()

  await page.getByRole('button', { name: 'Export…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export pages' })
  await dialog.getByRole('spinbutton', { name: 'Long side (px)' }).fill('400')
  await expect(dialog).toContainText('Output: 400 × 300 px')
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await downloadPromise
  expect(await pngDimensions(download)).toEqual({ width: 400, height: 300 })
  const [leftPixel, ...remainingPixels] = await sampleDownloadedPng(page, download, [
    { x: 100, y: 150 },
    { x: 199, y: 150 },
    { x: 200, y: 150 },
    { x: 300, y: 150 },
  ])
  expect(leftPixel.slice(0, 3)).toEqual([238, 45, 54])
  expect(remainingPixels.map((pixel) => pixel.slice(0, 3))).toEqual([
    [128, 128, 128],
    [128, 128, 128],
    [30, 110, 230],
  ])
})

test('exports rounded corners, transparent areas, and shadows accurately', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('project-file-input').setInputFiles({
    name: 'visual-parity.collage',
    mimeType: collageMimeType,
    buffer: Buffer.from(visualParityArchive()),
  })
  await expect(page.locator('.toast')).toHaveText('Project opened.')
  await expect(page.getByRole('textbox', { name: 'Project title' })).toHaveValue('Visual parity')
  await page.getByRole('tab', { name: 'Images' }).click()
  await expect(page.locator('.asset-row img').first()).toBeVisible()

  const roundedPixels = await sampleDownloadedPng(page, await exportCurrentPng(page, 100), [
    { x: 50, y: 50 },
    { x: 0, y: 0 },
  ])
  expect(roundedPixels[0]).toEqual([238, 45, 54, 255])
  expect(roundedPixels[1]).toEqual([0, 0, 0, 0])

  await page.getByRole('button', { name: 'Transparent' }).click()
  const transparentPixels = await sampleDownloadedPng(page, await exportCurrentPng(page, 100), [
    { x: 50, y: 50 },
    { x: 0, y: 0 },
  ])
  expect(transparentPixels[0]).toEqual([238, 45, 54, 255])
  expect(transparentPixels[1]).toEqual([0, 0, 0, 0])

  await page.getByRole('button', { name: 'Shadow' }).click()
  const [shadowPixel, transparentPixel] = await sampleDownloadedPng(
    page,
    await exportCurrentPng(page, 100),
    [
      { x: 84, y: 50 },
      { x: 5, y: 5 },
    ],
  )
  expect(shadowPixel.slice(0, 3)).toEqual([0, 0, 0])
  expect(shadowPixel[3]).toBeGreaterThanOrEqual(120)
  expect(shadowPixel[3]).toBeLessThanOrEqual(135)
  expect(transparentPixel).toEqual([0, 0, 0, 0])

  const [scaledShadow] = await sampleDownloadedPng(page, await exportCurrentPng(page, 220), [
    { x: 185, y: 110 },
  ])
  expect(scaledShadow.slice(0, 3)).toEqual([0, 0, 0])
  expect(scaledShadow[3]).toBeGreaterThanOrEqual(120)
  expect(scaledShadow[3]).toBeLessThanOrEqual(135)
})

test('real photo import, crop, thumbnail, and export stay visually consistent', async ({
  page,
}) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await page.getByTestId('photo-upload-input').setInputFiles(realPhotoPath)
  await page.getByRole('tab', { name: 'Images' }).click()
  await expect(
    page.locator('.sidebar-asset-card').getByText('real-photo-still-life.png', { exact: true }),
  ).toBeVisible()

  const thumbnail = page.locator('.asset-row img').first()
  await expect(thumbnail).toBeVisible()
  expect(
    await thumbnail.evaluate((image) => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
    })),
  ).toEqual({ width: 256, height: 171 })

  await assignSidebarImage(page, 'real-photo-still-life.png', 1)
  const [left] = await twoColumnFrameCenters(page)
  await page.getByRole('button', { name: 'Crop image', exact: true }).click()
  await setNumber(page, 'Crop zoom value', '1.20')
  await setNumber(page, 'Crop horizontal position', '45')
  await page.getByRole('button', { name: 'Done' }).click()

  await expect.poll(() => sampleStagePixel(page, left)).not.toEqual([229, 226, 217, 255])
  const renderedStagePixel = await sampleStagePixel(page, left)
  expect(renderedStagePixel[3]).toBe(255)

  await page.getByRole('button', { name: 'Export…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export pages' })
  await dialog.getByRole('spinbutton', { name: 'Long side (px)' }).fill('600')
  const downloadPromise = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  const [exportedPixel] = await sampleDownloadedPng(page, await downloadPromise, [
    { x: 151, y: 225 },
  ])
  const maximumResamplingDelta = 32
  for (let channel = 0; channel < 3; channel += 1)
    expect(Math.abs(exportedPixel[channel] - renderedStagePixel[channel])).toBeLessThanOrEqual(
      maximumResamplingDelta,
    )
  expect(exportedPixel[3]).toBe(255)
})
