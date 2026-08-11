import type { LayoutPresetDefinition, LayoutPresetNode } from '../domain/types'

function walk(node: LayoutPresetNode, keys: string[]): void {
  if (node.kind === 'leaf') {
    keys.push(node.key)
    return
  }
  if (node.kind === 'grid') {
    if (
      !Number.isInteger(node.columns) ||
      !Number.isInteger(node.rows) ||
      node.columns < 1 ||
      node.rows < 1
    )
      throw new Error('A preset grid requires positive integer dimensions')
    node.cells.forEach((cell) => {
      if (
        !Number.isInteger(cell.x) ||
        !Number.isInteger(cell.y) ||
        !Number.isInteger(cell.width) ||
        !Number.isInteger(cell.height) ||
        cell.x < 0 ||
        cell.y < 0 ||
        cell.width < 1 ||
        cell.height < 1 ||
        cell.x + cell.width > node.columns ||
        cell.y + cell.height > node.rows
      )
        throw new Error('A preset grid cell is out of bounds')
      keys.push(cell.key)
    })
    return
  }
  if (node.children.length < 2 || node.weights.length !== node.children.length)
    throw new Error('A preset split requires matching weights and at least two children')
  if (node.weights.some((weight) => !Number.isFinite(weight) || weight <= 0))
    throw new Error('Preset weights must be positive finite numbers')
  node.children.forEach((child) => walk(child, keys))
}

export function validatePreset(preset: LayoutPresetDefinition): void {
  if (!preset.id || !preset.name || !Number.isInteger(preset.revision) || preset.revision < 1)
    throw new Error('Preset needs an ID, name, and positive revision')
  const keys: string[] = []
  walk(preset.root, keys)
  if (keys.length !== preset.frameCount)
    throw new Error(
      `Preset ${preset.id} declares ${preset.frameCount} frames but defines ${keys.length}`,
    )
  if (new Set(keys).size !== keys.length)
    throw new Error(`Preset ${preset.id} has duplicate leaf keys`)
}
