import { test, expect } from './test-fixtures'
import {
  createProject,
  collageMimeType,
  zipSync,
  strToU8,
  setNumber,
  chooseTwoColumnLayout,
  importImage,
  redPng,
  assignSidebarImage,
  canvasDocumentPoint,
  sampleStageColor,
  exportCurrentPng,
  sampleDownloadedPng,
} from './test-helpers'
import { maxEditorCanvasDimension, maxEditorCanvasPixels } from '../../src/lib/render/editorSurface'

test('rejected page edits and imports restore inputs and preserve the project and undo', async ({
  page,
}) => {
  await page.goto('/')
  const title = page.getByRole('textbox', { name: 'Project title' })
  await title.fill('Keep my collage')
  await title.press('Tab')
  const width = page.getByRole('spinbutton', { name: 'Page width', exact: true })
  const height = page.getByRole('spinbutton', { name: 'Page height', exact: true })
  await setNumber(page, 'Page width', '4000')
  await setNumber(page, 'Page width', '20000')
  await expect(page.locator('.toast')).toContainText('16,384 px or smaller')
  await expect(width).toHaveValue('4000')
  await expect(height).toHaveValue('2880')

  await page.getByRole('button', { name: 'Lock page aspect ratio' }).click()
  await setNumber(page, 'Page width', '10000')
  await expect(page.locator('.toast')).toContainText('64 megapixels')
  await expect(width).toHaveValue('4000')
  await expect(height).toHaveValue('2880')

  for (const dimensions of [
    { width: 20000, height: 100 },
    { width: 10000, height: 10000 },
  ]) {
    const document = createProject('Oversized incoming project')
    Object.assign(document.pages[0], dimensions)
    const archive = zipSync({
      mimetype: strToU8(collageMimeType),
      'document.json': strToU8(JSON.stringify(document)),
    })
    await page.getByTestId('project-file-input').setInputFiles({
      name: 'oversized.collage',
      mimeType: collageMimeType,
      buffer: Buffer.from(archive),
    })
    await expect(page.locator('.toast')).toContainText(/16,384 px or smaller|64 megapixels/)
    await expect(title).toHaveValue('Keep my collage')
    await expect(width).toHaveValue('4000')
    await expect(page.locator('.opening-editor')).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(width).toHaveValue('3840')
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled()
})

for (const pixelRatio of [1, 2, 3]) {
  test.describe(`rendering budget at DPR ${pixelRatio}`, () => {
    test.use({ deviceScaleFactor: pixelRatio })
    test('caps backing canvases while keeping scrolled selection and export usable', async ({
      page,
    }) => {
      await page.addInitScript((maxPixels) => {
        const violations: Array<{ width: number; height: number }> = []
        Object.assign(window, { oversizedCanvasAllocations: violations })
        for (const dimension of ['width', 'height']) {
          const descriptor = Object.getOwnPropertyDescriptor(
            HTMLCanvasElement.prototype,
            dimension,
          )!
          Object.defineProperty(HTMLCanvasElement.prototype, dimension, {
            ...descriptor,
            set(this: HTMLCanvasElement, value: number) {
              descriptor.set!.call(this, value)
              if (this.width * this.height > maxPixels)
                violations.push({ width: this.width, height: this.height })
            },
          })
        }
      }, maxEditorCanvasPixels)
      await page.goto('/')
      await chooseTwoColumnLayout(page)
      await setNumber(page, 'Page width', '8000')
      await setNumber(page, 'Page height', '8000')
      await expect(page.getByRole('spinbutton', { name: 'Page height', exact: true })).toHaveValue(
        '8000',
      )
      await importImage(page, 'bounded.png', redPng)
      await assignSidebarImage(page, 'bounded.png', 1)
      await page.getByRole('button', { name: /Canvas zoom:/ }).click()
      await page.getByRole('menuitem', { name: '200%', exact: true }).click()
      const host = page.getByRole('region', { name: 'Collage canvas' })
      await expect(host.getByRole('status')).toContainText('Canvas zoom limited')
      const canvases = await host.locator('canvas').evaluateAll((canvases) =>
        canvases.map((canvas) => ({
          width: canvas.width,
          height: canvas.height,
        })),
      )
      expect(canvases.length).toBeGreaterThan(0)
      for (const canvas of canvases) {
        expect(canvas.width * canvas.height).toBeLessThanOrEqual(maxEditorCanvasPixels)
        expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(maxEditorCanvasDimension)
      }
      expect(Number(await host.getAttribute('data-fit-scale'))).toBeLessThan(2)
      const [frame] = JSON.parse((await host.getAttribute('data-frame-hitboxes'))!) as Array<{
        x: number
        y: number
        width: number
        height: number
      }>
      await host.evaluate((element, frame) => {
        const scale = Number(element.getAttribute('data-fit-scale'))
        element.scrollLeft =
          Number(element.getAttribute('data-stage-x')) +
          (frame.x + frame.width / 2) * scale -
          element.clientWidth / 2
        element.scrollTop =
          Number(element.getAttribute('data-stage-y')) +
          (frame.y + frame.height / 2) * scale -
          element.clientHeight / 2
      }, frame)
      const center = await canvasDocumentPoint(page, {
        x: frame.x + frame.width / 2,
        y: frame.y + frame.height / 2,
      })
      await expect.poll(() => sampleStageColor(page, center)).toBe('red')
      await page.mouse.click(center.x, center.y)
      await expect(page.getByRole('button', { name: 'Frame 1, bounded.png' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      const [pixel] = await sampleDownloadedPng(page, await exportCurrentPng(page, 400), [
        { x: 100, y: 200 },
      ])
      expect(pixel.slice(0, 3)).toEqual([238, 45, 54])

      // A tall-to-wide transition must stay bounded at every canvas setter, too.
      const document = createProject('Orientation budget')
      const tall = createProject().pages[0]
      Object.assign(tall, { name: 'Tall', width: 100, height: 16000 })
      Object.assign(document.pages[0], { name: 'Wide', width: 16000, height: 100 })
      for (const page of [document.pages[0], tall]) {
        page.style.padding = 0
        page.style.gap = 0
      }
      document.pages.push(tall)
      await page.getByTestId('project-file-input').setInputFiles({
        name: 'orientation.collage',
        mimeType: collageMimeType,
        buffer: Buffer.from(
          zipSync({
            mimetype: strToU8(collageMimeType),
            'document.json': strToU8(JSON.stringify(document)),
          }),
        ),
      })
      await expect(page.locator('.toast')).toContainText('Project opened')
      await page.getByRole('button', { name: /Canvas zoom:/ }).click()
      await page.getByRole('menuitem', { name: '200%', exact: true }).click()
      await page.getByRole('button', { name: 'Tall', exact: true }).click()
      await expect(page.getByRole('spinbutton', { name: 'Page width', exact: true })).toHaveValue(
        '100',
      )
      await page.getByRole('button', { name: 'Wide', exact: true }).click()
      await expect(page.getByRole('spinbutton', { name: 'Page width', exact: true })).toHaveValue(
        '16000',
      )
      expect(
        await page.evaluate(
          () =>
            (
              window as Window & {
                oversizedCanvasAllocations: Array<{ width: number; height: number }>
              }
            ).oversizedCanvasAllocations,
        ),
      ).toEqual([])
    })
  })
}
