import type { LayoutPresetDefinition } from '../domain/types'
import {
  layout2Presets,
  layout3Presets,
  layout4Presets,
  layout5Presets,
  layout6Presets,
  layout7Presets,
  layout8Presets,
  layout9Presets,
  layout10Presets,
  layout11Presets,
  layout12Presets,
  layout13Presets,
  layout14Presets,
  layout15Presets,
  layout16Presets,
} from './definitions'
import { validatePreset } from './validatePreset'

/** Runtime catalog. Source parsing utilities are deliberately not a runtime dependency. */
export const layoutCatalog: LayoutPresetDefinition[] = [
  ...layout2Presets,
  ...layout3Presets,
  ...layout4Presets,
  ...layout5Presets,
  ...layout6Presets,
  ...layout7Presets,
  ...layout8Presets,
  ...layout9Presets,
  ...layout10Presets,
  ...layout11Presets,
  ...layout12Presets,
  ...layout13Presets,
  ...layout14Presets,
  ...layout15Presets,
  ...layout16Presets,
]
layoutCatalog.forEach(validatePreset)
if (new Set(layoutCatalog.map((preset) => preset.id)).size !== layoutCatalog.length)
  throw new Error('Layout preset IDs must be unique')

export function presetsForFrameCount(frameCount: number): LayoutPresetDefinition[] {
  return layoutCatalog.filter((preset) => preset.frameCount === frameCount)
}
