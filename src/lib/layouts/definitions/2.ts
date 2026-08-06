import type { LayoutPresetDefinition } from '../../domain/types'

export const twoFramePresets: LayoutPresetDefinition[] = [
  { id: 'two-columns', revision: 1, name: 'Two columns', frameCount: 2, tags: ['uniform'], root: { kind: 'split', axis: 'x', weights: [1, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'leaf', key: 'b' }] } },
  { id: 'two-rows', revision: 1, name: 'Two rows', frameCount: 2, tags: ['uniform'], root: { kind: 'split', axis: 'y', weights: [1, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'leaf', key: 'b' }] } },
]
