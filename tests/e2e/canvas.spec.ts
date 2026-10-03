import { test, expect } from './test-fixtures'
import {
  onePixelPng,
  redPng,
  bluePng,
  importImage,
  dropLocalFiles,
  chooseTwoColumnLayout,
  canvasDocumentPoint,
  twoColumnFrameCenters,
  assignSidebarImage,
  sampleStageColor,
  sampleStagePixel,
  sampleDownloadedPng,
  exportCurrentPng,
  setNumber,
  useWideSystemFont,
} from './test-helpers'

test('horizontal and vertical flips mirror the selected frame in preview and export', async ({
  page,
}) => {
  await page.goto('/')
  await useWideSystemFont(page)
  const imageBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 400
    const context = canvas.getContext('2d')!
    for (const [x, y, color] of [
      [0, 0, '#ff0000'],
      [200, 0, '#00ff00'],
      [0, 200, '#0000ff'],
      [200, 200, '#ffff00'],
    ] as const) {
      context.fillStyle = color
      context.fillRect(x, y, 200, 200)
    }
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const host = page.getByRole('region', { name: 'Collage canvas' })
  const [frame] = JSON.parse((await host.getAttribute('data-frame-hitboxes'))!) as Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  const point = (x: number, y: number) => ({
    x: frame.x + frame.width * x,
    y: frame.y + frame.height * y,
  })
  await dropLocalFiles(
    host,
    [{ name: 'quadrants.png', buffer: Buffer.from(imageBase64, 'base64') }],
    await canvasDocumentPoint(page, point(0.5, 0.5)),
  )
  const orientation = page.getByRole('group', { name: 'Photo orientation' })
  const label = orientation.locator(':scope > span')
  const actions = orientation.locator('.crop-orientation-actions')
  await expect(label).toHaveText('Orientation')
  expect(await label.evaluate((element) => getComputedStyle(element).fontSize)).toBe(
    await page
      .locator('.crop-zoom > span')
      .evaluate((element) => getComputedStyle(element).fontSize),
  )
  const defaultLabel = (await label.boundingBox())!
  const defaultActions = (await actions.boundingBox())!
  expect(
    Math.abs(
      defaultLabel.y + defaultLabel.height / 2 - defaultActions.y - defaultActions.height / 2,
    ),
  ).toBeLessThan(2)
  await page.locator('.workspace').evaluate((element) => {
    ;(element as HTMLElement).style.setProperty('--right-sidebar-width', '210px')
  })
  expect(
    await orientation.evaluate((element) => {
      const row = element.getBoundingClientRect()
      return [...element.children].every((child) => {
        const bounds = child.getBoundingClientRect()
        return bounds.left >= row.left && bounds.right <= row.right
      })
    }),
  ).toBe(true)
  expect(
    await label.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1)
  expect(
    await actions
      .locator('button')
      .evaluateAll((buttons) =>
        buttons.every(
          (button) => button.getBoundingClientRect().y === buttons[0].getBoundingClientRect().y,
        ),
      ),
  ).toBe(true)
  const sampleColor = (pixel: number[]) => {
    const [red, green, blue] = pixel
    if (red > 200 && green < 80 && blue < 80) return 'red'
    if (green > 200 && red < 80 && blue < 80) return 'green'
    if (blue > 200 && red < 80 && green < 80) return 'blue'
    if (red > 200 && green > 200 && blue < 80) return 'yellow'
    return 'other'
  }
  const quadrants = [point(0.2, 0.2), point(0.8, 0.2), point(0.2, 0.8), point(0.8, 0.8)]
  const stageColors = async () =>
    Promise.all(
      quadrants.map(async (position) =>
        sampleColor(await sampleStagePixel(page, await canvasDocumentPoint(page, position))),
      ),
    )

  const horizontal = page.getByRole('button', { name: 'Flip photo horizontally' })
  const vertical = page.getByRole('button', { name: 'Flip photo vertically' })
  await horizontal.click()
  await expect(horizontal).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(stageColors).toEqual(['green', 'red', 'yellow', 'blue'])
  await page.getByRole('button', { name: 'Rotate photo right 90 degrees' }).click()
  await expect.poll(stageColors).toEqual(['yellow', 'green', 'blue', 'red'])
  await page.getByRole('button', { name: 'Rotate photo left 90 degrees' }).click()
  await vertical.click()
  await expect(vertical).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(stageColors).toEqual(['yellow', 'blue', 'green', 'red'])

  const exportPoints = quadrants.map(({ x, y }) => ({ x: x / 9.6, y: y / 9.6 }))
  const pixels = await sampleDownloadedPng(page, await exportCurrentPng(page, 400), exportPoints)
  expect(pixels.map(sampleColor)).toEqual(['yellow', 'blue', 'green', 'red'])

  await page.getByRole('button', { name: 'Rotate photo right 90 degrees' }).click()
  await expect.poll(stageColors).toEqual(['green', 'yellow', 'red', 'blue'])
  const rotatedPixels = await sampleDownloadedPng(
    page,
    await exportCurrentPng(page, 400),
    exportPoints,
  )
  expect(rotatedPixels.map(sampleColor)).toEqual(['green', 'yellow', 'red', 'blue'])
})

test('rotation affects only the selected frame and appears in export', async ({ page }) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  const imageBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 300
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ff0000'
    context.fillRect(0, 0, 300, 300)
    context.fillStyle = '#0000ff'
    context.fillRect(300, 0, 300, 300)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  const host = page.getByRole('region', { name: 'Collage canvas' })
  const frames = JSON.parse((await host.getAttribute('data-frame-hitboxes'))!) as Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  const center = await canvasDocumentPoint(page, {
    x: frames[0].x + frames[0].width / 2,
    y: frames[0].y + frames[0].height / 2,
  })
  await dropLocalFiles(
    host,
    [{ name: 'halves.png', buffer: Buffer.from(imageBase64, 'base64') }],
    center,
  )
  await expect(page.getByRole('button', { name: 'Frame 1, halves.png' })).toBeAttached()
  await page.getByRole('button', { name: 'Actions for halves.png' }).click()
  await page.getByRole('menuitem', { name: 'Add to page' }).click()
  await expect(page.getByRole('button', { name: 'Frame 2, halves.png' })).toBeAttached()

  const firstFrame = page.getByRole('button', { name: 'Frame 1, halves.png' })
  await firstFrame.focus()
  await firstFrame.press('Space')
  await expect(firstFrame).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Rotate photo right 90 degrees' }).click()
  await expect(page.getByRole('group', { name: 'Photo orientation' }).locator('output')).toHaveText(
    '90°',
  )
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('group', { name: 'Photo orientation' }).locator('output')).toHaveText(
    '0°',
  )
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(page.getByRole('group', { name: 'Photo orientation' }).locator('output')).toHaveText(
    '90°',
  )

  const documentPoints = [
    { x: frames[0].x + frames[0].width / 2, y: frames[0].y + frames[0].height * 0.2 },
    { x: frames[0].x + frames[0].width / 2, y: frames[0].y + frames[0].height * 0.8 },
    { x: frames[1].x + frames[1].width * 0.2, y: frames[1].y + frames[1].height / 2 },
    { x: frames[1].x + frames[1].width * 0.8, y: frames[1].y + frames[1].height / 2 },
  ]
  for (const [index, color] of ['red', 'blue', 'red', 'blue'].entries())
    await expect
      .poll(async () =>
        sampleStageColor(page, await canvasDocumentPoint(page, documentPoints[index])),
      )
      .toBe(color)
  const exportScale = 400 / 3840
  const points = documentPoints.map(({ x, y }) => ({ x: x * exportScale, y: y * exportScale }))
  const pixels = await sampleDownloadedPng(page, await exportCurrentPng(page, 400), points)
  expect(pixels[0][0]).toBeGreaterThan(200)
  expect(pixels[1][2]).toBeGreaterThan(200)
  expect(pixels[2][0]).toBeGreaterThan(200)
  expect(pixels[3][2]).toBeGreaterThan(200)

  await page.getByRole('button', { name: 'Crop image', exact: true }).click()
  const beforePan = JSON.parse((await host.getAttribute('data-crop-placement'))!) as { y: number }
  const panPoint = await canvasDocumentPoint(page, {
    x: frames[0].x + frames[0].width / 2,
    y: frames[0].y + frames[0].height / 2,
  })
  await page.mouse.move(panPoint.x, panPoint.y)
  await page.mouse.down()
  await page.mouse.move(panPoint.x, panPoint.y + 30, { steps: 6 })
  await page.mouse.up()
  await expect
    .poll(
      async () =>
        (JSON.parse((await host.getAttribute('data-crop-placement'))!) as { y: number }).y,
    )
    .not.toBe(beforePan.y)
  await expect(page.getByRole('group', { name: 'Photo orientation' }).locator('output')).toHaveText(
    '90°',
  )
})

test('dropping one local photo onto a frame imports and assigns it', async ({ page }) => {
  await page.goto('/')
  const host = page.getByRole('region', { name: 'Collage canvas' })
  const [frame] = JSON.parse((await host.getAttribute('data-frame-hitboxes'))!) as Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  const center = await canvasDocumentPoint(page, {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  })
  await dropLocalFiles(host, [{ name: 'dropped.png', buffer: redPng }], center)
  await expect(page.getByRole('button', { name: 'Frame 1, dropped.png' })).toBeAttached()
  await expect(page.locator('.toast')).toHaveText('Photo added to frame.')
})

test('dropping several local photos onto a frame imports the batch without assigning it', async ({
  page,
}) => {
  await page.goto('/')
  const host = page.getByRole('region', { name: 'Collage canvas' })
  const [frame] = JSON.parse((await host.getAttribute('data-frame-hitboxes'))!) as Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  const center = await canvasDocumentPoint(page, {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  })
  await dropLocalFiles(
    host,
    [
      { name: 'one.png', buffer: redPng },
      { name: 'two.png', buffer: bluePng },
    ],
    center,
  )
  await expect(page.locator('.toast')).toHaveText('2 photos added.')
  await expect(page.getByRole('button', { name: 'Frame 1, empty' })).toBeAttached()
  await expect(page.getByText('one.png', { exact: true })).toBeVisible()
  await expect(page.getByText('two.png', { exact: true })).toBeVisible()
})

test('normal-mode frame dragging swaps images without enabling crop', async ({ page }) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'red.png', redPng)
  await importImage(page, 'blue.png', bluePng)
  await assignSidebarImage(page, 'red.png', 1)
  await assignSidebarImage(page, 'blue.png', 2)
  const [left, right] = await twoColumnFrameCenters(page)

  await expect.poll(() => sampleStageColor(page, left)).toBe('red')
  await expect.poll(() => sampleStageColor(page, right)).toBe('blue')
  const sourceFrame = page.getByRole('button', { name: 'Frame 1, red.png' })
  await sourceFrame.focus()
  await sourceFrame.press('Enter')
  await page.mouse.move(left.x, left.y)
  await page.mouse.down()
  try {
    await page.mouse.move(right.x, right.y, { steps: 12 })
  } finally {
    await page.mouse.up()
  }
  await expect.poll(() => sampleStageColor(page, left)).toBe('blue')
  await expect.poll(() => sampleStageColor(page, right)).toBe('red')
  await expect(page.getByRole('button', { name: 'Crop image', exact: true })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Crop zoom value' })).toHaveValue('1.00')
})

test('Escape cancels an in-progress normal-mode frame swap', async ({ page }) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'red.png', redPng)
  await importImage(page, 'blue.png', bluePng)
  await assignSidebarImage(page, 'red.png', 1)
  await assignSidebarImage(page, 'blue.png', 2)
  const [left, right] = await twoColumnFrameCenters(page)

  const sourceFrame = page.getByRole('button', { name: 'Frame 1, red.png' })
  await sourceFrame.focus()
  await sourceFrame.press('Enter')
  await page.mouse.move(left.x, left.y)
  await page.mouse.down()
  try {
    await page.mouse.move(right.x, right.y, { steps: 12 })
    await page.keyboard.press('Escape')
  } finally {
    await page.mouse.up()
  }
  await expect.poll(() => sampleStageColor(page, left)).toBe('red')
  await expect.poll(() => sampleStageColor(page, right)).toBe('blue')

  await page.mouse.move(left.x, left.y)
  await page.mouse.down()
  await page.mouse.move(right.x, right.y, { steps: 12 })
  await page.mouse.up()
  await expect.poll(() => sampleStageColor(page, left)).toBe('blue')
  await expect.poll(() => sampleStageColor(page, right)).toBe('red')
})

test('dragging a layout splitter re-renders the page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: '4', exact: true }).click()
  await page.locator('[data-layout-id="generated-4-t059320da1280c0bb"]').click()
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

test('double-clicking a divider splits three sibling frames evenly', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: '3', exact: true }).click()
  await page.locator('[data-layout-id="generated-3-t87a383dc470dbd79"]').click()
  const dividers = page.getByRole('slider', { name: /Vertical divider/ })
  await expect(dividers).toHaveCount(2)
  await dividers.first().focus()
  await page.keyboard.press('PageUp')
  await expect(dividers.first()).toHaveAttribute('aria-valuenow', '43')

  const host = page.getByRole('region', { name: 'Collage canvas' })
  const [hitbox] = JSON.parse((await host.getAttribute('data-divider-hitboxes')) ?? '[]') as Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  const point = await canvasDocumentPoint(page, {
    x: hitbox.x + hitbox.width / 2,
    y: hitbox.y + hitbox.height / 2,
  })
  await page.mouse.dblclick(point.x, point.y)
  await expect(dividers.first()).toHaveAttribute('aria-valuenow', '33')
  await expect(dividers.nth(1)).toHaveAttribute('aria-valuenow', '67')
  await expect(page.locator('.toast')).toHaveText('Frames evenly split.')
})

test('Shift-dragging a divider equalizes its nearest pair without changing the third frame', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('tab', { name: '3', exact: true }).click()
  await page.locator('[data-layout-id="generated-3-t87a383dc470dbd79"]').click()
  const sliders = page.getByRole('slider', { name: /Vertical divider/ })
  await sliders.first().focus()
  await page.keyboard.press('PageDown')
  await sliders.nth(1).focus()
  await page.keyboard.press('PageDown')

  const host = page.getByRole('region', { name: 'Collage canvas' })
  const frames = (
    JSON.parse((await host.getAttribute('data-frame-hitboxes')) ?? '[]') as Array<{
      x: number
      y: number
      width: number
      height: number
    }>
  ).sort((left, right) => left.x - right.x)
  const dividers = (
    JSON.parse((await host.getAttribute('data-divider-hitboxes')) ?? '[]') as Array<{
      x: number
      y: number
      width: number
      height: number
    }>
  ).sort((left, right) => left.x - right.x)
  expect(frames).toHaveLength(3)
  expect(dividers).toHaveLength(2)
  const start = await canvasDocumentPoint(page, {
    x: dividers[0].x + dividers[0].width / 2,
    y: dividers[0].y + dividers[0].height / 2,
  })
  const target = await canvasDocumentPoint(page, {
    x: (frames[0].x + frames[1].x + frames[1].width) / 2,
    y: dividers[0].y + dividers[0].height / 2,
  })

  await page.mouse.move(start.x, start.y)
  await page.keyboard.down('Shift')
  await page.mouse.down()
  try {
    await page.mouse.move(target.x, target.y, { steps: 8 })
    await expect(host).toHaveAttribute('data-snap-target', 'equal-size')
  } finally {
    await page.mouse.up()
    await page.keyboard.up('Shift')
  }

  const after = (
    JSON.parse((await host.getAttribute('data-frame-hitboxes')) ?? '[]') as Array<{
      x: number
      width: number
    }>
  ).sort((left, right) => left.x - right.x)
  expect(after[0].width).toBeCloseTo(after[1].width, 6)
  expect(after[2].width).toBeCloseTo(frames[2].width, 6)
})

test('a horizontal divider can be evenly split with the keyboard', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: '2', exact: true }).click()
  await page.locator('[data-layout-id="generated-2-t44b67f0379bd3d39"]').click()
  const divider = page.getByRole('slider', { name: /Horizontal divider/ })
  await divider.focus()
  await page.keyboard.press('PageUp')
  await expect(divider).toHaveAttribute('aria-valuenow', '60')
  await page.keyboard.press('Enter')
  await expect(divider).toHaveAttribute('aria-valuenow', '50')
})

test('divider snapping aligns edges, offers equality, and allows an Alt bypass', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('tab', { name: '4', exact: true }).click()
  await page.locator('[data-layout-id="generated-4-t00c550498a9d89bb"]').click()
  const host = page.getByRole('region', { name: 'Collage canvas' })
  const box = await host.boundingBox()
  expect(box).not.toBeNull()
  const scale = Number(await host.getAttribute('data-fit-scale'))
  const stageX = Number(await host.getAttribute('data-stage-x'))
  const stageY = Number(await host.getAttribute('data-stage-y'))
  const frames = JSON.parse((await host.getAttribute('data-frame-hitboxes')) ?? '[]') as Array<{
    x: number
    y: number
    width: number
    height: number
  }>
  const dividers = JSON.parse((await host.getAttribute('data-divider-hitboxes')) ?? '[]') as Array<{
    axis: 'x' | 'y'
    x: number
    y: number
    width: number
    height: number
  }>
  const point = (x: number, y: number) => ({
    x: box!.x + stageX + x * scale,
    y: box!.y + stageY + y * scale,
  })
  const topLeft = [...frames].sort((left, right) => left.y - right.y || left.x - right.x)[0]
  await page.mouse.click(...Object.values(point(topLeft.x + topLeft.width / 2, topLeft.y + 10)))

  const horizontalDividers = dividers
    .filter((divider) => divider.axis === 'y')
    .sort((left, right) => left.x - right.x)
  expect(horizontalDividers).toHaveLength(2)
  const [leftDivider, rightDivider] = horizontalDividers
  const start = point(leftDivider.x + leftDivider.width / 2, leftDivider.y + leftDivider.height / 2)
  const edgeTarget = point(
    leftDivider.x + leftDivider.width / 2,
    rightDivider.y + rightDivider.height / 2,
  )
  const pageTop = Math.min(...frames.map((frame) => frame.y))
  const pageBottom = Math.max(...frames.map((frame) => frame.y + frame.height))
  const equalTarget = point(leftDivider.x + leftDivider.width / 2, (pageTop + pageBottom) / 2)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  try {
    await page.mouse.move(edgeTarget.x, edgeTarget.y, { steps: 8 })
    await expect(host).toHaveAttribute('data-snap-target', 'edge')

    await page.keyboard.down('Alt')
    await page.mouse.move(edgeTarget.x, edgeTarget.y + 1)
    await expect(host).not.toHaveAttribute('data-snap-target')
    await page.keyboard.up('Alt')

    await page.keyboard.down('Shift')
    await page.mouse.move(equalTarget.x, equalTarget.y, { steps: 8 })
    await expect(host).toHaveAttribute('data-snap-target', 'equal-size')
  } finally {
    await page.mouse.up()
    await page.keyboard.up('Alt')
    await page.keyboard.up('Shift')
  }
})

test('layout dividers have keyboard slider controls', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('tab', { name: '4', exact: true }).click()
  await page.locator('[data-layout-id="generated-4-t059320da1280c0bb"]').click()

  const divider = page.getByRole('slider', { name: /Vertical divider/ }).first()
  const dividerName = await divider.getAttribute('aria-label')
  expect(dividerName).not.toBeNull()
  const before = Number(await divider.getAttribute('aria-valuenow'))
  await divider.focus()
  await page.keyboard.press('ArrowRight')
  await expect(divider).toHaveAttribute('aria-valuenow', String(before + 1))
  await expect(page.locator('.toast')).toHaveText(`${dividerName} set to ${before + 1} percent.`)
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
  const frame = page.getByRole('button', { name: 'Frame 1, empty' })
  await frame.focus()
  await page.keyboard.press('Enter')
  await page.getByText('crop.png', { exact: true }).click()

  await page.getByRole('button', { name: 'Crop image', exact: true }).click()

  const cropZoom = page.getByRole('spinbutton', { name: 'Crop zoom value' })
  await expect(cropZoom).toHaveValue('1.00')
  const host = page.getByRole('region', { name: 'Collage canvas' })
  await expect(host).toHaveAttribute('data-crop-placement', /.+/)
  const placement = JSON.parse((await host.getAttribute('data-crop-placement'))!) as {
    width: number
  }
  const [frameBounds] = JSON.parse((await host.getAttribute('data-frame-hitboxes'))!) as {
    x: number
    y: number
    width: number
  }[]
  const cropEdge = await canvasDocumentPoint(page, {
    x: frameBounds.x + frameBounds.width / 2,
    y: frameBounds.y,
  })
  await page.mouse.move(cropEdge.x, cropEdge.y)
  await page.mouse.down()
  await page.mouse.move(cropEdge.x, cropEdge.y - 24, { steps: 8 })
  await expect
    .poll(async () => {
      const current = JSON.parse((await host.getAttribute('data-crop-placement'))!) as {
        width: number
      }
      return current.width
    })
    .not.toBe(placement.width)
  const previewWidth = JSON.parse((await host.getAttribute('data-crop-placement'))!).width as number
  await page.mouse.up()
  await expect
    .poll(async () => JSON.parse((await host.getAttribute('data-crop-placement'))!).width as number)
    .toBeCloseTo(previewWidth, 3)
  await expect(cropZoom).not.toHaveValue('1.00')
})

test('dragging a crop image previews smoothly and commits on release', async ({ page }) => {
  await page.goto('/')
  await importImage(page, 'pan.png', redPng)
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByRole('button', { name: 'Frame 1, empty' }).focus()
  await page.keyboard.press('Enter')
  await page.getByText('pan.png', { exact: true }).click()
  await page.getByRole('button', { name: 'Crop image', exact: true }).click()

  const host = page.getByRole('region', { name: 'Collage canvas' })
  const [frameBounds] = JSON.parse((await host.getAttribute('data-frame-hitboxes'))!) as {
    x: number
    y: number
    width: number
    height: number
  }[]
  const center = await canvasDocumentPoint(page, {
    x: frameBounds.x + frameBounds.width / 2,
    y: frameBounds.y + frameBounds.height / 2,
  })
  const before = await host.getAttribute('data-crop-placement')
  const verticalPosition = page.getByRole('spinbutton', { name: 'Crop vertical position' })
  await expect(verticalPosition).toHaveValue('50')

  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.move(center.x, center.y + 24, { steps: 8 })
  await expect(host).not.toHaveAttribute('data-crop-placement', before!)
  await expect(verticalPosition).toHaveValue('50')
  await page.mouse.up()
  await expect(verticalPosition).not.toHaveValue('50')
})

test('dragging a crop corner previews zoom and commits on release', async ({ page }) => {
  await page.goto('/')
  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 150
    const context = canvas.getContext('2d')!
    context.fillStyle = '#d84b42'
    context.fillRect(0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await importImage(page, 'wide.png', Buffer.from(pngBase64, 'base64'))
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByRole('button', { name: 'Frame 1, empty' }).focus()
  await page.keyboard.press('Enter')
  await page.getByText('wide.png', { exact: true }).click()
  await page.getByRole('button', { name: 'Crop image', exact: true }).click()

  const host = page.getByRole('region', { name: 'Collage canvas' })
  const placement = JSON.parse((await host.getAttribute('data-crop-placement'))!) as {
    x: number
    y: number
    width: number
    height: number
  }
  const corner = await canvasDocumentPoint(page, {
    x: placement.x + placement.width,
    y: placement.y + placement.height,
  })
  const nearCorner = await canvasDocumentPoint(page, {
    x: placement.x + placement.width - 30,
    y: placement.y + placement.height,
  })
  const side = await canvasDocumentPoint(page, {
    x: placement.x + placement.width - 50,
    y: placement.y + placement.height,
  })
  const stageContainer = page.locator('.konvajs-content').first()
  await page.mouse.move(nearCorner.x, nearCorner.y)
  await expect(stageContainer).toHaveCSS('cursor', 'nwse-resize')
  await page.mouse.move(side.x, side.y)
  await expect(stageContainer).toHaveCSS('cursor', 'ns-resize')
  const cropZoom = page.getByRole('spinbutton', { name: 'Crop zoom value' })
  await page.mouse.move(corner.x, corner.y)
  await page.mouse.down()
  const previewWidths: number[] = []
  for (const offset of [8, 16, 24]) {
    await page.mouse.move(corner.x + offset, corner.y + offset, { steps: 4 })
    await expect
      .poll(
        async () => JSON.parse((await host.getAttribute('data-crop-placement'))!).width as number,
      )
      .toBeGreaterThan(previewWidths.at(-1) ?? placement.width)
    previewWidths.push(JSON.parse((await host.getAttribute('data-crop-placement'))!).width)
  }
  expect(previewWidths[2] - previewWidths[1]).toBeLessThan(
    2 * (previewWidths[1] - previewWidths[0]),
  )
  await expect(cropZoom).toHaveValue('1.00')
  await page.mouse.up()
  await expect
    .poll(async () => JSON.parse((await host.getAttribute('data-crop-placement'))!).width as number)
    .toBeCloseTo(previewWidths[2], 3)
  await expect(cropZoom).not.toHaveValue('1.00')
})

test('crop handles have keyboard-equivalent controls', async ({ page }) => {
  await page.goto('/')
  await importImage(page, 'keyboard-crop.png', redPng)
  await page.getByRole('tab', { name: 'Images' }).click()
  const frame = page.getByRole('button', { name: 'Frame 1, empty' })
  await frame.focus()
  await page.keyboard.press('Enter')
  await page.getByText('keyboard-crop.png', { exact: true }).click()
  await page.getByRole('button', { name: 'Crop image', exact: true }).click()

  const zoomIn = page.getByRole('button', { name: 'Zoom crop image in' })
  await zoomIn.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('spinbutton', { name: 'Crop zoom value' })).toHaveValue('1.05')

  const moveLeft = page.getByRole('button', { name: 'Move crop image left' })
  await moveLeft.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('spinbutton', { name: 'Crop horizontal position' })).toHaveValue('55')
})

test('frame selection announces its current state', async ({ page }) => {
  await page.goto('/')
  await importImage(page, 'announced.png', redPng)
  const frame = page.getByRole('button', { name: 'Frame 1, empty' })
  await frame.focus()
  await page.keyboard.press('Enter')
  await page.getByText('announced.png', { exact: true }).click()
  await page.getByRole('button', { name: 'Frame 1, announced.png' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.toast')).toHaveText('Frame 1 selected, announced.png.')
})

test('shadow opacity increases directly with the displayed percentage', async ({ page }) => {
  await page.goto('/')
  const properties = page.getByRole('complementary', { name: 'Properties' })
  await properties.getByRole('button', { name: 'Advanced shadow' }).click()
  const opacity = properties.getByRole('spinbutton', { name: 'Frame shadow opacity value' })
  await expect(opacity).toHaveValue('50')
  await setNumber(page, 'Frame shadow opacity value', '80')
  await expect(opacity).toHaveValue('80')
})

test('crop changes cancel with Escape and commit as one undo entry', async ({ page }) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'transactional-crop.png', redPng)
  await assignSidebarImage(page, 'transactional-crop.png', 1)
  await page.getByRole('button', { name: 'Crop image', exact: true }).click()

  await setNumber(page, 'Crop zoom value', '1.75')
  await setNumber(page, 'Crop horizontal position', '25')
  await setNumber(page, 'Crop vertical position', '70')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Crop image', exact: true })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Crop zoom value' })).toHaveValue('1.00')
  await expect(page.getByRole('spinbutton', { name: 'Crop horizontal position' })).toHaveValue('50')
  await expect(page.getByRole('spinbutton', { name: 'Crop vertical position' })).toHaveValue('50')

  await page.getByRole('button', { name: 'Crop image', exact: true }).click()
  await setNumber(page, 'Crop zoom value', '1.60')
  await setNumber(page, 'Crop horizontal position', '30')
  const verticalPosition = page.getByRole('spinbutton', { name: 'Crop vertical position' })
  await verticalPosition.fill('65')
  await verticalPosition.press('Enter')
  await expect(page.getByRole('button', { name: 'Crop image', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('spinbutton', { name: 'Crop zoom value' })).toHaveValue('1.00')
  await expect(page.getByRole('spinbutton', { name: 'Crop horizontal position' })).toHaveValue('50')
  await expect(page.getByRole('spinbutton', { name: 'Crop vertical position' })).toHaveValue('50')

  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(page.getByRole('spinbutton', { name: 'Crop zoom value' })).toHaveValue('1.60')
  await expect(page.getByRole('spinbutton', { name: 'Crop horizontal position' })).toHaveValue('30')
  await expect(page.getByRole('spinbutton', { name: 'Crop vertical position' })).toHaveValue('65')

  await page.getByRole('button', { name: 'Crop image', exact: true }).click()
  await setNumber(page, 'Crop zoom value', '1.80')
  const frame = page.getByRole('button', { name: 'Frame 1, transactional-crop.png' })
  await frame.focus()
  await frame.press('Enter')
  await expect(page.getByRole('button', { name: 'Crop image', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('spinbutton', { name: 'Crop zoom value' })).toHaveValue('1.60')
})

test('page appearance slider drags create one undo entry per control', async ({ page }) => {
  await page.goto('/')

  const dragSlider = async (name: string, to: number) => {
    const slider = page.locator(`[data-slot="slider"][aria-label="${name}"]`)
    const thumb = slider.locator('[data-slot="slider-thumb"]')
    const box = await slider.boundingBox()
    const thumbBox = await thumb.boundingBox()
    expect(box).not.toBeNull()
    expect(thumbBox).not.toBeNull()
    // Start on the thumb, rather than an estimated fraction of the track. The
    // thumb is inset from the track ends and that inset changes with CSS size.
    await page.mouse.move(thumbBox!.x + thumbBox!.width / 2, thumbBox!.y + thumbBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width * to, box!.y + box!.height / 2, { steps: 10 })
    await page.mouse.up()
  }

  const outerMarginValue = page.getByRole('spinbutton', { name: 'Outer margin value' })
  const innerSpacingValue = page.getByRole('spinbutton', { name: 'Inner spacing value' })

  await dragSlider('Outer margin', 0.5)
  await expect(outerMarginValue).not.toHaveValue('30')
  const outerMarginAfterDrag = await outerMarginValue.inputValue()

  await dragSlider('Inner spacing', 0.6)
  await expect(innerSpacingValue).not.toHaveValue('30')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(innerSpacingValue).toHaveValue('30')
  await expect(outerMarginValue).toHaveValue(outerMarginAfterDrag)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(outerMarginValue).toHaveValue('30')
})

test('canvas can scroll horizontally and vertically when zoomed in', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Canvas zoom: Fit' }).click()
  await page.getByRole('menuitem', { name: '200%' }).click()
  await expect(page.getByRole('button', { name: 'Canvas zoom: 200%' })).toBeVisible()

  const canvas = page.getByRole('region', { name: 'Collage canvas' })
  await expect
    .poll(
      () =>
        canvas.evaluate(
          (element) =>
            element.scrollWidth > element.clientWidth &&
            element.scrollHeight > element.clientHeight,
        ),
      { timeout: 15_000 },
    )
    .toBe(true)

  await canvas.evaluate(
    (element) =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => {
          element.scrollLeft = element.scrollWidth - element.clientWidth
          element.scrollTop = element.scrollHeight - element.clientHeight
          requestAnimationFrame(() => resolve())
        }),
      ),
  )
  await expect
    .poll(
      () =>
        canvas.evaluate((element) => ({
          horizontal: element.scrollLeft > 0,
          vertical: element.scrollTop > 0,
        })),
      { timeout: 15_000 },
    )
    .toEqual({ horizontal: true, vertical: true })
})
