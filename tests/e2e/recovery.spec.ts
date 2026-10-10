import { test, expect } from './test-fixtures'
import {
  redPng,
  solidPng,
  importImage,
  chooseTwoColumnLayout,
  assignSidebarImage,
} from './test-helpers'
import { createProject } from '../../src/lib/domain/factories'

test('a maximum-length project title remains recoverable', async ({ page }) => {
  await page.goto('/')
  const title = page.getByRole('textbox', { name: 'Project title' })
  await title.fill('a'.repeat(201))
  await title.blur()
  await expect(title).toHaveValue('a'.repeat(200))
  await expect(page.getByRole('button', { name: /Saved locally/ })).toBeVisible()

  const savedTitles = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('collage-builder')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('projects', 'readonly')
          const query = tx.objectStore('projects').getAll()
          query.onsuccess = () =>
            resolve(query.result.map((project: { title: string }) => project.title))
          query.onerror = () => reject(query.error)
          tx.oncomplete = () => db.close()
        }
      }),
  )
  expect(savedTitles).toContain('a'.repeat(200))
})

test('upgrades version 2 recovery without losing the saved draft', async ({ page }) => {
  const storedDraft = createProject('Existing local draft')
  await page.route('**/__db-setup', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Setup</title>' }),
  )
  await page.goto('/__db-setup')
  await page.evaluate(
    (draft) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('collage-builder', 2)
        request.onupgradeneeded = () => {
          request.result.createObjectStore('projects')
          request.result.createObjectStore('assetBlobs')
        }
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('projects', 'readwrite')
          tx.objectStore('projects').put(draft, draft.projectId)
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    storedDraft,
  )

  await page.goto('/')
  const recoveryDialog = page.getByRole('dialog', { name: 'Pick up where you left off?' })
  await expect(recoveryDialog).toContainText('Existing local draft')
  await recoveryDialog.getByRole('button', { name: 'Continue this collage' }).click()
  const title = page.getByRole('textbox', { name: 'Project title' })
  await expect(title).toHaveValue('Existing local draft')
  await title.fill('Updated migrated draft')
  await title.press('Tab')
  await expect(
    page.getByRole('button', { name: /Saved locally.*Manage local copies/i }),
  ).toBeVisible()
  await page.reload()
  await expect(recoveryDialog).toContainText('Updated migrated draft')
  await expect(
    recoveryDialog.getByRole('img', { name: 'Preview of Updated migrated draft' }),
  ).toBeVisible()
  await recoveryDialog.getByRole('button', { name: 'Start a new collage' }).click()
  const diskProject = createProject('Project from disk')
  await page.getByTestId('project-file-input').setInputFiles({
    name: 'disk-project.collage.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(diskProject)),
  })
  await expect(page.getByRole('textbox', { name: 'Project title' })).toHaveValue(
    'Project from disk',
  )
  await expect(page.locator('.toast')).toContainText('Project opened')
  expect(
    await page.evaluate(
      () =>
        new Promise<{ version: number; stores: string[] }>((resolve, reject) => {
          const request = indexedDB.open('collage-builder')
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            const db = request.result
            resolve({ version: db.version, stores: [...db.objectStoreNames] })
            db.close()
          }
        }),
    ),
  ).toEqual({ version: 3, stores: ['assetBlobs', 'projects', 'recoveryPreviews'] })
})

test('startup recovery asks before restoring an unsaved project', async ({ page }) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'recovery-preview.png', redPng)
  await assignSidebarImage(page, 'recovery-preview.png', 1)
  const title = page.getByRole('textbox', { name: 'Project title' })
  await title.fill('Recovered project')
  await title.press('Tab')
  await expect(
    page.getByRole('button', { name: /Saved locally.*Manage local copies/i }),
  ).toBeVisible()
  await page.reload()
  const recoveryDialog = page.getByRole('dialog', { name: 'Pick up where you left off?' })
  await expect(recoveryDialog).toContainText('Recovered project')
  const preview = recoveryDialog.getByRole('img', { name: 'Preview of Recovered project' })
  await expect(preview).toBeVisible()
  const previewPixel = await preview.evaluate(async (image: HTMLImageElement) => {
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    return [
      ...context.getImageData(
        Math.round(canvas.width * 0.25),
        Math.round(canvas.height * 0.5),
        1,
        1,
      ).data,
    ]
  })
  expect(previewPixel[0]).toBeGreaterThan(180)
  expect(previewPixel[1]).toBeLessThan(100)
  await expect(title).toHaveValue('Untitled collage')
  await recoveryDialog.getByRole('button', { name: 'Continue this collage' }).click()
  await expect(title).toHaveValue('Recovered project')
  await expect(page.locator('.toast')).toContainText('Local recovery restored')
})

test('portrait draft preview fits inside its thumbnail', async ({ page, browserName }) => {
  await page.goto('/')
  if (browserName !== 'webkit') {
    await chooseTwoColumnLayout(page)
    await importImage(page, 'portrait.png', solidPng(210, 35, 25, 64, 96))
    await assignSidebarImage(page, 'portrait.png', 1)
  }
  const width = page.getByRole('spinbutton', { name: 'Page width' })
  const height = page.getByRole('spinbutton', { name: 'Page height' })
  await width.fill('1800')
  await width.press('Tab')
  await height.fill('2400')
  await height.press('Tab')
  const title = page.getByRole('textbox', { name: 'Project title' })
  await title.fill('Portrait draft')
  await title.press('Tab')
  await expect(
    page.getByRole('button', { name: /Saved locally.*Manage local copies/i }),
  ).toBeVisible()

  await page.reload()
  const preview = page.getByRole('img', { name: 'Preview of Portrait draft' })
  await expect(preview).toBeVisible()
  const dimensions = await preview.evaluate(async (image: HTMLImageElement) => {
    await image.decode()
    const imageBox = image.getBoundingClientRect()
    const thumbnailBox = image.parentElement!.getBoundingClientRect()
    return {
      portrait: image.naturalHeight > image.naturalWidth,
      imageWidth: imageBox.width,
      imageHeight: imageBox.height,
      thumbnailWidth: thumbnailBox.width,
      thumbnailHeight: thumbnailBox.height,
    }
  })
  expect(dimensions.portrait).toBe(true)
  expect(dimensions.imageWidth).toBeLessThanOrEqual(dimensions.thumbnailWidth)
  expect(dimensions.imageHeight).toBeLessThanOrEqual(dimensions.thumbnailHeight)
})

test('viewing saved drafts does not create a recovery for an untouched blank collage', async ({
  page,
}) => {
  await page.goto('/')
  const title = page.getByRole('textbox', { name: 'Project title' })
  await title.fill('Keep this recovery')
  await title.press('Tab')
  await expect(
    page.getByRole('button', { name: /Saved locally.*Manage local copies/i }),
  ).toBeVisible()
  await page.reload()

  const recoveryDialog = page.getByRole('dialog', { name: 'Pick up where you left off?' })
  await recoveryDialog.getByRole('button', { name: 'See saved drafts' }).click()
  await expect(title).toHaveValue('Untitled collage')
  const manager = page.getByRole('dialog', { name: 'Local recovery' })
  await expect(manager).toContainText('Keep this recovery')
  await expect(manager).not.toContainText('Untitled collage')
})

test('first visit offers an accessible quick start that can be reopened', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('collage-builder:onboarding-complete:v1'))
  await page.reload()

  const dialog = page.getByRole('dialog', { name: 'Create your first collage' })
  await expect(dialog).toContainText('Your photos stay on this device')
  await dialog.getByRole('button', { name: 'Close quick start' }).click()
  await expect(dialog).toBeHidden()
  await page.reload()
  await expect(dialog).toBeHidden()

  await page.getByRole('button', { name: 'Show quick start' }).click()
  await expect(dialog).toBeVisible()
})

test('local recovery manager reports storage and removes recovery copies', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: async () => ({ usage: 2 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
        persisted: async () => false,
        persist: async () => {
          sessionStorage.setItem('persistent-storage-requested', 'yes')
          return false
        },
      },
    })
  })
  await page.goto('/')
  const title = page.getByRole('textbox', { name: 'Project title' })
  await title.fill('Managed recovery')
  await title.press('Tab')
  const recoveryStatus = page.getByRole('button', {
    name: /Saved locally.*Manage local copies/i,
  })
  await expect(recoveryStatus).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('persistent-storage-requested')))
    .toBe('yes')
  await recoveryStatus.click()

  const dialog = page.getByRole('dialog', { name: 'Local recovery' })
  await expect(dialog).toContainText('2.0 MB of 100 MB used by this site')
  await expect(dialog).toContainText('Managed recovery')
  await expect(dialog.getByRole('img', { name: 'Preview of Managed recovery' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm remove' }).click()
  await expect(dialog).toContainText('No local recovery copies are stored')
})

test('autosave failures remain visible with quota guidance', async ({ page }) => {
  await page.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (this.name === 'projects') throw new DOMException('Storage full', 'QuotaExceededError')
      return originalPut.call(this, value, key)
    }
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: async () => ({ usage: 95 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
        persisted: async () => false,
        persist: async () => false,
      },
    })
  })
  await page.goto('/')
  const title = page.getByRole('textbox', { name: 'Project title' })
  await title.fill('Storage full')
  await title.press('Tab')
  const failedStatus = page.getByRole('button', {
    name: /Autosave failed.*Manage local copies/i,
  })
  await expect(failedStatus).toBeVisible()
  await failedStatus.click()
  await expect(page.getByRole('dialog', { name: 'Local recovery' })).toContainText(
    'Browser storage is full (95.0 MB used of 100.0 MB)',
  )
})

test('same-project tabs pause autosave until the user takes over', async ({ page, context }) => {
  await page.goto('/')
  const title = page.getByRole('textbox', { name: 'Project title' })
  await title.fill('Shared tab recovery')
  await title.press('Tab')
  await expect(
    page.getByRole('button', { name: /Saved locally.*Manage local copies/i }),
  ).toBeVisible()

  const secondPage = await context.newPage()
  await secondPage.goto('/')
  await secondPage
    .getByRole('dialog', { name: 'Pick up where you left off?' })
    .getByRole('button', { name: 'Continue this collage' })
    .click()
  await expect(secondPage.getByRole('textbox', { name: 'Project title' })).toHaveValue(
    'Shared tab recovery',
  )
  const paused = secondPage.getByRole('button', {
    name: /Autosave paused.*Manage local copies/i,
  })
  await expect(paused).toBeVisible()
  await paused.click()
  await secondPage.getByRole('button', { name: 'Use this tab instead' }).click()
  await expect(
    page.getByRole('button', { name: /Autosave paused.*Manage local copies/i }),
  ).toBeVisible()
})

test('different projects can autosave in separate browser tabs', async ({ page, context }) => {
  await page.goto('/')
  const firstTitle = page.getByRole('textbox', { name: 'Project title' })
  await firstTitle.fill('First open project')
  await firstTitle.press('Tab')
  const savedLocally = { name: /Saved locally.*Manage local copies/i }
  await expect(page.getByRole('button', savedLocally)).toBeVisible()

  const secondPage = await context.newPage()
  await secondPage.goto('/')
  await secondPage
    .getByRole('dialog', { name: 'Pick up where you left off?' })
    .getByRole('button', { name: 'Start a new collage' })
    .click()
  const secondTitle = secondPage.getByRole('textbox', { name: 'Project title' })
  await secondTitle.fill('Second open project')
  await secondTitle.press('Tab')
  await expect(secondPage.getByRole('button', savedLocally)).toBeVisible()
  await expect(page.getByRole('button', savedLocally)).toBeVisible()
  await expect(firstTitle).toHaveValue('First open project')
  await expect(secondTitle).toHaveValue('Second open project')
})
