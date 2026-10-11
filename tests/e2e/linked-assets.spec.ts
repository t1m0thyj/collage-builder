import { mkdir, writeFile } from 'node:fs/promises'
import { test, expect } from './test-fixtures'
import { createHash, createProject, downloadBytes, redPng } from './test-helpers'

test('loads renamed linked photos by hash and saves their current filenames and paths', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })
  const document = createProject('Renamed linked photos')
  const assetId = '11111111-1111-4111-8111-111111111111'
  document.assets[assetId] = {
    id: assetId,
    originalName: 'old.png',
    mediaType: 'image/png',
    byteLength: redPng.length,
    width: 96,
    height: 64,
    sha256: createHash('sha256').update(redPng).digest('hex'),
    storage: { kind: 'linked', relativePath: 'old.png', displayHint: 'old.png' },
  }
  const folder = testInfo.outputPath('photos')
  await mkdir(testInfo.outputPath('photos', 'nested'), { recursive: true })
  await writeFile(testInfo.outputPath('photos', 'nested', 'renamed.png'), redPng)
  await page.goto('/')
  await page.getByTestId('project-file-input').setInputFiles({
    name: 'photos.collage.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  })
  const chooser = page.waitForEvent('filechooser')
  await page
    .getByRole('dialog', { name: 'Locate linked images' })
    .getByRole('button', { name: 'Choose folder…' })
    .click()
  await (await chooser).setFiles(folder)
  await expect(page.getByRole('dialog', { name: 'Locate linked images' })).toBeHidden()
  await page.getByRole('tab', { name: 'Images', exact: true }).click()
  await expect(
    page.locator('.sidebar-asset-card').getByText('renamed.png', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('.toast')).toContainText('Linked images loaded.')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Save linked project', exact: true }).click()
  const saveFolderChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choose photo folder…', exact: true }).click()
  await (await saveFolderChooser).setFiles(folder)
  const saved = JSON.parse((await downloadBytes(await download)).toString('utf8'))
  expect(saved.assets[assetId]).toMatchObject({
    originalName: 'renamed.png',
    sha256: document.assets[assetId].sha256,
    storage: {
      kind: 'linked',
      relativePath: 'nested/renamed.png',
      displayHint: 'nested/renamed.png',
    },
  })
})
