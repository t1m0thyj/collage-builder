import type { LayoutPresetDefinition } from '../domain/types'
import { layout2Presets } from './definitions/2'
import { layout3Presets } from './definitions/3'
import { validatePreset } from './validatePreset'

let optionalLayouts: Promise<Record<number, LayoutPresetDefinition[]>> | undefined

function loadOptionalLayouts() {
  optionalLayouts ??= import('./definitions/optional').then((module) => module.optionalLayouts)
  return optionalLayouts
}

const loaders: Record<number, () => Promise<LayoutPresetDefinition[]>> = {
  // These are required to create the initial page, so pretending they are lazy only
  // adds an extra request before the editor can become useful.
  2: async () => layout2Presets,
  3: async () => layout3Presets,
  4: () => loadOptionalLayouts().then((layouts) => layouts[4]),
  5: () => loadOptionalLayouts().then((layouts) => layouts[5]),
  6: () => loadOptionalLayouts().then((layouts) => layouts[6]),
  7: () => loadOptionalLayouts().then((layouts) => layouts[7]),
  8: () => loadOptionalLayouts().then((layouts) => layouts[8]),
  9: () => loadOptionalLayouts().then((layouts) => layouts[9]),
  10: () => loadOptionalLayouts().then((layouts) => layouts[10]),
  11: () => loadOptionalLayouts().then((layouts) => layouts[11]),
}

const cache = new Map<number, Promise<LayoutPresetDefinition[]>>()

export const layoutFrameCounts = Object.freeze(Object.keys(loaders).map(Number))

export function preloadOptionalLayouts(): void {
  void loadOptionalLayouts()
}

export function loadLayouts(frameCount: number): Promise<LayoutPresetDefinition[]> {
  const loader = loaders[frameCount]
  if (!loader) return Promise.reject(new Error(`Unsupported layout frame count: ${frameCount}`))
  let pending = cache.get(frameCount)
  if (!pending) {
    pending = loader().then((presets) => {
      presets.forEach(validatePreset)
      if (new Set(presets.map((preset) => preset.id)).size !== presets.length)
        throw new Error(`Layout preset IDs for ${frameCount} frames must be unique`)
      return presets
    })
    cache.set(frameCount, pending)
  }
  return pending
}
