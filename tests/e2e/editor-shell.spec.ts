import { test, expect } from './test-fixtures'
import { assignSidebarImage, expectOnTop, importImage, redPng } from './test-helpers'

test('renders the editor shell and opens the photo library', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('textbox', { name: 'Project title' })).toHaveValue('Untitled collage')
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByRole('button', { name: 'Manage photos' }).click()
  await expect(page.getByRole('dialog', { name: 'Photo library' })).toBeVisible()
  await expectOnTop(page, 'Photo library')
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
  await page.locator('[data-layout-id="generated-2-t44b67f0379bd3d39"]').click()
  await expect(page.locator('.toast')).toContainText('Layout selected: 2 landscapes')

  const firstCard = page.locator('.layout-card').first()
  const widthWithoutOverflow = (await firstCard.boundingBox())?.width
  expect(widthWithoutOverflow).toBeDefined()
  await photoCounts.getByRole('tab', { name: '8', exact: true }).click()
  await expect(page.locator('.layout-card')).toHaveCount(32)
  await expect
    .poll(() =>
      page
        .locator('#layout-options-panel')
        .evaluate((element) => element.scrollHeight > element.clientHeight),
    )
    .toBe(true)
  const widthWithOverflow = (await firstCard.boundingBox())?.width
  expect(widthWithOverflow).toBeCloseTo(widthWithoutOverflow!, 3)

  await photoCounts.getByRole('tab', { name: '11 or more photos' }).click()
  await expect(page.locator('.layout-card')).toHaveCount(23)
  await expect(page.locator('.layout-count-heading')).toHaveText([
    '11 photos',
    '12 photos',
    '13 photos',
    '14 photos',
    '15 photos',
    '16 photos',
  ])
  await expect(page.getByRole('button', { name: /^16-photo layout/ }).first()).toBeVisible()

  await photoCounts.getByRole('tab', { name: '4', exact: true }).click()
  await page.getByRole('button', { name: 'Add page' }).click()
  await expect(photoCounts.getByRole('tab', { name: '2', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
})

test('sidebar and layout tabs support keyboard navigation and identify their panels', async ({
  page,
}) => {
  await page.goto('/')

  const editorTabs = page.getByRole('tablist', { name: 'Editor panel' })
  const layoutsTab = editorTabs.getByRole('tab', { name: 'Layouts' })
  const imagesTab = editorTabs.getByRole('tab', { name: 'Images' })
  await layoutsTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(imagesTab).toBeFocused()
  await expect(imagesTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator(`#${await imagesTab.getAttribute('aria-controls')}`)).toHaveAttribute(
    'aria-labelledby',
    await imagesTab.getAttribute('id'),
  )
  await page.keyboard.press('ArrowLeft')
  await expect(layoutsTab).toBeFocused()

  const photoCounts = page.getByRole('tablist', { name: 'Photo count' })
  const threePhotos = photoCounts.getByRole('tab', { name: '3', exact: true })
  const fourPhotos = photoCounts.getByRole('tab', { name: '4', exact: true })
  await threePhotos.focus()
  await page.keyboard.press('ArrowRight')
  await expect(fourPhotos).toBeFocused()
  await expect(fourPhotos).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator(`#${await fourPhotos.getAttribute('aria-controls')}`)).toHaveAttribute(
    'aria-labelledby',
    await fourPhotos.getAttribute('id'),
  )
  await page.keyboard.press('Home')
  await expect(photoCounts.getByRole('tab', { name: '2', exact: true })).toBeFocused()
  await page.keyboard.press('End')
  await expect(photoCounts.getByRole('tab', { name: '11 or more photos' })).toBeFocused()
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
  const managerTrigger = page.getByRole('button', { name: 'Manage photos' })
  await managerTrigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Photo library' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Photo library' })).toBeHidden()
  await expect(managerTrigger).toBeFocused()
})

test('Enter on a toolbar button leaves crop mode unchanged', async ({ page }) => {
  await page.goto('/')
  await importImage(page, 'original.png', redPng)
  await assignSidebarImage(page, 'original.png', 1)

  await page.getByRole('button', { name: 'Zoom in', exact: true }).focus()
  await page.keyboard.press('Enter')

  await expect(page.getByText('Crop mode is active.', { exact: false })).toHaveCount(0)
})

test('initial keyboard focus skips hidden file inputs and canvas frames are named', async ({
  page,
}) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Skip to canvas' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'Canvas preview' })).toBeFocused()

  const frameControls = page.locator('.canvas-frame-controls button')
  await expect(frameControls).toHaveCount(3)
  await expect(frameControls.first()).toHaveAttribute('aria-label', 'Frame 1, empty')
  await page.keyboard.press('Tab')
  await expect(frameControls.first()).toBeFocused()
  await expect(frameControls.first()).toHaveAttribute('aria-pressed', 'false')
})

test('honors reduced-motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const duration = await page
    .getByRole('button', { name: 'New', exact: true })
    .evaluate((element) => getComputedStyle(element).transitionDuration)
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.001)
})

test('shows development offline status as a compact icon', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 })
  await page.goto('/')
  const status = page.getByRole('img', {
    name: 'Development mode: offline support runs in production builds',
  })
  await expect(status).toBeVisible()
  await expect(status).toHaveAttribute(
    'title',
    'Development mode: offline support runs in production builds',
  )
  const recoveryStatus = page.getByRole('button', {
    name: 'No changes. Manage local copies and browser storage',
  })
  await expect(recoveryStatus).toBeVisible()
  await expect(recoveryStatus.locator('.status-dot')).toHaveClass(/neutral/)
  await expect(page.getByRole('button', { name: 'Dev mode' })).toHaveCount(0)
  await expect(page.getByText('Checking offline support…')).toHaveCount(0)
})

test('keeps primary editing controls available in a 960 CSS pixel viewport', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 })
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save options' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Show quick start' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Manage local copies and browser storage/ }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export…' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Layouts' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Properties' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(960)
})
