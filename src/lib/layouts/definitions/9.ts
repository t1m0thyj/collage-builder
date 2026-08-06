import type { LayoutPresetDefinition } from '../../domain/types'

const row = (keys: string[]) => ({ kind: 'split' as const, axis: 'x' as const, weights: keys.map(() => 1), children: keys.map((key) => ({ kind: 'leaf' as const, key })) })

export const nineFramePresets: LayoutPresetDefinition[] = [
  { id: 'grid-3x3', revision: 1, name: '3 × 3 grid', frameCount: 9, tags: ['uniform'], root: { kind: 'split', axis: 'y', weights: [1, 1, 1], children: [row(['a', 'b', 'c']), row(['d', 'e', 'f']), row(['g', 'h', 'i'])] } },
  { id: 'one-left-eight-grid-right', revision: 1, name: 'One left, eight-grid right', frameCount: 9, tags: ['asymmetric', 'portrait-led'], root: { kind: 'split', axis: 'x', weights: [1.4, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'split', axis: 'y', weights: [1, 1, 1, 1], children: [row(['b', 'c']), row(['d', 'e']), row(['f', 'g']), row(['h', 'i'])] }] } },
]
