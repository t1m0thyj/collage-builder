import type { LayoutPresetDefinition } from '../../domain/types'
import { layout4Presets } from './4'
import { layout5Presets } from './5'
import { layout6Presets } from './6'
import { layout7Presets } from './7'
import { layout8Presets } from './8'
import { layout9Presets } from './9'
import { layout10Presets } from './10'
import { layout11Presets } from './11'

export const optionalLayouts: Record<number, LayoutPresetDefinition[]> = {
  4: layout4Presets,
  5: layout5Presets,
  6: layout6Presets,
  7: layout7Presets,
  8: layout8Presets,
  9: layout9Presets,
  10: layout10Presets,
  11: layout11Presets,
}
