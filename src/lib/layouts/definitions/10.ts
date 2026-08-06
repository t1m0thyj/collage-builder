import type { LayoutPresetDefinition } from '../../domain/types'

const row = (keys: string[]) => ({ kind: 'split' as const, axis: 'x' as const, weights: keys.map(() => 1), children: keys.map((key) => ({ kind: 'leaf' as const, key })) })

export const tenFramePresets: LayoutPresetDefinition[] = [
  { id: 'grid-2x5', revision: 1, name: '2 × 5 grid', frameCount: 10, tags: ['uniform'], root: { kind: 'split', axis: 'y', weights: [1, 1, 1, 1, 1], children: [row(['a', 'b']), row(['c', 'd']), row(['e', 'f']), row(['g', 'h']), row(['i', 'j'])] } },
  { id: 'grid-5x2', revision: 1, name: '5 × 2 grid', frameCount: 10, tags: ['uniform'], root: { kind: 'split', axis: 'x', weights: [1, 1, 1, 1, 1], children: [['a', 'f'], ['b', 'g'], ['c', 'h'], ['d', 'i'], ['e', 'j']].map((keys) => ({ kind: 'split', axis: 'y', weights: [1, 1], children: keys.map((key) => ({ kind: 'leaf', key })) })) } },
  { id: 'one-left-nine-grid-right', revision: 1, name: 'One left, nine-grid right', frameCount: 10, tags: ['asymmetric', 'portrait-led'], root: { kind: 'split', axis: 'x', weights: [1.4, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'split', axis: 'y', weights: [1, 1, 1], children: [row(['b', 'c', 'd']), row(['e', 'f', 'g']), row(['h', 'i', 'j'])] }] } },
]
