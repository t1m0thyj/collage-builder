import { test, expect } from './test-fixtures'

test('opening tab actions does not remove the active page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add page' }).click()
  await expect(page.getByRole('button', { name: 'Page 2' })).toBeVisible()
  await page.getByRole('button', { name: 'Page actions' }).click()
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible()
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
  expect(inactiveBounds?.width).toBe(namedBounds?.width)
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
  const addPage = page.getByRole('button', { name: 'Add page' })
  await expect(tabs).toHaveText(['Page 1', 'Page 2', 'Page 3', 'Page 4', 'Page 5', 'Page 6'])
  await expect(page.getByRole('button', { name: 'Scroll tabs left' })).toHaveCount(0)
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
