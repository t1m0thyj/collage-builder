import { test, expect } from './test-fixtures'
import { assignSidebarImage, redPng, canvasDocumentPoint, useWideSystemFont } from './test-helpers'

for (const width of [768, 959]) {
  test(`the ${width}px editor fits and opens layouts from the top-left button`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 720 })
    await page.goto('/')
    await useWideSystemFont(page)
    const toggle = page.getByRole('button', { name: 'Layouts and images', exact: true })
    const sidebar = page.getByRole('complementary', { name: 'Layouts and images' })
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(sidebar).toBeHidden()
    await expect(page.getByRole('complementary', { name: 'Properties' })).toBeVisible()
    await expect(
      page.getByRole('slider', { name: 'Resize layouts and images sidebar' }),
    ).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    for (const name of ['New', 'Open', 'Save', 'Export…']) {
      const button = page.getByRole('button', { name, exact: true })
      const box = await button.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    }
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`) })
    await toggle.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('tab', { name: 'Layouts', exact: true })).toBeFocused()
    await page.screenshot({ path: testInfo.outputPath(`sidebar-${width}.png`) })
    await page.keyboard.press('Escape')
    await expect(sidebar).toBeHidden()
    await expect(toggle).toBeFocused()
    await toggle.click()
    await page.locator('.layout-card').first().click()
    await expect(sidebar).toBeHidden()
    await expect(toggle).toBeFocused()
    await toggle.click()
    await page.getByRole('spinbutton', { name: 'Page width', exact: true }).click()
    await expect(sidebar).toBeHidden()
  })
}

test('compact image assignment opens the library and returns to the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 720 })
  await page.goto('/')
  await page
    .getByTestId('photo-upload-input')
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: redPng })
  await expect(
    page.locator('.sidebar-asset-card').getByText('photo.png', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Close layouts and images' }).click()
  await assignSidebarImage(page, 'photo.png', 1)
  await expect(page.getByRole('complementary', { name: 'Layouts and images' })).toBeHidden()
  await expect(page.getByRole('complementary', { name: 'Properties' })).toContainText('photo.png')
})

test('compact sidebar restores desktop layout and focus when resizing', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 720 })
  await page.goto('/')
  const sidebar = page.getByRole('complementary', { name: 'Layouts and images' })
  await expect(sidebar).toBeVisible()
  await page.getByRole('tab', { name: 'Layouts', exact: true }).focus()
  await page.setViewportSize({ width: 959, height: 720 })
  const toggle = page.getByRole('button', { name: 'Layouts and images', exact: true })
  await expect(sidebar).toBeHidden()
  await expect(toggle).toBeFocused()
  await toggle.click()
  await page.getByRole('tab', { name: 'Images', exact: true }).click()
  await page.getByRole('button', { name: 'Close layouts and images' }).click()
  await page.setViewportSize({ width: 960, height: 720 })
  await expect(toggle).toHaveCount(0)
  await expect(sidebar).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Images', exact: true })).toBeFocused()
  await expect(
    page.getByRole('slider', { name: 'Resize layouts and images sidebar' }),
  ).toBeVisible()
})

test('compact image dragging reaches a frame behind the overlay', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 720 })
  await page.goto('/')
  await page
    .getByTestId('photo-upload-input')
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: redPng })
  const card = page.locator('.sidebar-asset-card').filter({ hasText: 'photo.png' })
  await expect(card).toBeVisible()
  const canvas = page.getByRole('region', { name: 'Collage canvas' })
  const [frame] = JSON.parse((await canvas.getAttribute('data-frame-hitboxes'))!)
  const target = await canvasDocumentPoint(page, {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  })
  const source = await card.locator('img.asset-thumb').boundingBox()
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2)
  await page.mouse.down()
  await page.mouse.move(source!.x + source!.width / 2 + 10, source!.y + source!.height / 2, {
    steps: 5,
  })
  await page.mouse.move(target.x, target.y, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByRole('button', { name: 'Frame 1, photo.png', exact: true })).toBeAttached()
  await expect(page.getByRole('complementary', { name: 'Layouts and images' })).toBeHidden()
})

test('compact sidebar keeps nested menus and dialogs usable', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 720 })
  await page.goto('/')
  await page
    .getByTestId('photo-upload-input')
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: redPng })
  const sidebar = page.getByRole('complementary', { name: 'Layouts and images' })
  await page.getByRole('button', { name: 'Actions for photo.png' }).click()
  await expect(page.getByRole('menuitem', { name: 'Add to page' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menuitem', { name: 'Add to page' })).toBeHidden()
  await expect(sidebar).toBeVisible()
  await page.getByRole('button', { name: 'Manage photos' }).click()
  await expect(page.getByRole('dialog', { name: 'Photo library' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Photo library' })).toBeHidden()
  await expect(sidebar).toBeVisible()
  await expect(page.getByRole('button', { name: 'Manage photos' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sidebar).toBeHidden()
  await expect(page.getByRole('button', { name: 'Layouts and images', exact: true })).toBeFocused()
})

test('compact layout fits saved wide sidebars in dark mode', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 768, height: 540 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.addInitScript(() => {
    localStorage.setItem(
      'collage-builder:sidebar-widths',
      JSON.stringify({ left: 360, right: 360 }),
    )
  })
  await page.goto('/')
  const properties = page.getByRole('complementary', { name: 'Properties' })
  await useWideSystemFont(page)
  await expect(properties).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(768)
  await page.getByRole('button', { name: 'Layouts and images', exact: true }).click()
  const sidebar = page.getByRole('complementary', { name: 'Layouts and images' })
  await expect(sidebar).toBeVisible()
  expect((await sidebar.boundingBox())!.width).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('compact-dark-wide-sidebars.png') })
})
