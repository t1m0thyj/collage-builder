import { expect, test } from '@playwright/test'
import { cpus, platform, release, totalmem } from 'node:os'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
  await page.getByRole('button', { name: 'Frame 1, empty' }).focus()
  await page.keyboard.press('Enter')
  await page.getByText('benchmark-001.png', { exact: true }).click()
  for (let pageNumber = 2; pageNumber <= 25; pageNumber += 1) {
    await page.getByRole('button', { name: 'Page actions' }).click()
    await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  }
  await expect(page.getByRole('button', { name: 'Choose page' })).toBeVisible()
  const pagesCreatedAt = performance.now()

  await page.getByRole('button', { name: 'Choose export scope' }).click()
  await page.getByRole('menuitem', { name: 'All pages (ZIP)' }).click()
  const exportDialog = page.getByRole('dialog', { name: 'Export pages' })
  await exportDialog.getByRole('spinbutton', { name: 'Width (px)' }).fill('1920')
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
    }
  })
  await download.delete()

  console.info(
    JSON.stringify({
      benchmark: '100 representative images / 25 pages',
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
    }),
  )
})
