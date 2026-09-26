import { describe, expect, it } from 'vitest'
import { layout4Presets } from '../../src/lib/layouts/definitions/4'
import { previewFrames, previewFrameStyle } from '../../src/lib/layouts/preview'

describe('layout thumbnail geometry', () => {
  it('pins fractional split frames to the bottom and right edges', () => {
    const preset = layout4Presets.find(({ root }) => {
      if (root.kind !== 'split' || root.axis !== 'x' || root.children.length !== 3) return false
      const right = root.children[2]
      return right.kind === 'split' && right.axis === 'y'
    })
    expect(preset).toBeDefined()
    const frames = previewFrames(preset!, 80, 80)
    const lowerRight = frames.find((frame) => frame.x > 40 && frame.y > 0)

    expect(lowerRight).toBeDefined()
    expect(previewFrameStyle(lowerRight!, 80, 80)).toContain('right:0')
    expect(previewFrameStyle(lowerRight!, 80, 80)).toContain('bottom:0')
  })
})
