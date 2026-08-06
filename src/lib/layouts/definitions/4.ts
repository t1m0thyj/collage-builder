import type { LayoutPresetDefinition } from '../../domain/types'

export const fourFramePresets: LayoutPresetDefinition[] = [
  { id: 'grid-2x2', revision: 1, name: '2 × 2 grid', frameCount: 4, tags: ['uniform'], root: { kind: 'split', axis: 'y', weights: [1, 1], children: [{ kind: 'split', axis: 'x', weights: [1, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'leaf', key: 'b' }] }, { kind: 'split', axis: 'x', weights: [1, 1], children: [{ kind: 'leaf', key: 'c' }, { kind: 'leaf', key: 'd' }] }] } },
]
