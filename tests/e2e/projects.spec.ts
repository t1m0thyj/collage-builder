import { test, expect } from './test-fixtures'
import {
  redPng,
  bluePng,
  encodedRaster,
  importImage,
  dropLocalFiles,
  canvasDocumentPoint,
  downloadBytes,
  rasterDimensions,
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

test('magic background color uses the photos on the current page', async ({ page }) => {
  await page.goto('/')
  const suggest = page.getByRole('button', { name: 'Suggest background color from page photos' })
  await expect(suggest).toBeDisabled()
  await chooseTwoColumnLayout(page)
  await importImage(page, 'red.png', redPng)
  await importImage(page, 'blue.png', bluePng)
  await assignSidebarImage(page, 'red.png', 1)
  await assignSidebarImage(page, 'blue.png', 2)
  await expect(suggest).toBeEnabled()
  const picker = page.getByRole('button', { name: 'Choose background color' })
  const pickerBox = await picker.boundingBox()
  const suggestBox = await suggest.boundingBox()
  expect(pickerBox).not.toBeNull()
  expect(suggestBox).not.toBeNull()
  expect(Math.abs(pickerBox!.y - suggestBox!.y)).toBeLessThan(4)
  await suggest.click()

  await expect(picker).not.toContainText('#808080')
  const color = (await picker.textContent())?.trim()
  expect(color).toMatch(/^#[0-9A-F]{6}$/)
  const rgb = [1, 3, 5].map((index) => parseInt(color!.slice(index, index + 2), 16))
  const pixels = await sampleDownloadedPng(page, await exportCurrentPng(page, 400), [
    { x: 0, y: 0 },
  ])
  expect(pixels[0]).toEqual([...rgb, 255])
})

test('frame rotation and flip survive saving and reopening the project', async ({
  page,
  browser,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })
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
  await dropLocalFiles(host, [{ name: 'turn-me.png', buffer: redPng }], center)
  await expect(page.getByRole('button', { name: 'Frame 1, turn-me.png' })).toBeAttached()
  await page.getByRole('button', { name: 'Rotate photo right 90 degrees' }).click()
  await page.getByRole('button', { name: 'Flip photo horizontally' }).click()

  const save = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Choose how to save' })
    .getByRole('button', { name: 'Save with photos' })
    .click()
  const archive = await downloadBytes(await save)
  const savedDocument = JSON.parse(strFromU8(unzipSync(archive)['document.json']))
  expect(Object.values(savedDocument.pages[0].slots)[0]).toMatchObject({
    placement: { rotation: 90, flipHorizontal: true },
  })

  const reopenedContext = await browser.newContext()
  await reopenedContext.addInitScript(() => {
    localStorage.setItem('collage-builder:onboarding-complete:v1', 'true')
  })
  const reopened = await reopenedContext.newPage()
  try {
    await reopened.goto('/')
    await reopened.getByTestId('project-file-input').setInputFiles({
      name: 'rotated.collage',
      mimeType: collageMimeType,
      buffer: archive,
    })
    await expect(reopened.locator('.toast')).toContainText('Project opened')
    const reopenedFrame = reopened.getByRole('button', { name: 'Frame 1, turn-me.png' })
    await reopenedFrame.focus()
    await reopenedFrame.press('Space')
    await expect(
      reopened.getByRole('group', { name: 'Photo orientation' }).locator('output'),
    ).toHaveText('90°')
    await expect(reopened.getByRole('button', { name: 'Flip photo horizontally' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  } finally {
    await reopenedContext.close()
  }
})

for (const [name, mimeType, recoveryFailure] of [
  ['photo.jpg', 'image/jpeg', false],
  ['photo.png', 'image/png', false],
  ['photo.webp', 'image/webp', false],
  ['photo.jpg', 'image/jpeg', true],
] as const) {
  test(`exports a reopened ${mimeType} project when full-size bitmap decode fails${recoveryFailure ? ' and recovery storage fails' : ''}`, async ({
    page,
    browser,
    browserName,
  }) => {
    test.skip(
      browserName === 'webkit' && process.platform === 'win32',
      'Playwright WebKit on Windows exhausts canvas encoders across test contexts',
    )
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    })
    await page.goto('/')
    const bytes = await encodedRaster(page, mimeType)
    await importImage(page, name, bytes, mimeType)
    await page.getByRole('tab', { name: 'Images' }).click()
    await assignSidebarImage(page, name, 1)
    await page.getByRole('button', { name: 'Add page' }).click()
    await assignSidebarImage(page, name, 1)

    const save = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Choose how to save' })
      .getByRole('button', { name: 'Save with photos' })
      .click()
    const archive = await downloadBytes(await save)

    const reopenedContext = await browser.newContext()
    await reopenedContext.addInitScript((recoveryFailure) => {
      localStorage.setItem('collage-builder:onboarding-complete:v1', 'true')
      Object.defineProperty(window, 'OffscreenCanvas', { value: undefined, configurable: true })
      if (recoveryFailure) {
        const put = IDBObjectStore.prototype.put
        IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
          if (this.name === 'projects')
            throw new DOMException(
              'Error preparing Blob/File data to be stored in object store',
              'UnknownError',
            )
          return put.call(this, value, key)
        }
      }
    }, recoveryFailure)
    const reopened = await reopenedContext.newPage()
    try {
      await reopened.goto('/')
      await reopened.getByTestId('project-file-input').setInputFiles({
        name: 'saved-photo.collage',
        mimeType: collageMimeType,
        buffer: archive,
      })
      await expect(reopened.getByRole('button', { name: `Frame 1, ${name}` })).toBeAttached()
      await reopened.evaluate(() => {
        const decode = createImageBitmap
        let fullSizeDecodes = 0
        window.createImageBitmap = ((source: ImageBitmapSource, options?: ImageBitmapOptions) => {
          if (source instanceof Blob && !options && ++fullSizeDecodes === 2)
            return Promise.reject(new DOMException('The source image could not be decoded'))
          return decode(source, options!)
        }) as typeof createImageBitmap
      })

      await reopened.getByRole('button', { name: 'Choose export scope' }).click()
      await reopened.getByRole('menuitem', { name: 'All pages (ZIP)' }).click()
      const dialog = reopened.getByRole('dialog', { name: 'Export pages' })
      await dialog.getByRole('spinbutton', { name: 'Long side (px)' }).fill('400')
      await expect(dialog).toContainText('Current page output: 400 × 300 px')
      const downloadPromise = reopened.waitForEvent('download')
      await dialog.getByRole('button', { name: 'Export', exact: true }).click()
      const entries = Object.values(unzipSync(await downloadBytes(await downloadPromise)))
      expect(entries).toHaveLength(2)
      for (const image of entries) {
        expect(image.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        expect(await rasterDimensions(reopened, image)).toEqual({ width: 400, height: 300 })
      }
      if (recoveryFailure)
        await expect(
          reopened.getByRole('button', { name: /Autosave failed.*Manage local copies/i }),
        ).toBeVisible()
      // Background recovery notifications can replace the shared toast after export.
      await expect(dialog).toBeHidden()
    } finally {
      await reopenedContext.close()
    }
  })
}

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
  await page.getByTestId('project-file-input').setInputFiles({
    name: 'broken.collage',
    mimeType: collageMimeType,
    buffer: Buffer.from(archive),
  })

  await expect(page.locator('.toast')).toContainText(/decode|image|source/i)
  await expect(page.locator('.opening-editor')).toHaveCount(0)
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
    await reopened.getByTestId('project-file-input').setInputFiles({
      name: 'saved-family-album.collage',
      mimeType: collageMimeType,
      buffer: savedArchive,
    })
    await expect(reopened.getByRole('textbox', { name: 'Project title' })).toHaveValue(
      'Saved family album',
    )
    await expect(reopened.getByRole('button', { name: 'Page 2' })).toBeVisible()
    await reopened.getByRole('tab', { name: 'Images' }).click()
    await expect(
      reopened.locator('.sidebar-asset-card').getByText('red.png', { exact: true }),
    ).toBeVisible()
    await expect(
      reopened.locator('.sidebar-asset-card').getByText('blue.png', { exact: true }),
    ).toBeVisible()

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

test('explains the photo folder choice before saving a linked project', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })
  await page.goto('/')
  await importImage(page, 'original.png', redPng)

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const formatDialog = page.getByRole('dialog', { name: 'Choose how to save' })
  await formatDialog.getByRole('button', { name: 'Save linked project' }).click()
  const folderDialog = page.getByRole('dialog', { name: 'Choose the original photo folder' })
  await expect(folderDialog).toContainText('no files are uploaded')
  await folderDialog.getByRole('button', { name: 'Cancel save' }).click()
  await expect(folderDialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Save options' })).toBeDisabled()
})

test('opens a linked project from the .collage.json extension', async ({ page }) => {
  await page.goto('/')
  const linkedDocument = createProject('Linked JSON project')
  await page.getByTestId('project-file-input').setInputFiles({
    name: 'linked-project.collage.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(linkedDocument)),
  })
  await expect(page.getByRole('textbox', { name: 'Project title' })).toHaveValue(
    'Linked JSON project',
  )
  await expect(page.locator('.toast')).toContainText('Project opened')
})

test('shows progress while saving and opening project files', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
    const readText = Blob.prototype.text
    File.prototype.text = function () {
      return new Promise<string>((resolve, reject) => {
        Object.assign(window, {
          resumeProjectRead: () => readText.call(this).then(resolve, reject),
        })
      })
    }
  })
  await page.goto('/')

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const progress = page.locator('.topbar .operation-status')
  await expect(progress).toBeHidden()
  await expect(page.getByRole('dialog', { name: 'Choose how to save' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Dev mode' })).toHaveCount(0)
  await expect(page.locator('.topbar .recovery-status-button')).toBeVisible()
  await page
    .getByRole('dialog', { name: 'Choose how to save' })
    .getByRole('button', { name: 'Cancel save' })
    .click()
  await expect(progress).toBeHidden()
  await expect(page.getByRole('button', { name: 'Dev mode' })).toHaveCount(0)

  await page.setViewportSize({ width: 960, height: 720 })
  const diskProject = createProject('Opening with progress')
  await page.getByTestId('project-file-input').setInputFiles({
    name: 'opening.collage.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(diskProject)),
  })
  await expect(progress).toHaveText('Opening project…')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(960)
  await expect
    .poll(() =>
      page.evaluate(
        () => typeof (window as Window & { resumeProjectRead?: () => void }).resumeProjectRead,
      ),
    )
    .toBe('function')
  await page.evaluate(() =>
    (window as Window & { resumeProjectRead: () => void }).resumeProjectRead(),
  )
  await expect(page.getByRole('textbox', { name: 'Project title' })).toHaveValue(
    'Opening with progress',
  )
  await expect(progress).toBeHidden()
  await expect(page.getByRole('button', { name: 'Dev mode' })).toHaveCount(0)
})

test('shows saving progress only after the native file picker returns', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: () =>
        new Promise<FileSystemFileHandle>((resolve) => {
          Object.assign(window, { resolveProjectPicker: resolve })
        }),
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as Window & { resolveProjectPicker?: () => void }).resolveProjectPicker,
      ),
    )
    .toBe('function')
  const progress = page.locator('.topbar .operation-status')
  await expect(progress).toBeHidden()

  await page.evaluate(() => {
    const picker = window as Window & {
      resolveProjectPicker: (handle: FileSystemFileHandle) => void
      finishProjectWrite?: () => void
      nativeWriteCount?: number
    }
    picker.resolveProjectPicker({
      name: 'Untitled collage.collage',
      createWritable: async () => ({
        write: () => {
          picker.nativeWriteCount = (picker.nativeWriteCount ?? 0) + 1
          if (picker.nativeWriteCount > 1) return Promise.resolve()
          return new Promise<void>((resolve) => {
            picker.finishProjectWrite = resolve
          })
        },
        close: async () => undefined,
      }),
    } as FileSystemFileHandle)
  })
  await expect(progress).toHaveText('Saving project…')
  await expect
    .poll(() =>
      page.evaluate(
        () => typeof (window as Window & { finishProjectWrite?: () => void }).finishProjectWrite,
      ),
    )
    .toBe('function')
  await page.evaluate(() =>
    (window as Window & { finishProjectWrite: () => void }).finishProjectWrite(),
  )
  await expect(progress).toBeHidden()
  await expect(page.locator('.toast')).toContainText('Embedded project saved')
})
