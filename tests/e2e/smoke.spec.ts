import { expect, test } from '@playwright/test'

test('renders the editor shell and opens image manager', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('textbox', { name: 'Project title' })).toHaveValue('Untitled collage')
  await page.getByRole('tab', { name: 'Images' }).click()
  await page.getByRole('button', { name: 'Open image manager' }).click()
  await expect(page.getByRole('dialog', { name: 'Image Manager' })).toBeVisible()
})
