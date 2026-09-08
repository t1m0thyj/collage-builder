import type { LayoutPresetDefinition, ResolvedFrame } from '../domain/types'
import { previewFrames } from './preview'

type FrameShape = 'portrait' | 'landscape' | 'square'

const shapes: FrameShape[] = ['portrait', 'landscape', 'square']

function frameShape(frame: Pick<ResolvedFrame, 'width' | 'height'>): FrameShape {
  const aspectRatio = frame.width / frame.height
  if (aspectRatio < 0.9) return 'portrait'
  if (aspectRatio > 1.1) return 'landscape'
  return 'square'
}

/** A concise visual summary for a layout picker tooltip. */
export function layoutShapeSummary(preset: LayoutPresetDefinition): string {
  const counts = new Map<FrameShape, number>(shapes.map((shape) => [shape, 0]))
  previewFrames(preset, 100, 100).forEach((frame) => {
    const shape = frameShape(frame)
    counts.set(shape, (counts.get(shape) ?? 0) + 1)
  })
  return shapes
    .flatMap((shape) => {
      const count = counts.get(shape) ?? 0
      return count === 0 ? [] : `${count} ${shape}${count === 1 ? '' : 's'}`
    })
    .join(', ')
}
