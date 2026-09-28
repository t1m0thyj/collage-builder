import { expect, test } from '@playwright/test'
import { cpus, platform, release, totalmem } from 'node:os'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPage, createProject } from '../../src/lib/domain/factories'

test.describe('recovery opening benchmark', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'The large IndexedDB Blob fixture is Chromium-specific',
  )
  test('12-image recovery open @benchmark', async ({ page }) => {
    test.setTimeout(180_000)
    const fixture = readFileSync(resolve('tests/fixtures/real-photo-still-life.png'))
    const document = createProject('Recovery benchmark')
    document.pages = Array.from({ length: 4 }, (_, index) => createPage(`Page ${index + 1}`))
    document.updatedAt = new Date(Date.now() + 1000).toISOString()
    await page.route('**/__db-setup', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Setup</title>' }),
    )
    await page.route('**/benchmark-recovery-photo', (route) =>
      route.fulfill({ contentType: 'image/png', body: fixture }),
    )
    await page.goto('/__db-setup')
    await page.evaluate(async (savedDocument) => {
      const source = await createImageBitmap(
        await (await fetch('/benchmark-recovery-photo')).blob(),
      )
      const canvas = globalThis.document.createElement('canvas')
      canvas.width = 4000
      canvas.height = 3000
      const context = canvas.getContext('2d')!
      const blobs = new Map<string, Blob>()
      for (let index = 0; index < 12; index += 1) {
        context.drawImage(source, 0, 0, canvas.width, canvas.height)
        context.fillStyle = `rgba(${index * 17}, 30, 180, 0.06)`
        context.fillRect(0, 0, canvas.width, canvas.height)
        const blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((result) => resolve(result!), 'image/jpeg', 0.88),
        )
        const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
        const hash = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('')
        const id = crypto.randomUUID()
        savedDocument.assets[id] = {
          id,
          originalName: `benchmark-${index}.jpg`,
          mediaType: 'image/jpeg',
          byteLength: blob.size,
          width: canvas.width,
          height: canvas.height,
          sha256: hash,
          storage: { kind: 'embedded', archivePath: `assets/${id}` },
        }
        const page = savedDocument.pages[Math.floor(index / 3)]
        const slotId = Object.keys(page.slots)[index % 3]
        page.slots[slotId] = {
          assetId: id,
          placement: { zoom: 1, positionX: 0.5, positionY: 0.5 },
        }
        blobs.set(id, blob)
      }
      source.close()
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('collage-builder', 2)
        request.onupgradeneeded = () => {
          request.result.createObjectStore('projects')
          request.result.createObjectStore('assetBlobs')
        }
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction(['projects', 'assetBlobs'], 'readwrite')
          tx.objectStore('projects').put(savedDocument, savedDocument.projectId)
          for (const asset of Object.values(savedDocument.assets))
            tx.objectStore('assetBlobs').put(
              blobs.get(asset.id)!,
              `${savedDocument.projectId}:${asset.id}:${asset.sha256}`,
            )
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      })
    }, document)

    const startupAt = performance.now()
    await page.goto('/')
    const dialog = page.getByRole('dialog', { name: 'Pick up where you left off?' })
    await expect(dialog).toBeVisible({ timeout: 120_000 })
    const readyAt = performance.now()
    await page.evaluate(() => {
      const state = window as Window & { openingPageSnapshots?: string[][] }
      state.openingPageSnapshots = []
      new MutationObserver(() => {
        const names = [...document.querySelectorAll('.opening-page-tab')].map(
          (tab) => tab.textContent?.trim() ?? '',
        )
        if (names.length) state.openingPageSnapshots?.push(names)
      }).observe(document.body, { childList: true, subtree: true })
    })
    await dialog.getByRole('button', { name: 'Continue this collage' }).click()
    const progress = page.locator('.topbar .operation-status')
    await expect(progress).toBeVisible()
    await expect(page.locator('.opening-pagebar')).toBeVisible()
    await expect(progress).toContainText(/Opening pages \d\/4/)
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('textbox', { name: 'Project title' })).toHaveValue(
      'Recovery benchmark',
      { timeout: 120_000 },
    )
    const openedAt = performance.now()
    await expect(progress).toBeHidden()
    expect(
      await page.evaluate(() =>
        (window as Window & { openingPageSnapshots?: string[][] }).openingPageSnapshots?.some(
          (names) => names.length > 0 && names.length < 4,
        ),
      ),
    ).toBe(true)
    await expect(page.locator('.page-tab-viewport .page-tab')).toHaveCount(4)
    console.log(
      `Recovery benchmark: startup ${(readyAt - startupAt).toFixed(0)} ms, open ${(openedAt - readyAt).toFixed(0)} ms`,
    )
  })
})

function crc32(buffer: Buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Give each fixture copy a distinct, ignored ancillary PNG chunk for import deduplication. */
function fixtureVariant(fixture: Buffer, index: number): Buffer {
  const data = Buffer.from(`benchmark-${index}`)
  const type = Buffer.from('cbEn')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])))
  const chunk = Buffer.concat([length, type, data, checksum])
  return Buffer.concat([fixture.subarray(0, -12), chunk, fixture.subarray(-12)])
}

test('100 images and 25 pages @benchmark', async ({ page, browser, browserName }, testInfo) => {
  test.setTimeout(300_000)
  await page.addInitScript(() =>
    localStorage.setItem('collage-builder:onboarding-complete:v1', 'true'),
  )
  await page.addInitScript(() => {
    const target = globalThis as typeof globalThis & { __collageLongTasks: number[] }
    target.__collageLongTasks = []
    if (typeof PerformanceObserver === 'undefined') return
    try {
      new PerformanceObserver((list) => {
        target.__collageLongTasks.push(...list.getEntries().map((entry) => entry.duration))
      }).observe({ type: 'longtask', buffered: true })
    } catch {
      // The Long Tasks API is optional; export User Timing remains available.
    }
  })
  await page.goto('/')
  const fixture = readFileSync(resolve('tests/fixtures/real-photo-still-life.png'))
  const inputDirectory = testInfo.outputPath('benchmark-inputs')
  mkdirSync(inputDirectory, { recursive: true })
  const images = Array.from({ length: 100 }, (_, index) => {
    const name = `benchmark-${String(index + 1).padStart(3, '0')}.png`
    const path = resolve(inputDirectory, name)
    writeFileSync(path, fixtureVariant(fixture, index))
    return path
  })
  const startedAt = performance.now()
  await page
    .locator(
      'input[type="file"][accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"]',
    )
    .first()
    .setInputFiles(images)
  await page.getByRole('tab', { name: 'Images' }).click()
  await expect(page.getByText('benchmark-100.png', { exact: true })).toBeVisible({
    timeout: 120_000,
  })
  const importedAt = performance.now()
  let imageIndex = 1
  for (let pageIndex = 0; pageIndex < 25; pageIndex += 1) {
    const frameCount = pageIndex === 0 ? 3 : 2
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      await page.getByRole('button', { name: `Frame ${frameIndex + 1}, empty` }).focus()
      await page.keyboard.press('Enter')
      await page
        .getByText(`benchmark-${String(imageIndex).padStart(3, '0')}.png`, { exact: true })
        .click()
      imageIndex += 1
    }
    if (pageIndex < 24) await page.getByRole('button', { name: 'Add page' }).click()
  }
  await expect(page.getByRole('button', { name: 'Scroll tabs left' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Page 25', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  const pagesCreatedAt = performance.now()

  await page.getByRole('button', { name: 'Choose export scope' }).click()
  await page.getByRole('menuitem', { name: 'All pages (ZIP)' }).click()
  const exportDialog = page.getByRole('dialog', { name: 'Export pages' })
  await exportDialog.getByRole('spinbutton', { name: 'Long side (px)' }).fill('1920')
  const downloadPromise = page.waitForEvent('download')
  await exportDialog.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await downloadPromise
  const exportedAt = performance.now()
  const renderProfile = await page.evaluate(() => {
    const renderMeasurements = performance
      .getEntriesByName('collage-export-render')
      .map((entry) => {
        const detail = (entry as PerformanceMeasure).detail as {
          durationMs: number
          pixelCount: number
          renderer: string
          decodedSourceBytes: number
          peakAdditionalDecodedBytes: number
        }
        return detail
      })
    const longTasks = (globalThis as typeof globalThis & { __collageLongTasks: number[] })
      .__collageLongTasks
    const memory = performance as Performance & {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number }
    }
    return {
      renderMeasurements,
      longTaskCount: longTasks.length,
      maxLongTaskMs: Math.round(Math.max(0, ...longTasks)),
      usedJSHeapBytes: memory.memory?.usedJSHeapSize,
      jsHeapLimitBytes: memory.memory?.jsHeapSizeLimit,
      activePageDecodedImageBytes: Number(
        document.querySelector<HTMLElement>('main')?.dataset.decodedImageBytes ?? 0,
      ),
    }
  })
  await download.delete()

  console.info(
    JSON.stringify({
      benchmark: '100 representative images / 25 fully populated pages with distinct photos',
      browser: browserName,
      browserVersion: browser.version(),
      device: {
        platform: platform(),
        release: release(),
        cpu: cpus()[0]?.model,
        logicalCpuCount: cpus().length,
        totalMemoryBytes: totalmem(),
      },
      importMs: Math.round(importedAt - startedAt),
      pageCreationMs: Math.round(pagesCreatedAt - importedAt),
      exportMs: Math.round(exportedAt - pagesCreatedAt),
      totalMs: Math.round(exportedAt - startedAt),
      exportPageCount: renderProfile.renderMeasurements.length,
      totalRenderMs: Math.round(
        renderProfile.renderMeasurements.reduce((total, item) => total + item.durationMs, 0),
      ),
      maxRenderMs: Math.round(
        Math.max(0, ...renderProfile.renderMeasurements.map((item) => item.durationMs)),
      ),
      renderers: [...new Set(renderProfile.renderMeasurements.map((item) => item.renderer))],
      longTaskCount: renderProfile.longTaskCount,
      maxLongTaskMs: renderProfile.maxLongTaskMs,
      usedJSHeapBytes: renderProfile.usedJSHeapBytes,
      jsHeapLimitBytes: renderProfile.jsHeapLimitBytes,
      activePageDecodedImageBytes: renderProfile.activePageDecodedImageBytes,
      maxPageDecodedSourceBytes: Math.max(
        0,
        ...renderProfile.renderMeasurements.map((item) => item.decodedSourceBytes),
      ),
      maxWorkerAdditionalDecodedBytes: Math.max(
        0,
        ...renderProfile.renderMeasurements.map((item) => item.peakAdditionalDecodedBytes),
      ),
    }),
  )
})
