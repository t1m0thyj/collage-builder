import type { LayoutPresetDefinition } from '../domain/types'

const numberWords = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
]

function photoCount(count: number) {
  return `${numberWords[count] ?? String(count)} photo${count === 1 ? '' : 's'}`
}

/** A human-readable label derived from the stable, serializable preset definition. */
export function layoutDisplayName(preset: LayoutPresetDefinition): string {
  const { root, frameCount } = preset
  if (root.kind === 'grid') {
    if (root.columns === 1) return `${photoCount(frameCount)} stacked`
    if (root.rows === 1) return `${photoCount(frameCount)} side by side`
    if (root.columns === root.rows) return `${photoCount(frameCount)} in equal tiles`
    return `${root.columns} by ${root.rows} photo grid`
  }
  if (root.kind === 'split' && root.weights.length === 2) {
    const [first, second] = root.weights
    const largerSide = first === second ? undefined : first > second ? 'first' : 'second'
    if (largerSide && root.axis === 'x')
      return `${photoCount(frameCount)} with a large ${largerSide === 'first' ? 'left' : 'right'} panel`
    if (largerSide && root.axis === 'y')
      return `${photoCount(frameCount)} with a large ${largerSide === 'first' ? 'top' : 'bottom'} panel`
  }
  return preset.tags.includes('asymmetric')
    ? `Asymmetric ${photoCount(frameCount).toLocaleLowerCase()} layout`
    : `${photoCount(frameCount)} layout`
}
