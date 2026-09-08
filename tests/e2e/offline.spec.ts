import { expect, test } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { relative, resolve, sep } from 'node:path'

function distributionFiles(directory: string): string[] {
  const files: string[] = []
  const visit = (currentDirectory: string) => {
    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      const path = resolve(currentDirectory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile() && entry.name !== 'service-worker.js') {
        files.push(relative(directory, path).split(sep).join('/'))
      }
    }
  }
  visit(directory)
  return files.sort()
}

const distributionDirectory = resolve(process.cwd(), 'dist')
let appUrl = ''
let server: Server
let failServiceWorker = false
let workerRevisionSuffix = ''

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    const relativePath = decodeURIComponent(pathname.slice('/offline-test/'.length)) || 'index.html'
    const path = resolve(distributionDirectory, relativePath)
    if (!path.startsWith(`${distributionDirectory}${sep}`)) {
      response.writeHead(403).end()
      return
    }

    try {
      if (relativePath === 'service-worker.js' && failServiceWorker) {
        response.writeHead(503).end('service worker unavailable')
        return
      }
      const contentTypes: Record<string, string> = {
        '.css': 'text/css',
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.svg': 'image/svg+xml',
      }
      const extension = relativePath.slice(relativePath.lastIndexOf('.'))
      response.writeHead(200, {
        'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      })
      const contents = readFileSync(path)
      response.end(
        relativePath === 'service-worker.js' && workerRevisionSuffix
          ? Buffer.concat([contents, Buffer.from(workerRevisionSuffix)])
          : contents,
      )
    } catch {
      response.writeHead(404).end()
    }
  })

  await new Promise<void>((resolveListening) => server.listen(0, '127.0.0.1', resolveListening))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Offline test server did not start')
  appUrl = `http://127.0.0.1:${address.port}/offline-test/`
})

test.afterAll(async () => {
  await new Promise<void>((resolveClosed, reject) => {
    server.close((error) => (error ? reject(error) : resolveClosed()))
  })
})

test.afterEach(() => {
  failServiceWorker = false
  workerRevisionSuffix = ''
})

test('the complete production bundle reloads without a network @offline', async ({
  context,
  page,
}) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('requestfailed', (request) => {
    browserErrors.push(`${request.url()}: ${request.failure()?.errorText ?? 'request failed'}`)
  })

  await page.goto(appUrl)
  await expect(page).toHaveTitle(/Collage Builder$/)

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect(page.getByRole('button', { name: 'Offline ready' })).toBeVisible()
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)

  const cachedFiles = await page.evaluate(async () => {
    const cacheNames = await caches.keys()
    const shellCacheName = cacheNames.find((name) => name.startsWith('collage-builder-shell:'))
    if (!shellCacheName) return []
    const requests = await (await caches.open(shellCacheName)).keys()
    const scopePath = new URL((await navigator.serviceWorker.ready).scope).pathname
    return requests.map((request) => new URL(request.url).pathname.slice(scopePath.length)).sort()
  })
  expect(cachedFiles).toEqual(['', ...distributionFiles(distributionDirectory)])

  await context.route('**/*', (route) => route.abort('internetdisconnected'))
  const cachedAssetResponse = await page.evaluate(async () => {
    const assetUrl = document.querySelector<HTMLScriptElement>('script[type="module"]')?.src
    if (!assetUrl) return { assetUrl: '', cached: false, fetched: false }
    const cached = Boolean(await caches.match(assetUrl, { ignoreSearch: true }))
    try {
      const response = await fetch(assetUrl)
      return { assetUrl, cached, fetched: response.ok }
    } catch {
      return { assetUrl, cached, fetched: false }
    }
  })
  expect(cachedAssetResponse).toMatchObject({ cached: true, fetched: true })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page).toHaveTitle(/Collage Builder$/)
  const offlineController = await page.evaluate(
    () => navigator.serviceWorker.controller?.scriptURL ?? null,
  )
  expect(offlineController).not.toBeNull()
  try {
    await expect(page.locator('#app')).not.toBeEmpty()
  } catch (error) {
    throw new Error(`${String(error)}\nBrowser errors: ${browserErrors.join('\n')}`, {
      cause: error,
    })
  }
})

test('an available deployment update preserves edits before reloading @offline', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('collage-builder:onboarding-complete:v1', 'true'),
  )
  await page.goto(appUrl)
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)

  await page.getByRole('textbox', { name: 'Project title' }).fill('Preserved update draft')
  await page.getByRole('textbox', { name: 'Project title' }).blur()
  workerRevisionSuffix = '\n// simulated-deployment-transition\n'
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    await registration.update()
  })

  const update = page.getByRole('button', { name: 'Update ready' })
  await expect(update).toBeEnabled()
  await update.click()
  await expect(page.getByRole('heading', { name: 'Pick up where you left off?' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText('Preserved update draft', { exact: true })).toBeVisible()
})

test('a failed lazy chunk reload preserves edits without an installed worker @offline', async ({
  page,
}) => {
  failServiceWorker = true
  await page.addInitScript(() =>
    localStorage.setItem('collage-builder:onboarding-complete:v1', 'true'),
  )
  await page.goto(appUrl)
  await expect(page.getByRole('button', { name: 'Online only' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Project title' }).fill('Preserved chunk-error draft')
  await page.getByRole('textbox', { name: 'Project title' }).blur()

  await page.evaluate(() => {
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))
  })

  await expect(page.getByRole('heading', { name: 'Pick up where you left off?' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText('Preserved chunk-error draft', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull()
})

test('hiding the document flushes a pending recovery immediately @offline', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('collage-builder:onboarding-complete:v1', 'true'),
  )
  await page.goto(appUrl)
  await page.getByRole('textbox', { name: 'Project title' }).fill('Hidden-tab checkpoint')
  await page.getByRole('textbox', { name: 'Project title' }).blur()

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<string[]>((resolve, reject) => {
              const request = indexedDB.open('collage-builder')
              request.onerror = () => reject(request.error)
              request.onsuccess = () => {
                const projects = request.result
                  .transaction('projects', 'readonly')
                  .objectStore('projects')
                  .getAll()
                projects.onerror = () => reject(projects.error)
                projects.onsuccess = () =>
                  resolve(
                    (projects.result as Array<{ title?: string }>).flatMap((project) =>
                      project.title ? [project.title] : [],
                    ),
                  )
              }
            }),
        ),
      { timeout: 5_000 },
    )
    .toContain('Hidden-tab checkpoint')
})
