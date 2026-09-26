import { test, expect } from './test-fixtures'
import {
  redPng,
  bluePng,
  importImage,
  downloadBytes,
  comparableProjectDocument,
  sampleDownloadedPng,
  exportCurrentPng,
  chooseTwoColumnLayout,
  twoColumnFrameCenters,
  assignSidebarImage,
  sampleStageColor,
  setNumber,
  createHash,
  strFromU8,
  strToU8,
  unzipSync,
  zipSync,
  createProject,
  collageMimeType,
} from './test-helpers'

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

test('a failed project open keeps the current document and decoded assets intact', async ({
  page,
}) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  const title = page.getByRole('textbox', { name: 'Project title' })
  await title.fill('Keep current project')
  await title.press('Tab')
  await importImage(page, 'current.png', redPng)
  await assignSidebarImage(page, 'current.png', 1)
  const [left] = await twoColumnFrameCenters(page)
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

test('a complete multi-page project survives embedded save, fresh-context reopen, and export', async ({
  page,
  browser,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit' && process.platform === 'win32',
    'Playwright WebKit on Windows exhausts canvas encoders across test contexts',
  )
  test.setTimeout(60_000)
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })
  await page.goto('/')
  const title = page.getByRole('textbox', { name: 'Project title' })
  await title.fill('Saved family album')
  await title.press('Tab')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'red.png', redPng)
  await importImage(page, 'blue.png', bluePng)
  await assignSidebarImage(page, 'red.png', 1)
  await assignSidebarImage(page, 'blue.png', 2)
  await page.getByRole('button', { name: 'Crop image', exact: true }).click()
  await setNumber(page, 'Crop zoom value', '1.60')
  await setNumber(page, 'Crop horizontal position', '30')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Choose background color' }).click()
  await page.getByRole('button', { name: 'Set background to #2507B3' }).click()

  const firstPagePixels = await sampleDownloadedPng(page, await exportCurrentPng(page, 400), [
    { x: 0, y: 0 },
    { x: 100, y: 150 },
    { x: 300, y: 150 },
  ])

  await page.getByRole('button', { name: 'Add page' }).click()
  await chooseTwoColumnLayout(page)
  await assignSidebarImage(page, 'blue.png', 1)
  await assignSidebarImage(page, 'red.png', 2)
  await page.getByRole('button', { name: 'Choose background color' }).click()
  await page.getByRole('button', { name: 'Set background to #67BA24' }).click()
  const secondPagePixels = await sampleDownloadedPng(page, await exportCurrentPng(page, 400), [
    { x: 0, y: 0 },
    { x: 100, y: 150 },
    { x: 300, y: 150 },
  ])

  const firstSave = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Choose how to save' })
    .getByRole('button', { name: 'Save with photos' })
    .click()
  const savedArchive = await downloadBytes(await firstSave)
  const savedDocument = JSON.parse(strFromU8(unzipSync(savedArchive)['document.json']))
  expect(savedDocument).toMatchObject({
    title: 'Saved family album',
    pages: [
      {
        layout: { presetId: 'generated-2-ta31c7d0995c75a09' },
        style: { backgroundColor: '#2507B3FF' },
      },
      {
        layout: { presetId: 'generated-2-ta31c7d0995c75a09' },
        style: { backgroundColor: '#67BA24FF' },
      },
    ],
  })
  expect(Object.keys(savedDocument.assets)).toHaveLength(2)

  const reopenedContext = await browser.newContext()
  await reopenedContext.addInitScript(() => {
    localStorage.setItem('collage-builder:onboarding-complete:v1', 'true')
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })
  const reopened = await reopenedContext.newPage()
  try {
    await reopened.goto('/')
    await reopened.locator('input[type="file"][accept*=".collage.json"]').setInputFiles({
      name: 'saved-family-album.collage',
      mimeType: collageMimeType,
      buffer: savedArchive,
    })
    await expect(reopened.getByRole('textbox', { name: 'Project title' })).toHaveValue(
      'Saved family album',
    )
    await expect(reopened.getByRole('button', { name: 'Page 2' })).toBeVisible()
    await reopened.getByRole('tab', { name: 'Images' }).click()
    await expect(reopened.getByText('red.png', { exact: true })).toBeVisible()
    await expect(reopened.getByText('blue.png', { exact: true })).toBeVisible()

    await reopened.getByRole('button', { name: 'Page 1' }).click()
    expect(
      await sampleDownloadedPng(reopened, await exportCurrentPng(reopened, 400), [
        { x: 0, y: 0 },
        { x: 100, y: 150 },
        { x: 300, y: 150 },
      ]),
    ).toEqual(firstPagePixels)

    await reopened.getByRole('button', { name: 'Page 2' }).click()
    expect(
      await sampleDownloadedPng(reopened, await exportCurrentPng(reopened, 400), [
        { x: 0, y: 0 },
        { x: 100, y: 150 },
        { x: 300, y: 150 },
      ]),
    ).toEqual(secondPagePixels)

    const resaved = reopened.waitForEvent('download')
    await reopened.getByRole('button', { name: 'Save', exact: true }).click()
    await reopened
      .getByRole('dialog', { name: 'Choose how to save' })
      .getByRole('button', { name: 'Save with photos' })
      .click()
    const reopenedDocument = JSON.parse(
      strFromU8(unzipSync(await downloadBytes(await resaved))['document.json']),
    )
    expect(comparableProjectDocument(reopenedDocument)).toEqual(
      comparableProjectDocument(savedDocument),
    )
  } finally {
    await reopenedContext.close()
  }
})

test('Save retains the current format while Save As offers both project extensions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })
  await page.goto('/')

  const saveOptions = page.getByRole('button', { name: 'Save options' })
  await expect(saveOptions).toBeDisabled()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const formatDialog = page.getByRole('dialog', { name: 'Choose how to save' })
  await expect(formatDialog).toContainText('Save project with photos')
  await expect(formatDialog).toContainText('Save project linking to original files')
  const embeddedDownload = page.waitForEvent('download')
  await formatDialog.getByRole('button', { name: 'Save with photos' }).click()
  expect((await embeddedDownload).suggestedFilename()).toBe('Untitled collage.collage')
  await expect(saveOptions).toBeEnabled()

  const repeatedSave = page.waitForEvent('download')
  await page.keyboard.press('Control+s')
  expect((await repeatedSave).suggestedFilename()).toBe('Untitled collage.collage')
  await expect(formatDialog).toBeHidden()

  await saveOptions.click()
  await page.getByRole('menuitem', { name: 'Save As…' }).click()
  await expect(formatDialog).toBeVisible()
  await formatDialog.getByRole('button', { name: 'Cancel', exact: true }).click()

  await page.keyboard.press('Control+Shift+s')
  await expect(formatDialog).toBeVisible()
  const linkedDownload = page.waitForEvent('download')
  await formatDialog.getByRole('button', { name: 'Save linked project' }).click()
  expect((await linkedDownload).suggestedFilename()).toBe('Untitled collage.collage.json')

  await page.getByRole('textbox', { name: 'Project title' }).focus()
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Save before continuing?' })).toHaveCount(0)
  await expect(saveOptions).toBeDisabled()
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
