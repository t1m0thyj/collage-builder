import type { CollageDocumentV1 } from './types'
import { maxProjectAssetCount, maxProjectBytes } from '../persistence/limits'

export const maxProjectPages = 256
export const maxLayoutDepth = 32
export const maxLayoutNodes = 1024
export const maxPageFrames = 256
export const maxPolygonPoints = 64
export const maxDocumentValues = 500_000
export const maxDocumentDepth = 128

/** Iterative preflight runs before recursive schema parsing, including recovery. */
export function assertDocumentStructure(input: unknown): void {
  const stack = [{ value: input, depth: 0 }]
  const seen = new WeakSet<object>()
  let count = 0
  while (stack.length) {
    const { value, depth } = stack.pop()!
    if (++count > maxDocumentValues || depth > maxDocumentDepth)
      throw new Error('Project structure exceeds supported complexity')
    if (value === null || typeof value !== 'object') continue
    if (Array.isArray(value) && value.length > maxDocumentValues)
      throw new Error('Project structure exceeds supported complexity')
    if (seen.has(value)) throw new Error('Project structure contains repeated or cyclic objects')
    seen.add(value)
    // Stop enumerating wide input as soon as the remaining budget is exhausted.
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue
      if (count + stack.length >= maxDocumentValues)
        throw new Error('Project structure exceeds supported complexity')
      stack.push({ value: (value as Record<string, unknown>)[key], depth: depth + 1 })
    }
  }
}

export function assertProjectBudgets(document: CollageDocumentV1): void {
  if (document.pages.length > maxProjectPages)
    throw new Error(`Projects can contain no more than ${maxProjectPages} pages`)
  let count = 0
  let bytes = 0
  for (const asset of Object.values(document.assets)) {
    if (++count > maxProjectAssetCount)
      throw new Error(`Projects can contain no more than ${maxProjectAssetCount} photos`)
    if (!Number.isSafeInteger(asset.byteLength) || asset.byteLength < 0)
      throw new Error('Photo byte lengths must be non-negative safe integers')
    bytes += asset.byteLength
    if (bytes > maxProjectBytes) throw new Error('Project assets exceed the 1 GB safety limit')
  }
}
