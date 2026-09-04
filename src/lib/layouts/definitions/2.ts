import type { LayoutPresetDefinition } from '../../domain/types'

export const layout2Presets: LayoutPresetDefinition[] = [
  {
    id: 'layout-2-001',
    revision: 1,
    name: 'Layout 1',
    frameCount: 2,
    tags: ['uniform'],
    root: {
      kind: 'grid',
      columns: 2,
      rows: 1,
      cells: [
        {
          key: 'cell-1',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
        {
          key: 'cell-2',
          x: 1,
          y: 0,
          width: 1,
          height: 1,
        },
      ],
    },
  },
  {
    id: 'layout-2-002',
    revision: 1,
    name: 'Layout 2',
    frameCount: 2,
    tags: ['uniform'],
    root: {
      kind: 'grid',
      columns: 1,
      rows: 2,
      cells: [
        {
          key: 'cell-1',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
        {
          key: 'cell-2',
          x: 0,
          y: 1,
          width: 1,
          height: 1,
        },
      ],
    },
  },
]
