import type { LayoutPresetDefinition } from '../domain/types'
import { layout2Presets } from './definitions/2'
import { layout3Presets } from './definitions/3'
import { validatePreset } from './validatePreset'

let optionalLayouts: Promise<Record<number, LayoutPresetDefinition[]>> | undefined

function loadOptionalLayouts() {
  optionalLayouts ??= import('./definitions/optional').then((module) => module.optionalLayouts)
  return optionalLayouts
}

const cache = new Map<number, Promise<LayoutPresetDefinition[]>>()

export const layoutFrameCounts = Object.freeze(Array.from({ length: 10 }, (_, index) => index + 2))

export function layoutGroupForFrameCount(frameCount: number): number {
  return frameCount >= 11 ? 11 : frameCount
}

export function preloadOptionalLayouts(): void {
  void loadOptionalLayouts()
}

export function loadLayouts(frameCount: number): Promise<LayoutPresetDefinition[]> {
  const group = layoutGroupForFrameCount(frameCount)
  const counts = group === 11 ? [11, 12, 13, 14, 15, 16] : [group]
  if (counts.some((count) => count < 2 || count > 16))
    return Promise.reject(new Error(`Unsupported layout frame count: ${frameCount}`))
  let pending = cache.get(group)
  if (!pending) {
    pending = (
      group === 2
        ? Promise.resolve(layout2Presets)
        : group === 3
          ? Promise.resolve(layout3Presets)
          : loadOptionalLayouts().then((layouts) => counts.flatMap((count) => layouts[count]))
    ).then((presets) => {
      presets.forEach(validatePreset)
      if (new Set(presets.map((preset) => preset.id)).size !== presets.length)
        throw new Error(
          `Layout preset IDs for the ${group === 11 ? '11+' : group} group must be unique`,
        )
      return presets
    })
    cache.set(group, pending)
  }
  return pending
}
