import type { LayoutPresetDefinition } from '../../domain/types'

export const threeFramePresets: LayoutPresetDefinition[] = [
  { id: 'feature-right', revision: 1, name: 'Feature right', frameCount: 3, tags: ['asymmetric', 'portrait-led'], root: { kind: 'split', axis: 'x', weights: [1.6, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'split', axis: 'y', weights: [1, 1], children: [{ kind: 'leaf', key: 'b' }, { kind: 'leaf', key: 'c' }] }] } },
  { id: 'feature-top', revision: 1, name: 'Feature top', frameCount: 3, tags: ['asymmetric', 'landscape-led'], root: { kind: 'split', axis: 'y', weights: [1.3, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'split', axis: 'x', weights: [1, 1], children: [{ kind: 'leaf', key: 'b' }, { kind: 'leaf', key: 'c' }] }] } },
]
