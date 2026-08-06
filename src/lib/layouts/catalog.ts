import type { LayoutPresetDefinition } from '../domain/types'
import { oneFramePresets } from './definitions/1'
import { twoFramePresets } from './definitions/2'
import { threeFramePresets } from './definitions/3'
import { fourFramePresets } from './definitions/4'
import { fiveFramePresets } from './definitions/5'
import { sixFramePresets } from './definitions/6'
import { sevenFramePresets } from './definitions/7'
import { eightFramePresets } from './definitions/8'
import { nineFramePresets } from './definitions/9'
import { tenFramePresets } from './definitions/10'
import { validatePreset } from './validatePreset'

export const layoutCatalog: LayoutPresetDefinition[] = [...oneFramePresets, ...twoFramePresets, ...threeFramePresets, ...fourFramePresets, ...fiveFramePresets, ...sixFramePresets, ...sevenFramePresets, ...eightFramePresets, ...nineFramePresets, ...tenFramePresets]
layoutCatalog.forEach(validatePreset)
if (new Set(layoutCatalog.map((preset) => preset.id)).size !== layoutCatalog.length) throw new Error('Layout preset IDs must be unique')

export function presetsForFrameCount(frameCount: number): LayoutPresetDefinition[] { return layoutCatalog.filter((preset) => preset.frameCount === frameCount) }
export function getPreset(id: string): LayoutPresetDefinition { const preset = layoutCatalog.find((candidate) => candidate.id === id); if (!preset) throw new Error(`Unknown layout preset: ${id}`); return preset }
