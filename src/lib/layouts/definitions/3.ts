import type { LayoutPresetDefinition } from '../../domain/types'

export const threeFramePresets: LayoutPresetDefinition[] = [
  { id: 'feature-right', revision: 1, name: 'One left, two right', frameCount: 3, tags: ['asymmetric', 'portrait-led'], root: { kind: 'split', axis: 'x', weights: [1.6, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'split', axis: 'y', weights: [1, 1], children: [{ kind: 'leaf', key: 'b' }, { kind: 'leaf', key: 'c' }] }] } },
  { id: 'feature-top', revision: 1, name: 'One top, two bottom', frameCount: 3, tags: ['asymmetric', 'landscape-led'], root: { kind: 'split', axis: 'y', weights: [1.3, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'split', axis: 'x', weights: [1, 1], children: [{ kind: 'leaf', key: 'b' }, { kind: 'leaf', key: 'c' }] }] } },
  { id: 'three-columns', revision: 1, name: 'Three columns', frameCount: 3, tags: ['uniform'], root: { kind: 'split', axis: 'x', weights: [1, 1, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'leaf', key: 'b' }, { kind: 'leaf', key: 'c' }] } },
  { id: 'three-rows', revision: 1, name: 'Three rows', frameCount: 3, tags: ['uniform'], root: { kind: 'split', axis: 'y', weights: [1, 1, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'leaf', key: 'b' }, { kind: 'leaf', key: 'c' }] } },
  { id: 'two-top-one-bottom', revision: 1, name: 'Two top, one bottom', frameCount: 3, tags: ['asymmetric', 'landscape-led'], root: { kind: 'split', axis: 'y', weights: [1, 1.3], children: [{ kind: 'split', axis: 'x', weights: [1, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'leaf', key: 'b' }] }, { kind: 'leaf', key: 'c' }] } },
  { id: 'two-left-one-right', revision: 1, name: 'Two left, one right', frameCount: 3, tags: ['asymmetric', 'portrait-led'], root: { kind: 'split', axis: 'x', weights: [1, 1.3], children: [{ kind: 'split', axis: 'y', weights: [1, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'leaf', key: 'b' }] }, { kind: 'leaf', key: 'c' }] } },
]
