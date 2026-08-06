import type { LayoutPresetDefinition } from '../../domain/types'

const columns = (keys: string[], weights = keys.map(() => 1)) => ({ kind: 'split' as const, axis: 'x' as const, weights, children: keys.map((key) => ({ kind: 'leaf' as const, key })) })
const rows = (keys: string[], weights = keys.map(() => 1)) => ({ kind: 'split' as const, axis: 'y' as const, weights, children: keys.map((key) => ({ kind: 'leaf' as const, key })) })

export const fiveFramePresets: LayoutPresetDefinition[] = [
  { id: 'five-columns', revision: 1, name: 'Five columns', frameCount: 5, tags: ['uniform'], root: columns(['a', 'b', 'c', 'd', 'e']) },
  { id: 'five-rows', revision: 1, name: 'Five rows', frameCount: 5, tags: ['uniform'], root: rows(['a', 'b', 'c', 'd', 'e']) },
  { id: 'two-top-three-bottom', revision: 1, name: 'Two top, three bottom', frameCount: 5, tags: ['asymmetric', 'landscape-led'], root: { kind: 'split', axis: 'y', weights: [1, 1.15], children: [columns(['a', 'b']), columns(['c', 'd', 'e'])] } },
  { id: 'three-top-two-bottom', revision: 1, name: 'Three top, two bottom', frameCount: 5, tags: ['asymmetric', 'landscape-led'], root: { kind: 'split', axis: 'y', weights: [1, 1.15], children: [columns(['a', 'b', 'c']), columns(['d', 'e'])] } },
  { id: 'one-top-four-bottom', revision: 1, name: 'One top, four bottom', frameCount: 5, tags: ['asymmetric', 'landscape-led'], root: { kind: 'split', axis: 'y', weights: [1.25, 1], children: [{ kind: 'leaf', key: 'a' }, columns(['b', 'c', 'd', 'e'])] } },
  { id: 'two-top-one-middle-two-bottom', revision: 1, name: 'Two top, one middle, two bottom', frameCount: 5, tags: ['asymmetric', 'landscape-led'], root: { kind: 'split', axis: 'y', weights: [1, 1.15, 1], children: [columns(['a', 'b']), { kind: 'leaf', key: 'c' }, columns(['d', 'e'])] } },
  { id: 'one-left-grid-right', revision: 1, name: 'One left, grid right', frameCount: 5, tags: ['asymmetric', 'portrait-led'], root: { kind: 'split', axis: 'x', weights: [1.4, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'split', axis: 'y', weights: [1, 1], children: [columns(['b', 'c']), columns(['d', 'e'])] }] } },
  { id: 'one-top-grid-bottom', revision: 1, name: 'One top, grid bottom', frameCount: 5, tags: ['asymmetric', 'landscape-led'], root: { kind: 'split', axis: 'y', weights: [1.3, 1], children: [{ kind: 'leaf', key: 'a' }, { kind: 'split', axis: 'y', weights: [1, 1], children: [columns(['b', 'c']), columns(['d', 'e'])] }] } },
  { id: 'one-left-two-middle-two-right', revision: 1, name: 'One left, two middle, two right', frameCount: 5, tags: ['asymmetric', 'portrait-led'], root: { kind: 'split', axis: 'x', weights: [1.2, 1, 1], children: [{ kind: 'leaf', key: 'a' }, rows(['b', 'c']), rows(['d', 'e'])] } },
  { id: 'one-top-two-middle-two-bottom', revision: 1, name: 'One top, two middle, two bottom', frameCount: 5, tags: ['asymmetric', 'landscape-led'], root: { kind: 'split', axis: 'y', weights: [1.2, 1, 1], children: [{ kind: 'leaf', key: 'a' }, columns(['b', 'c']), columns(['d', 'e'])] } },
  { id: 'two-left-one-middle-two-right', revision: 1, name: 'Two left, one middle, two right', frameCount: 5, tags: ['asymmetric', 'portrait-led'], root: { kind: 'split', axis: 'x', weights: [1, 1.2, 1], children: [rows(['a', 'b']), { kind: 'leaf', key: 'c' }, rows(['d', 'e'])] } },
  { id: 'two-left-three-right', revision: 1, name: 'Two left, three right', frameCount: 5, tags: ['asymmetric', 'portrait-led'], root: { kind: 'split', axis: 'x', weights: [1, 1.15], children: [rows(['a', 'b']), rows(['c', 'd', 'e'])] } },
  { id: 'three-left-two-right', revision: 1, name: 'Three left, two right', frameCount: 5, tags: ['asymmetric', 'portrait-led'], root: { kind: 'split', axis: 'x', weights: [1.15, 1], children: [rows(['a', 'b', 'c']), rows(['d', 'e'])] } },
]
