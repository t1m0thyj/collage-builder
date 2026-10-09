import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'
import { createPage, createProject } from '../../src/lib/domain/factories'
import { collageMimeType, realPhotoPath } from './test-helpers'
import { test, expect } from './test-fixtures'

interface PreviewPaint {
  page: string
  durationMs: number
  sinceHoverMs: number
  images: number
}

interface PreviewProfile {
  paints: PreviewPaint[]
  hover?: { page: string; at: number }
}

test('25 pages with 16 photos each: cold and cached tab previews @benchmark', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Use one browser for repeatable timing measurements')
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    const state = window as Window & { previewProfile: PreviewProfile }
    state.previewProfile = { paints: [] }
    document.addEventListener('pointerover', (event) => {
      const tab = (event.target as Element).closest<HTMLButtonElement>('.page-tab')
      if (tab) state.previewProfile.hover = { page: tab.textContent!.trim(), at: performance.now() }
    })
    const contexts = new WeakMap<
      CanvasRenderingContext2D,
      {
        depth: number
        startedAt: number
        images: number
      }
    >()
    const prototype = CanvasRenderingContext2D.prototype
    const save = prototype.save
    const restore = prototype.restore
    const drawImage = prototype.drawImage
    prototype.save = function () {
      if (this.canvas.closest('.page-tab-preview')) {
        const paint = contexts.get(this) ?? { depth: 0, startedAt: performance.now(), images: 0 }
        paint.depth++
        contexts.set(this, paint)
      }
      save.call(this)
    }
    prototype.restore = function () {
      restore.call(this)
      const paint = contexts.get(this)
      if (!paint || --paint.depth !== 0) return
      const now = performance.now()
      const hover = state.previewProfile.hover
      state.previewProfile.paints.push({
        page: hover?.page ?? '',
        durationMs: now - paint.startedAt,
        sinceHoverMs: hover ? now - hover.at : 0,
        images: paint.images,
      })
      contexts.delete(this)
    }
    prototype.drawImage = function (
      image: CanvasImageSource,
      dx: number,
      dy: number,
      ...args: number[]
    ) {
      const paint = contexts.get(this)
      if (paint) paint.images++
      Reflect.apply(drawImage, this, [image, dx, dy, ...args])
    }
  })
  await page.route('**/__preview-photo', (route) =>
    route.fulfill({ contentType: 'image/png', body: readFileSync(realPhotoPath) }),
  )
  await page.goto('/')
  const encoded = await page.evaluate(async () => {
    const bitmap = await createImageBitmap(await (await fetch('/__preview-photo')).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
    bitmap.close()
    return {
      jpeg: canvas.toDataURL('image/jpeg', 0.86).split(',')[1],
      width: canvas.width,
      height: canvas.height,
    }
  })
  const jpeg = Buffer.from(encoded.jpeg, 'base64')
  const project = createProject('Tab preview benchmark')
  const archive: Record<string, Uint8Array> = { mimetype: strToU8(collageMimeType) }
  const assetIds: string[] = []
  for (let index = 0; index < 100; index++) {
    // A valid JPEG comment gives each photo its own hash without changing its pixels.
    const comment = Buffer.from(`preview-photo-${index}`)
    const marker = Buffer.alloc(4)
    marker.writeUInt16BE(0xfffe)
    marker.writeUInt16BE(comment.length + 2, 2)
    const image = Buffer.concat([jpeg.subarray(0, 2), marker, comment, jpeg.subarray(2)])
    const id = randomUUID()
    assetIds.push(id)
    project.assets[id] = {
      id,
      originalName: `photo-${index}.jpg`,
      mediaType: 'image/jpeg',
      byteLength: image.length,
      width: encoded.width,
      height: encoded.height,
      sha256: createHash('sha256').update(image).digest('hex'),
      storage: { kind: 'embedded', archivePath: `assets/${id}` },
    }
    archive[`assets/${id}`] = image
  }
  project.pages = Array.from({ length: 25 }, (_, pageIndex) => {
    const result = createPage(`Page ${pageIndex + 1}`)
    result.slots = {}
    result.layout.root = {
      kind: 'grid',
      columns: 4,
      rows: 4,
      cells: Array.from({ length: 16 }, (_, index) => {
        const slotId = randomUUID()
        result.slots[slotId] = {
          assetId: assetIds[(pageIndex * 16 + index) % assetIds.length],
          placement: { zoom: 1.5, positionX: 0.3, positionY: 0.7, rotation: 90 },
        }
        return { slotId, x: index % 4, y: Math.floor(index / 4), width: 1, height: 1 }
      }),
    }
    return result
  })
  archive['document.json'] = strToU8(JSON.stringify(project))
  await page.getByTestId('project-file-input').setInputFiles({
    name: 'preview-benchmark.collage',
    mimeType: collageMimeType,
    buffer: Buffer.from(zipSync(archive)),
  })
  await expect(page.locator('.toast')).toHaveText('Project opened.', { timeout: 60_000 })
  const sample = async () => {
    await page.evaluate(
      () => ((window as Window & { previewProfile: PreviewProfile }).previewProfile.paints = []),
    )
    for (let index = 25; index > 0; index--) {
      const name = `Page ${index}`
      await page.getByRole('button', { name, exact: true }).hover()
      await expect
        .poll(() =>
          page.evaluate(
            (name) =>
              (window as Window & { previewProfile: PreviewProfile }).previewProfile.paints.some(
                (paint) => paint.page === name && paint.images === 16,
              ),
            name,
          ),
        )
        .toBe(true)
    }
    return page.evaluate(
      () => (window as Window & { previewProfile: PreviewProfile }).previewProfile.paints,
    )
  }
  const summarize = (paints: PreviewPaint[]) => {
    const percentile = (values: number[], fraction: number) => {
      const sorted = [...values].sort((a, b) => a - b)
      return Number(sorted[Math.ceil(sorted.length * fraction) - 1].toFixed(2))
    }
    const complete = paints.filter((paint) => paint.images === 16)
    const firstReady = [...new Set(complete.map((paint) => paint.page))].map((name) =>
      complete.find((paint) => paint.page === name)!,
    )
    return {
      totalPaints: paints.length,
      pages: firstReady.length,
      medianPaintMs: percentile(
        complete.map((paint) => paint.durationMs),
        0.5,
      ),
      p95PaintMs: percentile(
        complete.map((paint) => paint.durationMs),
        0.95,
      ),
      maxPaintMs: Math.max(...complete.map((paint) => paint.durationMs)),
      medianReadyMs: percentile(
        firstReady.map((paint) => paint.sinceHoverMs),
        0.5,
      ),
      p95ReadyMs: percentile(
        firstReady.map((paint) => paint.sinceHoverMs),
        0.95,
      ),
    }
  }
  const cold = summarize(await sample())
  const cached = summarize(await sample())
  console.info(
    JSON.stringify({
      benchmark: 'Tab previews: 25 pages, 16 frames per page, 100 distinct 1536 × 1024 photos',
      cold,
      cached,
    }),
  )
  expect(cold.pages).toBe(25)
  expect(cached.pages).toBe(25)
  expect(cached.p95PaintMs).toBeLessThan(50)
})
