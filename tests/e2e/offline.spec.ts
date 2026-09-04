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
      response.end(readFileSync(path))
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
