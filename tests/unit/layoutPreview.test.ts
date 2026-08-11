import { describe, expect, it } from 'vitest'
import { layout4Presets } from '../../src/lib/layouts/definitions/4'
import { previewFrames, previewFrameStyle } from '../../src/lib/layouts/preview'

describe('layout thumbnail geometry', () => {
  it('pins fractional split frames to the bottom and right edges', () => {
    const frames = previewFrames(layout4Presets[1], 80, 80)
    const lowerRight = frames
      .filter((frame) => frame.x > 0)
      .sort((left, right) => right.y - left.y)[0]

    expect(lowerRight).toBeDefined()
    expect(previewFrameStyle(lowerRight!, 80, 80)).toContain('right:0')
    expect(previewFrameStyle(lowerRight!, 80, 80)).toContain('bottom:0')
  })
})
