import type { LayoutPresetDefinition } from '../../domain/types'

const columns = (keys: string[]) => ({ kind: 'split' as const, axis: 'x' as const, weights: keys.map(() => 1), children: keys.map((key) => ({ kind: 'leaf' as const, key })) })
const rows = (keys: string[]) => ({ kind: 'split' as const, axis: 'y' as const, weights: keys.map(() => 1), children: keys.map((key) => ({ kind: 'leaf' as const, key })) })

export const sixFramePresets: LayoutPresetDefinition[] = [
  { id: 'grid-2x3', revision: 1, name: '2 × 3 grid', frameCount: 6, tags: ['uniform'], root: { kind: 'split', axis: 'y', weights: [1, 1, 1], children: [columns(['a', 'b']), columns(['c', 'd']), columns(['e', 'f'])] } },
  { id: 'grid-3x2', revision: 1, name: '3 × 2 grid', frameCount: 6, tags: ['uniform'], root: { kind: 'split', axis: 'x', weights: [1, 1, 1], children: [rows(['a', 'd']), rows(['b', 'e']), rows(['c', 'f'])] } },
]
