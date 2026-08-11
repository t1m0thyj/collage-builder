import type { LayoutPresetDefinition } from '../domain/types'

type GridCell = readonly [x: number, y: number, width: number, height: number]

export function gridPreset(
  id: string,
  name: string,
  columns: number,
  rows: number,
  cells: GridCell[],
): LayoutPresetDefinition {
  return {
    id,
    revision: 1,
    name,
    frameCount: cells.length,
    tags: ['asymmetric'],
    root: {
      kind: 'grid',
      columns,
      rows,
      cells: cells.map(([x, y, width, height], index) => ({
        key: String.fromCharCode(97 + index),
        x,
        y,
        width,
        height,
      })),
    },
  }
}
