import { test, expect } from './test-fixtures'
import {
  collageMimeType,
  exportCurrentPng,
  sampleDownloadedPng,
  useWideSystemFont,
  visualParityArchive,
} from './test-helpers'
import { createHash } from 'node:crypto'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { CollageDocumentV1 } from '../../src/lib/domain/types'

test('tab previews preserve rounded frames, transparency, shadows, and all portrait margins', async ({
  page,
}) => {
  await page.goto('/')
  const archive = unzipSync(visualParityArchive())
  const document = JSON.parse(strFromU8(archive['document.json'])) as CollageDocumentV1
  const portrait = structuredClone(document.pages[1])
  portrait.id = '22222222-2222-4222-8222-222222222222'
  portrait.name = 'Tall page'
  portrait.width = 600
  portrait.height = 1600
  portrait.style.padding = 20
  portrait.style.transparentBackground = false
  document.pages.push(portrait)
  archive['document.json'] = strToU8(JSON.stringify(document))
  await page.getByTestId('project-file-input').setInputFiles({
    name: 'previews.collage',
    mimeType: collageMimeType,
    buffer: Buffer.from(zipSync(archive)),
  })
  await expect(page.locator('.toast')).toHaveText('Project opened.')

  const pixel = (x: number, y: number) =>
    page
      .locator('.page-tab-preview canvas')
      .evaluate(
        (canvas: HTMLCanvasElement, { x, y }) => [
          ...canvas
            .getContext('2d')!
            .getImageData(Math.floor(x * canvas.width), Math.floor(y * canvas.height), 1, 1).data,
        ],
        { x, y },
      )
  for (const name of ['Rounded', 'Transparent', 'Shadow']) {
    await page.getByRole('button', { name, exact: true }).hover()
    await expect(page.getByRole('img', { name: `Preview of ${name}` })).toBeVisible()
    await expect.poll(() => pixel(0.5, 0.5)).toEqual([238, 45, 54, 255])
    expect(await pixel(0, 0)).toEqual([0, 0, 0, 0])
    if (name === 'Shadow') {
      const shadow = await pixel(0.84, 0.5)
      expect(shadow.slice(0, 3)).toEqual([0, 0, 0])
      expect(shadow[3]).toBeGreaterThanOrEqual(120)
      expect(shadow[3]).toBeLessThanOrEqual(135)
    }
  }

  // Switching quickly must leave the last page's image and full margins intact.
  await page.getByRole('button', { name: 'Rounded', exact: true }).hover()
  await page.getByRole('button', { name: 'Tall page', exact: true }).hover()
  const preview = page.getByRole('img', { name: 'Preview of Tall page' })
  await expect(preview).toBeVisible()
  await expect.poll(() => pixel(0.5, 0.5)).toEqual([238, 45, 54, 255])
  for (const [x, y] of [
    [0, 0.5],
    [0.99, 0.5],
    [0.5, 0],
    [0.5, 0.999],
  ])
    expect(await pixel(x, y)).toEqual([0, 255, 0, 255])
  const bounds = (await preview.locator('canvas').boundingBox())!
  expect(bounds.height).toBeLessThanOrEqual(220)
  expect(bounds.width / bounds.height).toBeCloseTo(600 / 1600, 2)
  const tooltip = (await page.getByRole('tooltip').boundingBox())!
  expect(tooltip.y).toBeGreaterThanOrEqual(0)
  await page.screenshot({ path: test.info().outputPath('tab-preview-portrait.png') })
})

test('tab previews match exported panned, zoomed, rotated, and polygon-clipped images', async ({
  page,
}) => {
  await page.goto('/')
  const imageBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 200
    const context = canvas.getContext('2d')!
    for (const [x, y, color] of [
      [0, 0, '#ff0000'],
      [200, 0, '#00ff00'],
      [0, 100, '#0000ff'],
      [200, 100, '#ffff00'],
    ] as const) {
      context.fillStyle = color
      context.fillRect(x, y, 200, 100)
    }
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const image = Buffer.from(imageBase64, 'base64')
  const archive = unzipSync(visualParityArchive())
  const document = JSON.parse(strFromU8(archive['document.json'])) as CollageDocumentV1
  const asset = Object.values(document.assets)[0]
  Object.assign(asset, {
    width: 400,
    height: 200,
    byteLength: image.length,
    sha256: createHash('sha256').update(image).digest('hex'),
  })
  archive[`assets/${asset.id}`] = image
  const currentPage = document.pages[0]
  currentPage.name = 'Cropped'
  currentPage.width = 400
  currentPage.height = 400
  currentPage.style.padding = 20
  currentPage.style.cornerRadius = 0
  currentPage.layout.root = {
    kind: 'leaf',
    slotId: Object.keys(currentPage.slots)[0],
    polygon: [
      { x: 0.5, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  }
  Object.values(currentPage.slots)[0]!.placement = {
    zoom: 1.6,
    positionX: 0.2,
    positionY: 0.75,
    rotation: 90,
    flipHorizontal: true,
    flipVertical: true,
  }
  document.pages = [currentPage]
  archive['document.json'] = strToU8(JSON.stringify(document))
  await page.getByTestId('project-file-input').setInputFiles({
    name: 'cropped-preview.collage',
    mimeType: collageMimeType,
    buffer: Buffer.from(zipSync(archive)),
  })
  await expect(page.locator('.toast')).toHaveText('Project opened.')
  await page.getByRole('button', { name: 'Cropped', exact: true }).hover()
  const preview = page.locator('.page-tab-preview canvas')
  await expect(preview).toBeVisible()
  const points = [
    { x: 4, y: 4 },
    { x: 110, y: 35 },
    { x: 70, y: 175 },
    { x: 160, y: 175 },
  ]
  const previewPixels = () =>
    preview.evaluate(
      (canvas: HTMLCanvasElement, points) =>
        points.map(({ x, y }) => [
          ...canvas
            .getContext('2d')!
            .getImageData(
              Math.round((x * canvas.width) / canvas.clientWidth),
              Math.round((y * canvas.height) / canvas.clientHeight),
              1,
              1,
            ).data,
        ]),
      points,
    )
  await expect.poll(async () => (await previewPixels())[1][3]).toBe(255)
  const actual = await previewPixels()
  const expected = await sampleDownloadedPng(page, await exportCurrentPng(page, 220), points)
  expect(actual).toEqual(expected)
})

test('opening tab actions does not remove the active page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add page' }).click()
  await expect(page.getByRole('button', { name: 'Page 2' })).toBeVisible()
  await page.getByRole('button', { name: 'Page actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Page 2' })).toBeVisible()
})

test('right-clicking a tab opens its page menu, including on an inactive page', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Page 1' }).click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Add page' }).click()
  const firstTab = page.getByRole('button', { name: 'Page 1', exact: true })
  await firstTab.click({ button: 'right' })
  await expect(firstTab).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const nameEditor = page.getByRole('textbox', { name: 'Rename page' })
  await nameEditor.fill('Cover')
  await nameEditor.press('Enter')
  await expect(page.getByRole('button', { name: 'Cover' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'Page 2' })).toBeVisible()
})

test('page actions rename and duplicate without accidental deletion', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Page actions' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const nameEditor = page.getByRole('textbox', { name: 'Rename page' })
  await expect(nameEditor).toBeFocused()
  await nameEditor.fill('Cover')
  await nameEditor.press('Enter')
  await expect(page.getByRole('button', { name: 'Cover' })).toBeVisible()

  await page.getByRole('button', { name: 'Cover' }).dblclick()
  await nameEditor.fill('Discarded name')
  await nameEditor.press('Escape')
  await expect(page.getByRole('button', { name: 'Cover' })).toBeVisible()

  await page.getByRole('button', { name: 'Page actions' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect(page.getByRole('button', { name: /Cover/ })).toHaveCount(2)
})

test('double-click rename saves when focus leaves the tab', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Page 1' }).dblclick()
  const nameEditor = page.getByRole('textbox', { name: 'Rename page' })
  await nameEditor.fill('First page')
  await page.getByRole('textbox', { name: 'Project title' }).click()
  await expect(page.getByRole('button', { name: 'First page' })).toBeVisible()
  await expect(nameEditor).toHaveCount(0)
})

test('a longer page name expands its tab enough to show the name', async ({ page }) => {
  await page.goto('/')
  await useWideSystemFont(page)
  const tab = page.getByRole('button', { name: 'Page 1' })
  const originalWidth = (await tab.boundingBox())!.width
  expect(originalWidth).toBeLessThanOrEqual(85)

  await tab.dblclick()
  const nameEditor = page.getByRole('textbox', { name: 'Rename page' })
  await nameEditor.fill('Summer vacation photos')
  await nameEditor.press('Enter')

  const renamedTab = page.getByRole('button', { name: 'Summer vacation photos' })
  await expect(renamedTab).toBeVisible()
  await expect
    .poll(async () => (await renamedTab.boundingBox())!.width)
    .toBeGreaterThan(originalWidth)
  const label = renamedTab.locator('.page-tab-label')
  expect(
    await label.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1)

  const longWidth = (await renamedTab.boundingBox())!.width
  await renamedTab.dblclick()
  await nameEditor.fill('A')
  await nameEditor.press('Enter')
  const shortTab = page.getByRole('button', { name: 'A', exact: true })
  await expect.poll(async () => (await shortTab.boundingBox())!.width).toBeLessThan(longWidth)
  const shortWidth = (await shortTab.boundingBox())!.width
  expect(shortWidth).toBeLessThanOrEqual(85)

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await renamedTab.boundingBox())!.width).toBeGreaterThan(shortWidth)
  await expect
    .poll(() => label.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1)
})

test('renaming a page does not move neighboring tabs', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add page' }).click()
  await page.getByRole('button', { name: 'Add page' }).click()

  const tabs = page.locator('.page-tab-viewport > .page-tab-with-actions')
  const thirdTab = tabs.nth(2)
  await tabs.nth(1).getByRole('button', { name: 'Page 2' }).click()
  const before = await thirdTab.boundingBox()
  expect(before).not.toBeNull()

  await tabs.nth(1).getByRole('button', { name: 'Page 2' }).dblclick()
  const nameEditor = page.getByRole('textbox', { name: 'Rename page' })
  await expect(nameEditor).toBeVisible()
  const during = await thirdTab.boundingBox()
  expect(during?.x).toBe(before?.x)
  expect(during?.width).toBe(before?.width)

  await expect(page.getByRole('button', { name: 'Page actions' })).toHaveCount(0)
  const tab = await tabs.nth(1).boundingBox()
  const editor = await nameEditor.boundingBox()
  expect(editor?.width).toBe(tab?.width)
  await nameEditor.press('Escape')
  await expect(thirdTab).toBeVisible()
})

test('switching pages keeps short tab widths stable and actions inside the active tab', async ({
  page,
}) => {
  await page.goto('/')
  await useWideSystemFont(page)
  await page.getByRole('button', { name: 'Add page' }).click()
  await page.getByRole('button', { name: 'Add page' }).click()

  const tabs = page.locator('.page-tab-viewport > .page-tab-with-actions')
  const boundsBefore = await tabs.evaluateAll((elements) =>
    elements.map((element) => ({
      x: element.getBoundingClientRect().x,
      width: element.getBoundingClientRect().width,
    })),
  )
  await page.getByRole('button', { name: 'Page 1', exact: true }).click()
  const boundsAfter = await tabs.evaluateAll((elements) =>
    elements.map((element) => ({
      x: element.getBoundingClientRect().x,
      width: element.getBoundingClientRect().width,
    })),
  )
  expect(boundsAfter).toEqual(boundsBefore)
  const active = await tabs.first().boundingBox()
  const arrow = await page.getByRole('button', { name: 'Page actions' }).boundingBox()
  expect(arrow).not.toBeNull()
  expect(active).not.toBeNull()
  expect(arrow!.x + arrow!.width).toBeLessThanOrEqual(active!.x + active!.width)
  await page.getByRole('button', { name: 'Page actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible()

  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const editor = page.getByRole('textbox', { name: 'Rename page' })
  await editor.fill('Summer album')
  await editor.press('Enter')
  const namedBounds = await tabs.first().boundingBox()
  await page.getByRole('button', { name: 'Page 2', exact: true }).click()
  const inactiveBounds = await tabs.first().boundingBox()
  expect(inactiveBounds!.width).toBeLessThan(namedBounds!.width)
  await page.getByRole('button', { name: 'Summer album' }).click()
  await expect.poll(async () => (await tabs.first().boundingBox())!.width).toBe(namedBounds!.width)
})

test('page tabs can be reordered by dragging', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add page' }).click()
  await page.getByRole('button', { name: 'Add page' }).click()

  const first = page.getByRole('button', { name: 'Page 1', exact: true })
  const third = page.getByRole('button', { name: 'Page 3', exact: true })
  await first.dragTo(third, { targetPosition: { x: 50, y: 16 } })

  await expect(page.locator('.page-tab-viewport > .page-tab-with-actions > .page-tab')).toHaveText([
    'Page 2',
    'Page 3',
    'Page 1',
  ])
})

test('page tabs remain visible while they fit and gain scroll arrows when space shrinks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 900 })
  await page.goto('/')
  for (let pageNumber = 2; pageNumber <= 6; pageNumber += 1)
    await page.getByRole('button', { name: 'Add page' }).click()

  const tabs = page.locator('.page-tab-viewport > .page-tab-with-actions > .page-tab')
  const pagebar = page.locator('.pagebar')
  const tabViewport = page.locator('.page-tab-viewport')
  const addPage = page.getByRole('button', { name: 'Add page' })
  await expect(tabs).toHaveText(['Page 1', 'Page 2', 'Page 3', 'Page 4', 'Page 5', 'Page 6'])
  await expect(page.getByRole('button', { name: 'Scroll tabs left' })).toHaveCount(0)
  expect((await tabViewport.boundingBox())!.x - (await pagebar.boundingBox())!.x).toBe(4)
  await expect
    .poll(async () => {
      const tabBounds = await tabs.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().toJSON()),
      )
      const lastTab = await page
        .locator('.page-tab-viewport > .page-tab-with-actions')
        .last()
        .boundingBox()
      const addButton = await addPage.boundingBox()
      return (
        tabBounds.every((bounds) => bounds.y === tabBounds[0].y && bounds.height === 36) &&
        lastTab !== null &&
        addButton !== null &&
        addButton.x >= lastTab.x + lastTab.width &&
        addButton.x - (lastTab.x + lastTab.width) <= 8
      )
    })
    .toBe(true)

  await page.setViewportSize({ width: 1000, height: 900 })
  await expect(page.getByRole('button', { name: 'Scroll tabs left' })).toBeVisible()
  await expect(addPage).toBeVisible()
  const rightArrow = page.getByRole('button', { name: 'Scroll tabs right' })
  await expect
    .poll(async () => {
      const addButton = await addPage.boundingBox()
      const arrow = await rightArrow.boundingBox()
      return addButton !== null && arrow !== null && addButton.x + addButton.width <= arrow.x
    })
    .toBe(true)
  await expect(tabs).toHaveCount(6)
  await expect(rightArrow).toBeDisabled()
  await page.setViewportSize({ width: 1800, height: 900 })
  await expect(page.getByRole('button', { name: 'Scroll tabs left' })).toHaveCount(0)
  await expect(tabs).toHaveCount(6)
})

test('focused tabs stay fully visible at both ends of an overflowing strip', async ({ page }) => {
  await page.goto('/')
  await useWideSystemFont(page)
  for (let pageNumber = 2; pageNumber <= 10; pageNumber += 1)
    await page.getByRole('button', { name: 'Add page' }).click()

  const viewport = page.locator('.page-tab-viewport')
  for (const name of ['Page 1', 'Page 10']) {
    const tab = page.getByRole('button', { name, exact: true })
    await tab.click()
    await tab.focus()
    await expect
      .poll(async () => {
        const visible = await viewport.boundingBox()
        const bounds = await tab.boundingBox()
        return Boolean(
          visible &&
          bounds &&
          bounds.x >= visible.x &&
          bounds.x + bounds.width <= visible.x + visible.width,
        )
      })
      .toBe(true)
    expect(
      await tab.locator('..').evaluate((element) => getComputedStyle(element).outlineOffset),
    ).toBe('-2px')
  }
})

test('overflowing page tabs scroll with arrows and keep the active page in view', async ({
  page,
}) => {
  await page.goto('/')
  for (let pageNumber = 2; pageNumber <= 10; pageNumber += 1)
    await page.getByRole('button', { name: 'Add page' }).click()

  const tabStrip = page.locator('.page-tab-viewport')
  const leftArrow = page.getByRole('button', { name: 'Scroll tabs left' })
  const rightArrow = page.getByRole('button', { name: 'Scroll tabs right' })
  await expect(page.locator('.page-tab-viewport .page-tab')).toHaveCount(10)
  await expect(page.getByRole('button', { name: 'Page 10', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  const activeLabel = page
    .getByRole('button', { name: 'Page 10', exact: true })
    .locator('.page-tab-label')
  await expect
    .poll(() => activeLabel.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: 'Page 9', exact: true }).click()
  await page.getByRole('button', { name: 'Page 10', exact: true }).click()
  await expect
    .poll(() => activeLabel.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1)
  await expect(rightArrow).toBeDisabled()
  await expect(leftArrow).toBeEnabled()

  const rightEdge = await tabStrip.evaluate((element) => element.scrollLeft)
  await leftArrow.click()
  await expect
    .poll(() => tabStrip.evaluate((element) => element.scrollLeft))
    .toBeLessThan(rightEdge)
  await expect(rightArrow).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Page 10', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )

  await rightArrow.click()
  await expect(rightArrow).toBeDisabled()
  await page.getByRole('button', { name: 'Page 1', exact: true }).click()
  await expect(leftArrow).toBeDisabled()
  await expect
    .poll(() =>
      tabStrip.evaluate((element) => {
        const viewport = element.getBoundingClientRect()
        const active = element.querySelector('.active-tab-action')?.getBoundingClientRect()
        return Boolean(active && active.left >= viewport.left && active.right <= viewport.right)
      }),
    )
    .toBe(true)

  await page.getByRole('button', { name: 'Page 1', exact: true }).hover()
  await expect(page.getByRole('tooltip', { name: 'Page 1' })).toBeVisible()
  await rightArrow.hover()
  await expect(page.getByRole('tooltip', { name: 'Page 1' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Page 1', exact: true }).hover()
  await page.getByRole('button', { name: 'Page 2', exact: true }).hover()
  await expect(page.getByRole('tooltip')).toHaveCount(1)
  await expect(page.getByRole('tooltip', { name: 'Page 2' })).toBeVisible()
  await page.locator('#collage-canvas').hover()
  await expect(page.getByRole('tooltip')).toHaveCount(0)
})

test('mouse wheel scrolls overflowing page tabs in both directions', async ({ page }) => {
  await page.goto('/')
  for (let pageNumber = 2; pageNumber <= 10; pageNumber += 1)
    await page.getByRole('button', { name: 'Add page' }).click()

  const tabStrip = page.locator('.page-tab-viewport')
  const leftArrow = page.getByRole('button', { name: 'Scroll tabs left' })
  const rightArrow = page.getByRole('button', { name: 'Scroll tabs right' })
  await expect(leftArrow).toBeEnabled()
  await expect(rightArrow).toBeDisabled()
  await tabStrip.hover()
  const rightEdge = await tabStrip.evaluate((element) => element.scrollLeft)

  await page.mouse.wheel(0, -500)
  await expect
    .poll(() => tabStrip.evaluate((element) => element.scrollLeft))
    .toBeLessThan(rightEdge)
  await expect(rightArrow).toBeEnabled()
  const leftward = await tabStrip.evaluate((element) => element.scrollLeft)

  await page.mouse.wheel(0, 500)
  await expect
    .poll(() => tabStrip.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(leftward)
  await expect(leftArrow).toBeEnabled()
})
