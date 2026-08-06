import type { LayoutPresetDefinition } from '../../domain/types'

const columns = (keys: string[]) => ({ kind: 'split' as const, axis: 'x' as const, weights: keys.map(() => 1), children: keys.map((key) => ({ kind: 'leaf' as const, key })) })
const rows = (keys: string[]) => ({ kind: 'split' as const, axis: 'y' as const, weights: keys.map(() => 1), children: keys.map((key) => ({ kind: 'leaf' as const, key })) })

export const eightFramePresets: LayoutPresetDefinition[] = [
  { id: 'grid-2x4', revision: 1, name: '2 × 4 grid', frameCount: 8, tags: ['uniform'], root: { kind: 'split', axis: 'y', weights: [1, 1, 1, 1], children: [columns(['a', 'b']), columns(['c', 'd']), columns(['e', 'f']), columns(['g', 'h'])] } },
  { id: 'grid-4x2', revision: 1, name: '4 × 2 grid', frameCount: 8, tags: ['uniform'], root: { kind: 'split', axis: 'x', weights: [1, 1, 1, 1], children: [rows(['a', 'e']), rows(['b', 'f']), rows(['c', 'g']), rows(['d', 'h'])] } },
]
