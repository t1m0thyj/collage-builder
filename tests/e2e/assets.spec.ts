import { test, expect } from './test-fixtures'
import {
  solidPng,
  onePixelPng,
  redPng,
  bluePng,
  missingPhotoArchive,
  importImage,
  dropLocalFiles,
  encodedRaster,
  chooseTwoColumnLayout,
  twoColumnFrameCenters,
  assignSidebarImage,
  sampleStageColor,
  sampleDownloadedPng,
  exportCurrentPng,
  collageMimeType,
} from './test-helpers'

test('dropping multiple files into the sidebar imports the batch with Layouts open', async ({
  page,
}) => {
  await page.goto('/')
  await dropLocalFiles(page.getByRole('complementary', { name: 'Layouts and images' }), [
    { name: 'dropped-red.png', buffer: redPng },
    { name: 'dropped-blue.png', buffer: bluePng },
  ])
  await expect(page.locator('.toast')).toHaveText('2 photos added.')
  await expect(page.getByRole('tab', { name: 'Images' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('dropped-red.png', { exact: true })).toBeVisible()
  await expect(page.getByText('dropped-blue.png', { exact: true })).toBeVisible()
})

test('undoing photo removal restores its original bytes', async ({ page }) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'original.png', redPng)
  await page.getByRole('button', { name: 'Actions for original.png' }).click()
  await page.getByRole('menuitem', { name: 'Remove from project' }).click()
  await expect(page.getByText('No photos yet')).toBeVisible()

  await page.getByRole('button', { name: 'Undo', exact: true }).click()

  await expect(page.getByText('original.png', { exact: true })).toBeVisible()
  await expect(page.locator('.asset-row')).not.toContainText('Missing')
  await expect(page.locator('.asset-row img')).toHaveCount(1)
  await assignSidebarImage(page, 'original.png', 1)
  const [pixel] = await sampleDownloadedPng(page, await exportCurrentPng(page, 400), [
    { x: 100, y: 150 },
  ])
  expect(pixel.slice(0, 3)).toEqual([238, 45, 54])
})

test('undoing original replacement restores the previous photo bytes', async ({ page }) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'original.png', redPng)
  await page.getByRole('button', { name: 'Actions for original.png' }).click()
  await page.getByRole('menuitem', { name: 'Replace original' }).click()
  await page.getByTestId('photo-replacement-input').setInputFiles({
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: bluePng,
  })
  await expect(page.getByText('replacement.png', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Undo', exact: true }).click()

  await expect(page.getByText('original.png', { exact: true })).toBeVisible()
  await expect(page.locator('.asset-row')).not.toContainText('Missing')
  await assignSidebarImage(page, 'original.png', 1)
  const [pixel] = await sampleDownloadedPng(page, await exportCurrentPng(page, 400), [
    { x: 100, y: 150 },
  ])
  expect(pixel.slice(0, 3)).toEqual([238, 45, 54])
})

test('successful photo imports show a brief toast instead of a sidebar summary', async ({
  page,
}) => {
  await page.goto('/')
  await importImage(page, 'photo.png')
  await expect(page.locator('.toast')).toHaveText('')
  await expect(page.locator('.import-summary')).toHaveCount(0)
})

test('import progress replaces the sidebar actions until the photo finishes loading', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode
    HTMLImageElement.prototype.decode = function () {
      return new Promise<void>((resolve, reject) => {
        Object.assign(window, {
          resumeImportDecode: () => decode.call(this).then(resolve, reject),
        })
      })
    }
  })
  await page.goto('/')
  await page
    .getByTestId('photo-upload-input')
    .setInputFiles({ name: 'slow.png', mimeType: 'image/png', buffer: redPng })

  const actions = page.locator('.image-panel-actions')
  await expect(actions.locator('.import-progress')).toContainText('Importing 0 of 1')
  await expect(page.locator('.image-panel > .import-summary')).toHaveCount(0)
  await expect(actions.getByRole('button', { name: 'Add photos' })).toHaveCount(0)
  await expect(actions.getByRole('button', { name: 'Manage photos' })).toHaveCount(0)

  await page.evaluate(() =>
    (window as Window & { resumeImportDecode: () => void }).resumeImportDecode(),
  )
  await expect(actions.locator('.import-progress')).toHaveCount(0)
  await expect(actions.getByRole('button', { name: 'Add photos' })).toBeVisible()
  await expect(actions.getByRole('button', { name: 'Manage photos' })).toBeVisible()
  await expect(page.getByText('slow.png', { exact: true })).toBeVisible()
})

test('import keeps Unused and the sort order, but clears Used when new photos would be hidden', async ({
  page,
}) => {
  await page.goto('/')
  await importImage(page, 'red.png', redPng)
  await assignSidebarImage(page, 'red.png', 1)
  const filters = page.locator('.asset-filters')
  await filters.getByRole('radio', { name: 'Unused', exact: true }).click()
  await page.getByRole('button', { name: 'Sort images: Import order' }).click()
  await page.getByRole('menuitem', { name: 'Filename' }).click()

  await importImage(page, 'blue.png', bluePng)
  await expect(page.getByText('blue.png', { exact: true })).toBeVisible()
  await expect(page.getByText('red.png', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sort images: Filename' })).toBeVisible()

  await filters.getByRole('radio', { name: 'Used', exact: true }).click()
  await importImage(page, 'green.png', solidPng(80, 180, 60))
  await expect(page.getByText('green.png', { exact: true })).toBeVisible()
  await expect(page.getByText('blue.png', { exact: true })).toBeVisible()
  await expect(page.getByText('red.png', { exact: true })).toBeVisible()
})

test('import keeps a matching search and clears filters that hide new photos', async ({ page }) => {
  await page.goto('/')
  await importImage(page, 'photo-red.png', redPng)
  const search = page.getByRole('textbox', { name: 'Search images' })
  await search.fill('photo')
  await importImage(page, 'photo-blue.png', bluePng)
  await expect(search).toHaveValue('photo')

  await search.fill('red')
  await importImage(page, 'green.png', solidPng(80, 180, 60))
  await expect(search).toHaveValue('')
  await expect(page.getByText('green.png', { exact: true })).toBeVisible()

  await page
    .locator('.asset-filters')
    .getByRole('radio', { name: /Missing/ })
    .click()
  await importImage(page, 'yellow.png', solidPng(230, 190, 40))
  await expect(page.getByText('yellow.png', { exact: true })).toBeVisible()
})

test('imports and removes an image from the project collection', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('photo-upload-input').setInputFiles({
    name: 'remove-me.png',
    mimeType: 'image/png',
    buffer: onePixelPng,
  })
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByRole('button', { name: 'Manage photos' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Photo library' }).getByText('remove-me.png'),
  ).toBeVisible()
  await page
    .getByRole('dialog', { name: 'Photo library' })
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

test('an import opens Images and keeps one batch summary with file errors', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('photo-upload-input').setInputFiles([
    { name: 'good.png', mimeType: 'image/png', buffer: redPng },
    { name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') },
  ])

  await expect(page.getByRole('tab', { name: 'Images' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('good.png', { exact: true })).toBeVisible()
  await expect(page.getByText('1 added · 1 skipped', { exact: true })).toBeVisible()
  await expect(page.locator('.image-panel > .import-summary')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add photos' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Manage photos' })).toBeVisible()
  await page.getByText('Review 1 import issue', { exact: true }).click()
  await expect(page.getByText('bad.txt', { exact: true })).toBeVisible()
  await expect(page.getByText(/use a PNG, JPEG, WebP, HEIC, or HEIF image/)).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss import summary' }).click()
  await expect(page.getByText('1 added · 1 skipped', { exact: true })).toHaveCount(0)
})

test('gives conversion guidance when a HEIC image cannot be decoded', async ({ page }) => {
  await page.goto('/')
  await importImage(
    page,
    'damaged.heic',
    Buffer.from('not a valid HEIC image'),
    'image/heic',
    '0 added · 1 skipped',
  )
  await expect(page.getByText('0 added · 1 skipped', { exact: true })).toBeVisible()
  await page.getByText('Review 1 import issue', { exact: true }).click()
  await expect(page.getByText('damaged.heic', { exact: true })).toBeVisible()
  await expect(page.getByText(/Convert it to JPEG or PNG and try again/)).toBeVisible()
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

  await page.getByRole('tab', { name: 'Images' }).click()
  await expect(page.getByTitle(/^used\.png.*0 uses/)).toBeVisible()
  await expect(page.getByTitle(/^unused\.png.*0 uses/)).toBeVisible()
  await assignSidebarImage(page, 'used.png', 1)
  await expect(page.getByTitle(/^used\.png.*1 use/)).toBeVisible()

  await page.getByRole('button', { name: 'Manage photos' }).click()
  const manager = page.getByRole('dialog', { name: 'Photo library' })
  await manager.getByRole('radio', { name: 'Used', exact: true }).click()
  await expect(manager.getByText('used.png', { exact: true })).toBeVisible()
  await expect(manager.getByText('unused.png', { exact: true })).toHaveCount(0)
  await manager.getByRole('radio', { name: 'Unused', exact: true }).click()
  await expect(manager.getByText('unused.png', { exact: true })).toBeVisible()

  await manager.getByRole('button', { name: 'Remove unused photos' }).click()
  await expect(manager.getByText('unused.png', { exact: true })).toHaveCount(0)
  await expect(manager.getByRole('button', { name: 'Remove unused photos' })).toBeDisabled()

  await manager.getByRole('radio', { name: 'All', exact: true }).click()
  await manager.getByRole('button', { name: 'Actions for used.png' }).click()
  await page.getByRole('menuitem', { name: 'Remove from project' }).click()
  const removal = page.getByRole('dialog', { name: 'Remove 1 image?' })
  await expect(removal).toContainText('1 frame placement')
  await removal.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(manager.getByText('used.png', { exact: true })).toBeVisible()
})

test('Photo library supports list view, search, sorting, and modal dismissal', async ({ page }) => {
  await page.goto('/')
  await importImage(page, 'zebra.png', redPng)
  await importImage(page, 'apple.png', bluePng)
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByRole('button', { name: 'Manage photos' }).click()
  const manager = page.getByRole('dialog', { name: 'Photo library' })

  await manager.getByRole('radio', { name: 'List view' }).click()
  await expect(manager.locator('.manager-asset-list')).toHaveClass(/manager-list-view/)
  await manager.getByRole('button', { name: 'Sort project photos' }).click()
  await page.getByRole('option', { name: 'Filename' }).click()
  await expect(manager.locator('.manager-asset-card strong')).toHaveText(['apple.png', 'zebra.png'])

  await manager.getByRole('textbox', { name: 'Search project photos' }).fill('zeb')
  await expect(manager.getByText('zebra.png', { exact: true })).toBeVisible()
  await expect(manager.getByText('apple.png', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(manager).toBeHidden()
})

test('library selection and frame focus do not replace placed images', async ({ page }) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'red.png', redPng)
  await importImage(page, 'blue.png', bluePng)
  await assignSidebarImage(page, 'red.png', 1)
  await assignSidebarImage(page, 'blue.png', 2)
  const [, right] = await twoColumnFrameCenters(page)

  await page.getByRole('button', { name: 'Frame 1, red.png' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByText('red.png', { exact: true }).click()
  const blueFrame = page.getByRole('button', { name: 'Frame 2, blue.png' })
  await blueFrame.focus()
  await expect(blueFrame).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => sampleStageColor(page, right)).toBe('blue')

  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Frame 2, blue.png' })).toBeVisible()
  await expect.poll(() => sampleStageColor(page, right)).toBe('blue')
})

test('Replace this frame preserves other uses of the original image', async ({ page }) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'shared.png', redPng)
  await importImage(page, 'replacement.png', bluePng)
  await assignSidebarImage(page, 'shared.png', 1)
  await assignSidebarImage(page, 'shared.png', 2)
  const [left, right] = await twoColumnFrameCenters(page)

  await page.getByRole('button', { name: 'Frame 1, shared.png' }).focus()
  await page.keyboard.press('Enter')
  const properties = page.getByRole('complementary', { name: 'Properties' })
  await expect(properties.locator('.property-group-heading button').first()).toHaveText(
    /Image & crop/,
  )
  await expect(properties.getByRole('button', { name: 'Advanced shadow' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await page.getByRole('button', { name: 'Replace this frame' }).click()
  await page.getByText('replacement.png', { exact: true }).click()

  await expect(page.getByRole('button', { name: 'Frame 1, replacement.png' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Frame 2, shared.png' })).toBeVisible()
  await expect.poll(() => sampleStageColor(page, left)).toBe('blue')
  await expect.poll(() => sampleStageColor(page, right)).toBe('red')

  await page.getByRole('button', { name: 'Actions for shared.png' }).click()
  await expect(page.getByRole('menuitem', { name: 'Replace original' })).toBeVisible()
})

test('missing photos can be matched from several files and undone', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('project-file-input').setInputFiles({
    name: 'missing-photo.collage',
    mimeType: collageMimeType,
    buffer: Buffer.from(missingPhotoArchive()),
  })
  await expect(page.locator('.toast')).toContainText('Project opened with 1 photo to locate')

  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByRole('button', { name: 'Manage photos' }).click()
  const manager = page.getByRole('dialog', { name: 'Photo library' })
  const locateMissing = manager.getByRole('button', { name: 'Locate missing photos' })
  await expect(locateMissing).toBeVisible()
  await page.getByTestId('photo-relink-many-input').setInputFiles([
    { name: 'other.png', mimeType: 'image/png', buffer: onePixelPng },
    { name: 'red.png', mimeType: 'image/png', buffer: bluePng },
  ])
  const confirmation = page.getByRole('dialog', { name: 'Use a different image?' })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Use image anyway' }).click()
  await expect(locateMissing).toBeHidden()

  await manager.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.getByRole('button', { name: 'Manage photos' }).click()
  await expect(manager).toBeVisible()
  await expect(manager.getByRole('button', { name: 'Locate missing photos' })).toBeVisible()
})

test('relinking a different image asks in-app before replacing the missing original', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByTestId('project-file-input').setInputFiles({
    name: 'missing-photo.collage',
    mimeType: collageMimeType,
    buffer: Buffer.from(missingPhotoArchive()),
  })
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.locator('.asset-row').first().click()
  await page
    .getByTestId('photo-relink-input')
    .setInputFiles({ name: 'blue.png', mimeType: 'image/png', buffer: bluePng })

  const confirmation = page.getByRole('dialog', { name: 'Use a different image?' })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(confirmation).toBeHidden()
  await expect(page.locator('.asset-row strong.asset-missing')).toBeVisible()
})
