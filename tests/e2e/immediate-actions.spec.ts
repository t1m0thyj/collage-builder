import { test, expect } from './test-fixtures'
import {
  createProject,
  collageMimeType,
  strToU8,
  zipSync,
  setNumber,
  chooseTwoColumnLayout,
  importImage,
  redPng,
  bluePng,
  assignSidebarImage,
} from './test-helpers'

test('invalid page spacing reverts the draft, explains valid values, and keeps undo intact', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await setNumber(page, 'Page width', '256')
  await setNumber(page, 'Page height', '256')
  const margin = page.getByRole('spinbutton', { name: 'Outer margin value', exact: true })
  const gap = page.getByRole('spinbutton', { name: 'Inner spacing value', exact: true })
  await expect(margin).toHaveAttribute('max', '97')
  await expect(gap).toHaveAttribute('max', '97')
  await setNumber(page, 'Outer margin value', '120')
  await expect(margin).toHaveValue('30')
  await expect(margin).toHaveAttribute('aria-invalid', 'true')
  await expect(margin).toHaveAccessibleDescription(/between 0 and 97 px/)
  await expect(page.locator('.toast')).toContainText('Layout gap leaves no space')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Page height', exact: true })).toHaveValue(
    '2880',
  )
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Page height', exact: true })).toHaveValue(
    '256',
  )
  await setNumber(page, 'Outer margin value', '40')
  await expect(margin).toHaveValue('40')
  await expect(margin).not.toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#padding-error')).toHaveCount(0)
  await setNumber(page, 'Inner spacing value', '120')
  await expect(gap).toHaveValue('30')
  await expect(gap).toHaveAccessibleDescription(/between 0 and 87 px/)
  const slider = page.locator('.inspector-slider-root[aria-label="Outer margin"] [role="slider"]')
  await slider.focus()
  await slider.press('End')
  await expect(margin).toHaveValue('97')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(margin).toHaveValue('40')
  expect(errors).toEqual([])
})

test('malformed embedded and linked projects preserve the current project and history', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await setNumber(page, 'Page width', '4000')
  const document = createProject('Invalid grid')
  const id = Object.keys(document.pages[0].slots)[0]
  document.pages[0].layout.root = {
    kind: 'grid',
    columns: 1,
    rows: 1,
    cells: [{ slotId: id, x: 99, y: 99, width: 1, height: 1 }],
  }
  document.pages[0].slots = { [id]: null }
  for (const linked of [false, true]) {
    await page.getByTestId('project-file-input').setInputFiles({
      name: linked ? 'invalid.collage.json' : 'invalid.collage',
      mimeType: linked ? 'application/json' : collageMimeType,
      buffer: linked
        ? Buffer.from(JSON.stringify(document))
        : Buffer.from(
            zipSync({
              mimetype: strToU8(collageMimeType),
              'document.json': strToU8(JSON.stringify(document)),
            }),
          ),
    })
    await expect(page.locator('.toast')).toContainText('Grid cells must stay inside their grid')
    await expect(page.getByRole('spinbutton', { name: 'Page width', exact: true })).toHaveValue(
      '4000',
    )
    await expect(page.getByRole('textbox', { name: 'Project title' })).toHaveValue(
      'Untitled collage',
    )
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('spinbutton', { name: 'Page width', exact: true })).toHaveValue(
    '3840',
  )
  expect(errors).toEqual([])
})

test('Delete and Backspace clear the focused frame and preserve focus and undo', async ({
  page,
}) => {
  await page.goto('/')
  await chooseTwoColumnLayout(page)
  await importImage(page, 'red.png', redPng)
  await importImage(page, 'blue.png', bluePng)
  await assignSidebarImage(page, 'red.png', 1)
  await assignSidebarImage(page, 'blue.png', 2)
  // Focus a frame that is not the selected one: Delete belongs to the focused frame.
  const redFrame = page.getByRole('button', { name: 'Frame 1, red.png', exact: true })
  await redFrame.focus()
  await redFrame.press('Delete')
  const empty = page.getByRole('button', { name: 'Frame 1, empty', exact: true })
  await expect(empty).toBeFocused()
  await expect(page.getByRole('button', { name: 'Frame 2, blue.png', exact: true })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(redFrame).toBeFocused()
  await redFrame.press('Backspace')
  await expect(empty).toBeFocused()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(redFrame).toBeFocused()
  await page.getByRole('button', { name: 'Manage photos' }).click()
  const dialog = page.getByRole('dialog', { name: 'Photo library' })
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Delete')
  // Deliver a frame-owned event too, while a modal is open.
  await redFrame.dispatchEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
  await expect(redFrame).toBeAttached()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(redFrame).toBeVisible()
})

test('opening progress has an accessible name while indeterminate', async ({ page }) => {
  await page.addInitScript(() => {
    const readText = Blob.prototype.text
    File.prototype.text = function () {
      return new Promise<string>((resolve, reject) => {
        Object.assign(window, {
          resumeAccessibleRead: () => readText.call(this).then(resolve, reject),
        })
      })
    }
  })
  await page.goto('/')
  await page.getByTestId('project-file-input').setInputFiles({
    name: 'opening.collage.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(createProject())),
  })
  const dialog = page.getByRole('dialog', { name: 'Opening project' })
  const progress = dialog.getByRole('progressbar')
  await expect(progress).toBeVisible()
  await expect(progress).toHaveAccessibleName(/\S+/)
  await expect(progress).toHaveAttribute('aria-labelledby', 'project-operation-detail')
  await expect(progress).not.toHaveAttribute('aria-valuenow')
  await page.evaluate(() =>
    (window as Window & { resumeAccessibleRead: () => void }).resumeAccessibleRead(),
  )
  await expect(dialog).toBeHidden()
})
