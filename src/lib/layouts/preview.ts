import type { LayoutPresetDefinition, PageV1, ResolvedFrame } from '../domain/types'
import { defaultPageStyle, instantiateLayout } from '../domain/factories'
import { resolveLayout } from '../domain/geometry'

export function previewFrames(preset: LayoutPresetDefinition, width = 120, height = 90): ResolvedFrame[] {
  const instance = instantiateLayout(preset.id)
  const page: PageV1 = { id: 'preview', name: 'Preview', width, height, ...instance, style: { ...defaultPageStyle(), padding: 4, gap: 3, cornerRadius: 0 } }
  return resolveLayout(page)
}
