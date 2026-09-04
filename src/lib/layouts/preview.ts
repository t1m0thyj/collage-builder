import type { LayoutPresetDefinition, PageV1, ResolvedFrame } from '../domain/types'
import { defaultPageStyle, instantiatePreset } from '../domain/factories'
import { resolveLayout } from '../domain/geometry'

export function previewFrames(
  preset: LayoutPresetDefinition,
  width = 120,
  height = 90,
): ResolvedFrame[] {
  const instance = instantiatePreset(preset)
  const page: PageV1 = {
    id: 'preview',
    name: 'Preview',
    width,
    height,
    ...instance,
    style: { ...defaultPageStyle(), padding: 0, gap: 0, cornerRadius: 0 },
  }
  return resolveLayout(page)
}

const edgeTolerance = 0.001

/**
 * Pins frames that touch an outer edge to that edge. At thumbnail sizes, separately rounded
 * percentages (notably repeated thirds) can otherwise leave a visible one-pixel seam.
 */
export function previewFrameStyle(frame: ResolvedFrame, width: number, height: number): string {
  const touchesRight = Math.abs(frame.x + frame.width - width) <= edgeTolerance
  const touchesBottom = Math.abs(frame.y + frame.height - height) <= edgeTolerance
  return [
    `left:${(frame.x / width) * 100}%`,
    `top:${(frame.y / height) * 100}%`,
    touchesRight ? 'right:0' : `width:${(frame.width / width) * 100}%`,
    touchesBottom ? 'bottom:0' : `height:${(frame.height / height) * 100}%`,
  ].join(';')
}
