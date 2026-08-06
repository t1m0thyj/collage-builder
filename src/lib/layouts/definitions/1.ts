import type { LayoutPresetDefinition } from '../../domain/types'

export const oneFramePresets: LayoutPresetDefinition[] = [{ id: 'single', revision: 1, name: 'Single', frameCount: 1, tags: ['uniform'], root: { kind: 'leaf', key: 'a' } }]
