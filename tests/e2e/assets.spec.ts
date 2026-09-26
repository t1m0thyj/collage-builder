import { test, expect } from './test-fixtures'
import {
  solidPng,
  onePixelPng,
  redPng,
  bluePng,
  missingPhotoArchive,
  importImage,
  encodedRaster,
  chooseTwoColumnLayout,
  twoColumnFrameCenters,
  assignSidebarImage,
  sampleStageColor,
  collageMimeType,
} from './test-helpers'

test('successful photo imports show a brief toast instead of a sidebar summary', async ({
  page,
}) => {
  await page.goto('/')
  await importImage(page, 'photo.png')
  await expect(page.locator('.toast')).toHaveText('')
  await expect(page.locator('.import-summary')).toHaveCount(0)
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
  await page
    .locator(
      'input[type="file"][accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"]',
    )
    .first()
    .setInputFiles([
      { name: 'good.png', mimeType: 'image/png', buffer: redPng },
      { name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') },
    ])

  await expect(page.getByRole('tab', { name: 'Images' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('good.png', { exact: true })).toBeVisible()
  await expect(page.getByText('1 added · 1 skipped', { exact: true })).toBeVisible()
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
  await page.locator('input[type="file"][accept*=".collage.json"]').setInputFiles({
    name: 'missing-photo.collage',
    mimeType: collageMimeType,
    buffer: Buffer.from(missingPhotoArchive()),
  })
  await expect(page.getByRole('status')).toContainText('Project opened with 1 photo to locate')

  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByRole('button', { name: 'Manage photos' }).click()
  const manager = page.getByRole('dialog', { name: 'Photo library' })
  const locateMissing = manager.getByRole('button', { name: 'Locate missing photos' })
  await expect(locateMissing).toBeVisible()
  await page
    .locator('input[type="file"][multiple][accept*="image/jpeg"]')
    .nth(1)
    .setInputFiles([
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
  await page.locator('input[type="file"][accept*=".collage.json"]').setInputFiles({
    name: 'missing-photo.collage',
    mimeType: collageMimeType,
    buffer: Buffer.from(missingPhotoArchive()),
  })
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.locator('.asset-row').first().click()
  await page
    .locator('input[type="file"][accept*="image/jpeg"]:not([multiple])')
    .nth(1)
    .setInputFiles({ name: 'blue.png', mimeType: 'image/png', buffer: bluePng })

  const confirmation = page.getByRole('dialog', { name: 'Use a different image?' })
  await expect(confirmation).toBeVisible()
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(confirmation).toBeHidden()
  await expect(page.locator('.asset-row strong.asset-missing')).toBeVisible()
})
