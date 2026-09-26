import { test as base, expect } from '@playwright/test'

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('collage-builder:e2e-onboarding-initialized')) return
      localStorage.setItem('collage-builder:onboarding-complete:v1', 'true')
      sessionStorage.setItem('collage-builder:e2e-onboarding-initialized', 'true')
    })
    await use(page)
  },
})

export { expect }
