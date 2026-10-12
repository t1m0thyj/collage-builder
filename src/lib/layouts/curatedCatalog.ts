export interface CollageSlot {
  x: number
  y: number
  width: number
  height: number
}

export type LayoutFamily =
  | 'grid'
  | 'rows'
  | 'columns'
  | 'mosaic'
  | 'hero'
  | 'center-hero'
  | 'frame'
  | 'magazine'
  | 'feature-strip'
  | 'symmetric'
  | 'merged-grid'
  | 'nested'
  | 'rhythmic'

export interface CollagePreset {
  id: string
  photoCount: number
  family: LayoutFamily
  featuredSlots?: number[]
  slots: CollageSlot[]
}

type Region = CollageSlot

interface Candidate {
  family: LayoutFamily
  featuredSlots?: number[]
  slots: CollageSlot[]
  signature: string
  topology: string
  score: number
  edges: Set<number>
}

type Motif = 'bands' | 'merged-grid' | 'nested' | 'rhythm' | 'features'

interface SelectionCandidate extends Candidate {
  motif: Motif
  preference: number
}

type FillMode = 'rows' | 'columns' | 'balanced' | 'staggered'

export const SUPPORTED_PHOTO_COUNTS = Object.freeze(
  Array.from({ length: 15 }, (_, index) => index + 2),
)

export const LAYOUT_FAMILIES: readonly LayoutFamily[] = Object.freeze([
  'grid',
  'rows',
  'columns',
  'mosaic',
  'hero',
  'center-hero',
  'frame',
  'magazine',
  'feature-strip',
  'symmetric',
  'merged-grid',
  'nested',
  'rhythmic',
])

const EPSILON = 1e-8
const rootRegion: Region = { x: 0, y: 0, width: 1, height: 1 }

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function divide(region: Region, axis: 'x' | 'y', weights: readonly number[]): Region[] {
  const total = sum(weights)
  let offset = 0
  return weights.map((weight) => {
    const share = weight / total
    const child = {
      x: axis === 'x' ? region.x + region.width * offset : region.x,
      y: axis === 'y' ? region.y + region.height * offset : region.y,
      width: axis === 'x' ? region.width * share : region.width,
      height: axis === 'y' ? region.height * share : region.height,
    }
    offset += share
    return child
  })
}

function rotate<T>(values: readonly T[], offset: number): T[] {
  if (values.length === 0) return []
  const normalized = ((offset % values.length) + values.length) % values.length
  return [...values.slice(normalized), ...values.slice(0, normalized)]
}

function balancedCounts(total: number, bands: number, phase = 0): number[] {
  const base = Math.floor(total / bands)
  const counts = Array(bands).fill(base) as number[]
  for (let index = 0; index < total % bands; index += 1) counts[(index + phase) % bands] += 1
  return counts
}

function compositions(total: number, parts: number, maximum = total): number[][] {
  if (parts === 1) return total >= 1 && total <= maximum ? [[total]] : []
  const results: number[][] = []
  for (let first = 1; first <= Math.min(maximum, total - parts + 1); first += 1)
    for (const rest of compositions(total - first, parts - 1, maximum))
      results.push([first, ...rest])
  return results
}

function stripeWeights(count: number, variant: number): number[] {
  if (count === 2) {
    const pairs = [
      [1, 1],
      [2, 3],
      [3, 2],
      [1, 2],
      [2, 1],
    ]
    return pairs[variant] ?? pairs[0]
  }
  const weights = Array(count).fill(1) as number[]
  if (variant === 1) weights[0] = 1.5
  else if (variant === 2) weights[count - 1] = 1.5
  else if (variant === 3) weights[Math.floor((count - 1) / 2)] = 1.5
  else if (variant === 4)
    for (let index = 0; index < count; index += 1) weights[index] = index % 2 === 0 ? 1.2 : 0.8
  return weights
}

function fill(region: Region, count: number, mode: FillMode, phase = 0): CollageSlot[] {
  if (count === 1) return [{ ...region }]
  if (mode === 'rows') return divide(region, 'y', Array(count).fill(1))
  if (mode === 'columns') return divide(region, 'x', Array(count).fill(1))

  const estimatedRows = Math.sqrt((count * region.height) / region.width)
  const rowCount = Math.max(1, Math.min(count, Math.round(estimatedRows)))
  const counts = balancedCounts(count, rowCount, phase)
  const rowWeights =
    mode === 'balanced'
      ? counts.map((value) => Math.sqrt(value))
      : counts.map((_, index) => ((index + phase) % 2 === 0 ? 1.12 : 0.88))
  return divide(region, 'y', rowWeights).flatMap((row, rowIndex) => {
    const cellCount = counts[rowIndex]
    const weights =
      mode === 'staggered' && cellCount > 1
        ? rotate(stripeWeights(cellCount, 1 + ((rowIndex + phase) % 3)), rowIndex + phase)
        : Array(cellCount).fill(1)
    return divide(row, 'x', weights)
  })
}

function transformSlot(slot: CollageSlot, transform: number): CollageSlot {
  if (transform === 1)
    return { x: 1 - slot.x - slot.width, y: slot.y, width: slot.width, height: slot.height }
  if (transform === 2)
    return { x: slot.x, y: 1 - slot.y - slot.height, width: slot.width, height: slot.height }
  if (transform === 3)
    return {
      x: 1 - slot.y - slot.height,
      y: slot.x,
      width: slot.height,
      height: slot.width,
    }
  return { ...slot }
}

function rounded(value: number): number {
  return Math.abs(value) < EPSILON ? 0 : Math.abs(value - 1) < EPSILON ? 1 : value
}

function normalizeSlots(
  slots: readonly CollageSlot[],
  featuredSlots: readonly number[] = [],
): { slots: CollageSlot[]; featuredSlots?: number[] } {
  const featured = new Set(featuredSlots)
  const ordered = slots
    .map((slot, originalIndex) => ({
      originalIndex,
      slot: {
        x: rounded(slot.x),
        y: rounded(slot.y),
        width: rounded(slot.width),
        height: rounded(slot.height),
      },
    }))
    .sort((left, right) => left.slot.y - right.slot.y || left.slot.x - right.slot.x)
  const mapped = ordered.flatMap(({ originalIndex }, index) =>
    featured.has(originalIndex) ? [index] : [],
  )
  return {
    slots: ordered.map(({ slot }) => slot),
    featuredSlots: mapped.length > 0 ? mapped : undefined,
  }
}

function signature(slots: readonly CollageSlot[]): string {
  return slots
    .map(({ x, y, width, height }) =>
      [x, y, width, height].map((value) => value.toFixed(7)).join(','),
    )
    .sort()
    .join('|')
}

function coordinateRanks(values: readonly number[]): number[] {
  return [...values]
    .sort((left, right) => left - right)
    .filter((value, index, sorted) => index === 0 || Math.abs(value - sorted[index - 1]) > EPSILON)
}

/** Equal signatures mean one arrangement can be reached from the other by moving dividers. */
export function topologySignature(slots: readonly CollageSlot[]): string {
  const xRanks = coordinateRanks(slots.flatMap((slot) => [slot.x, slot.x + slot.width]))
  const yRanks = coordinateRanks(slots.flatMap((slot) => [slot.y, slot.y + slot.height]))
  const rank = (value: number, values: readonly number[]) =>
    values.findIndex((candidate) => Math.abs(candidate - value) <= EPSILON)
  return slots
    .map((slot) =>
      [
        rank(slot.x, xRanks),
        rank(slot.x + slot.width, xRanks),
        rank(slot.y, yRanks),
        rank(slot.y + slot.height, yRanks),
      ].join(','),
    )
    .sort()
    .join('|')
}

/** Stable across picker reordering and changes to the default divider proportions. */
export function stableLayoutId(photoCount: number, slots: readonly CollageSlot[]): string {
  const topology = topologySignature(slots)
  let hash = 0xcbf29ce484222325n
  for (let index = 0; index < topology.length; index += 1) {
    hash ^= BigInt(topology.charCodeAt(index))
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return `generated-${photoCount}-t${hash.toString(16).padStart(16, '0')}`
}

function overlapArea(left: CollageSlot, right: CollageSlot): number {
  return (
    Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x)) *
    Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
  )
}

function isValidGeometry(slots: readonly CollageSlot[]): boolean {
  if (
    slots.some(
      (slot) =>
        slot.x < -EPSILON ||
        slot.y < -EPSILON ||
        slot.width <= 0 ||
        slot.height <= 0 ||
        slot.x + slot.width > 1 + EPSILON ||
        slot.y + slot.height > 1 + EPSILON ||
        Math.min(slot.width, slot.height) < 0.074 ||
        Math.max(slot.width / slot.height, slot.height / slot.width) > 10 + EPSILON,
    )
  )
    return false
  if (Math.abs(sum(slots.map((slot) => slot.width * slot.height)) - 1) > EPSILON) return false
  for (let left = 0; left < slots.length; left += 1)
    for (let right = left + 1; right < slots.length; right += 1)
      if (overlapArea(slots[left], slots[right]) > EPSILON) return false
  return true
}

function edgeSet(slots: readonly CollageSlot[], resolution = 48): Set<number> {
  const edges = new Set<number>()
  for (const slot of slots) {
    const left = Math.round(slot.x * resolution)
    const right = Math.round((slot.x + slot.width) * resolution)
    const top = Math.round(slot.y * resolution)
    const bottom = Math.round((slot.y + slot.height) * resolution)
    for (let y = top; y < bottom; y += 1) {
      if (left > 0) edges.add(y * (resolution + 1) + left)
      if (right < resolution) edges.add(y * (resolution + 1) + right)
    }
    for (let x = left; x < right; x += 1) {
      if (top > 0) edges.add(resolution ** 2 + top * (resolution + 1) + x)
      if (bottom < resolution) edges.add(resolution ** 2 + bottom * (resolution + 1) + x)
    }
  }
  return edges
}

function aestheticScore(
  family: LayoutFamily,
  slots: readonly CollageSlot[],
  featuredSlots: readonly number[] = [],
): number {
  const averageArea = 1 / slots.length
  const worstAspect = Math.max(
    ...slots.map((slot) => Math.max(slot.width / slot.height, slot.height / slot.width)),
  )
  const smallestArea = Math.min(...slots.map((slot) => slot.width * slot.height))
  let score = 10 - Math.max(0, worstAspect - 2.8) * 0.55 + smallestArea / averageArea
  if (featuredSlots.length > 0) {
    const featuredArea = Math.max(
      ...featuredSlots.map((index) => slots[index].width * slots[index].height),
    )
    score += Math.min(2.5, featuredArea / averageArea - 1)
  }
  if (family === 'center-hero') {
    const featured = slots[featuredSlots[0]]
    const centerX = featured.x + featured.width / 2
    const centerY = featured.y + featured.height / 2
    score += 1.5 - (Math.abs(centerX - 0.5) + Math.abs(centerY - 0.5))
  }
  return score
}

/** Shared selection limits apply before topology ranking, including featured anchors. */
function isUsableComposition(
  family: LayoutFamily,
  slots: readonly CollageSlot[],
  featuredSlots: readonly number[],
): boolean {
  const areas = slots.map((slot) => slot.width * slot.height)
  if (Math.min(...areas) + EPSILON < minimumLayoutSlotArea(slots.length)) return false
  const strip =
    slots.every((slot) => Math.abs(slot.width - 1) < EPSILON) ||
    slots.every((slot) => Math.abs(slot.height - 1) < EPSILON)
  if (
    !strip &&
    slots.some((slot) => Math.max(slot.width / slot.height, slot.height / slot.width) > 4 + EPSILON)
  )
    return false
  // A small number of repeated sizes is easier to read than many unrelated subdivisions.
  if (coordinateRanks(areas).length > 4) return false
  if (family === 'hero' || family === 'feature-strip' || family === 'magazine') {
    const secondary = areas.filter((_, index) => !featuredSlots.includes(index))
    const maximumSpread = family === 'magazine' ? 2 : 1.5
    if (
      secondary.length > 1 &&
      Math.max(...secondary) > Math.min(...secondary) * maximumSpread + EPSILON
    )
      return false
  }
  return true
}

function makeCandidate(
  family: LayoutFamily,
  slots: readonly CollageSlot[],
  featuredSlots: readonly number[] = [],
): Candidate | undefined {
  const normalized = normalizeSlots(slots, featuredSlots)
  if (
    !isValidGeometry(normalized.slots) ||
    !isUsableComposition(family, normalized.slots, normalized.featuredSlots ?? [])
  )
    return undefined
  return {
    family,
    ...normalized,
    signature: signature(normalized.slots),
    topology: topologySignature(normalized.slots),
    score: aestheticScore(family, normalized.slots, normalized.featuredSlots),
    edges: edgeSet(normalized.slots),
  }
}

function frameLayout(
  photoCount: number,
  allocation: readonly [number, number, number, number],
  widths: readonly [number, number, number],
  heights: readonly [number, number, number],
): { slots: CollageSlot[]; hero: number } {
  const [topCount, rightCount, bottomCount, leftCount] = allocation
  if (sum(allocation) + 1 !== photoCount) throw new Error('Invalid frame allocation')
  const [top, middle, bottom] = divide(rootRegion, 'y', heights)
  const [left, center, right] = divide(middle, 'x', widths)
  const slots = [
    ...fill(top, topCount, 'columns'),
    ...fill(left, leftCount, 'rows'),
    center,
    ...fill(right, rightCount, 'rows'),
    ...fill(bottom, bottomCount, 'columns'),
  ]
  return { slots, hero: topCount + leftCount }
}

/** A rectangular merge must still admit full cuts so every divider remains editable. */
function isSlicing(slots: readonly CollageSlot[]): boolean {
  if (slots.length <= 1) return true
  for (const axis of ['x', 'y'] as const) {
    const length = axis === 'x' ? 'width' : 'height'
    const coordinates = coordinateRanks(
      slots.flatMap((slot) => [slot[axis], slot[axis] + slot[length]]),
    )
    for (const cut of coordinates.slice(1, -1)) {
      const before = slots.filter((slot) => slot[axis] + slot[length] <= cut + EPSILON)
      const after = slots.filter((slot) => slot[axis] >= cut - EPSILON)
      if (
        before.length > 0 &&
        after.length > 0 &&
        before.length + after.length === slots.length &&
        isSlicing(before) &&
        isSlicing(after)
      )
        return true
    }
  }
  return false
}

function transpose(slots: readonly CollageSlot[]): CollageSlot[] {
  return slots.map(({ x, y, width, height }) => ({ x: y, y: x, width: height, height: width }))
}

function grid(region: Region, columns: number, rows: number): CollageSlot[] {
  return divide(region, 'y', Array(rows).fill(1)).flatMap((row) =>
    divide(row, 'x', Array(columns).fill(1)),
  )
}

function fitSlots(slots: readonly CollageSlot[], source: Region, target: Region): CollageSlot[] {
  return slots.map((slot) => ({
    x: target.x + ((slot.x - source.x) / source.width) * target.width,
    y: target.y + ((slot.y - source.y) / source.height) * target.height,
    width: (slot.width / source.width) * target.width,
    height: (slot.height / source.height) * target.height,
  }))
}

/** Enumerate rectangular coalescings of a small lattice, rather than named cell arrangements. */
function mergedGrids(photoCount: number): CollageSlot[][] {
  const side = Math.ceil(Math.sqrt(photoCount))
  if (side * side - photoCount > 4) return []
  let states = new Map([[signature(grid(rootRegion, side, side)), grid(rootRegion, side, side)]])
  for (let count = side * side; count > photoCount; count -= 1) {
    const next = new Map<string, CollageSlot[]>()
    for (const slots of states.values())
      for (let left = 0; left < slots.length; left += 1)
        for (let right = left + 1; right < slots.length; right += 1) {
          const a = slots[left]
          const b = slots[right]
          const horizontal =
            Math.abs(a.y - b.y) < EPSILON &&
            Math.abs(a.height - b.height) < EPSILON &&
            (Math.abs(a.x + a.width - b.x) < EPSILON || Math.abs(b.x + b.width - a.x) < EPSILON)
          const vertical =
            Math.abs(a.x - b.x) < EPSILON &&
            Math.abs(a.width - b.width) < EPSILON &&
            (Math.abs(a.y + a.height - b.y) < EPSILON || Math.abs(b.y + b.height - a.y) < EPSILON)
          if (!horizontal && !vertical) continue
          const merged = {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: horizontal ? a.width + b.width : a.width,
            height: vertical ? a.height + b.height : a.height,
          }
          const candidate = [
            ...slots.filter((_, index) => index !== left && index !== right),
            merged,
          ]
          next.set(signature(candidate), candidate)
        }
    states = next
  }
  return [...states.values()].filter(isSlicing)
}

function panelFills(region: Region, count: number, nested = true): CollageSlot[][] {
  if (count === 1) return [[region]]
  const choices: CollageSlot[][] = []
  if (count <= 6) {
    choices.push(fill(region, count, 'rows'), fill(region, count, 'columns'))
  }
  for (let bands = 2; bands <= Math.min(count, Math.ceil(Math.sqrt(count))); bands += 1) {
    for (let phase = 0; phase < bands; phase += 1) {
      const counts = balancedCounts(count, bands, phase)
      for (const axis of ['x', 'y'] as const)
        choices.push(
          divide(region, axis, Array(bands).fill(1)).flatMap((band, index) =>
            fill(band, counts[index], axis === 'x' ? 'rows' : 'columns'),
          ),
        )
    }
  }
  if (nested && count >= 3 && count <= 6)
    for (const axis of ['x', 'y'] as const) {
      const [feature, secondary] = divide(region, axis, [1, 1])
      for (const remainder of panelFills(secondary, count - 1, false)) {
        choices.push([feature, ...remainder])
      }
      const [first, last] = divide(region, axis, [1, 1])
      for (const leading of panelFills(first, count - 1, false)) choices.push([...leading, last])
    }
  return [...new Map(choices.map((slots) => [signature(slots), slots])).values()]
}

/**
 * Common collage grammar: equal bands, merged lattice cells, panels within panels, and
 * repeated large/small cells. These rules depend only on the requested photo count;
 * layout IDs and individual arrangements are derived from the resulting geometry.
 */
function buildMotifPool(photoCount: number): SelectionCandidate[] {
  const candidates = new Map<string, SelectionCandidate>()
  const add = (motif: Exclude<Motif, 'features'>, slots: CollageSlot[], preference: number) => {
    const largest = slots.reduce(
      (best, slot, index) =>
        slot.width * slot.height > slots[best].width * slots[best].height ? index : best,
      0,
    )
    const featured = slots[largest].width * slots[largest].height >= 1.15 / photoCount
    const family = motif === 'bands' ? 'mosaic' : motif === 'rhythm' ? 'rhythmic' : motif
    const candidate = makeCandidate(family, slots, motif === 'nested' && featured ? [largest] : [])
    if (!candidate || !isSlicing(candidate.slots)) return
    const current = candidates.get(candidate.topology)
    if (
      !current ||
      preference > current.preference ||
      (preference === current.preference && candidate.score > current.score)
    )
      candidates.set(candidate.topology, { ...candidate, motif, preference })
  }

  const maximumBands = Math.min(4, photoCount - 1)
  for (let bands = 2; bands <= maximumBands; bands += 1)
    for (const counts of compositions(photoCount, bands, 6)) {
      const spread = Math.max(...counts) - Math.min(...counts)
      const distinct = new Set(counts).size
      const secondary = counts.filter((count) => count !== 1)
      const hasFeature =
        counts.includes(1) &&
        secondary.length > 0 &&
        Math.max(...secondary) - Math.min(...secondary) <= 1
      const monotone =
        counts.every((count, index) => index === 0 || count >= counts[index - 1]) ||
        counts.every((count, index) => index === 0 || count <= counts[index - 1])
      if (spread > 1 && distinct > 2 && !hasFeature && !monotone) continue
      const framedBands =
        bands >= 3 &&
        counts[0] === counts.at(-1) &&
        counts.slice(1, -1).every((count) => count < counts[0])
      const preference =
        photoCount > 10 && framedBands
          ? 10
          : bands === 2 && spread > 1 && !counts.includes(1)
            ? 9.5
            : spread <= 1
              ? 9
              : hasFeature
                ? 8
                : distinct <= 2
                  ? 7
                  : 6
      const weights =
        bands === 2 && spread > 1
          ? counts.map((count) =>
              counts.includes(1) ? (count === 1 && photoCount >= 6 ? 2 : 1) : 1 / count,
            )
          : Array(bands).fill(1)
      const slots = divide(rootRegion, 'y', weights).flatMap((band, index) =>
        fill(band, counts[index], 'columns'),
      )
      add('bands', slots, preference)
      // Rows are the natural reading order for irregular bands. Balanced two-band grids
      // and low-count layouts also benefit from their portrait-oriented counterpart.
      if (photoCount <= 5 || (bands === 2 && (spread <= 1 || counts.includes(1))))
        add('bands', transpose(slots), preference - 0.25)

      if ((bands >= 3 || photoCount === 4) && counts.every((count) => count >= 2 && count <= 3))
        for (const accent of ['all', 'short', 'long'] as const)
          for (const narrow of photoCount > 10 ? [false, true] : [false])
            for (const pattern of ['repeat', 'alternate', 'cycle'] as const)
              for (let phase = 0; phase < Math.max(...counts); phase += 1) {
                const rhythmic = divide(rootRegion, 'y', Array(bands).fill(1)).flatMap(
                  (band, index) => {
                    const weights = Array(counts[index]).fill(narrow ? 2 : 1) as number[]
                    const position =
                      pattern === 'repeat'
                        ? phase
                        : pattern === 'alternate'
                          ? index % 2 === 0
                            ? phase
                            : weights.length - 1 - phase
                          : phase + index
                    if (
                      accent === 'all' ||
                      (accent === 'short'
                        ? weights.length === Math.min(...counts)
                        : weights.length === Math.max(...counts))
                    )
                      weights[((position % weights.length) + weights.length) % weights.length] =
                        narrow ? 1 : Math.max(2, bands - weights.length + 1)
                    return divide(band, 'x', weights)
                  },
                )
                add(
                  'rhythm',
                  rhythmic,
                  9 + (pattern === 'alternate' ? 0.15 : pattern === 'cycle' ? -0.25 : 0),
                )
                add(
                  'rhythm',
                  transpose(rhythmic),
                  8.75 + (pattern === 'alternate' ? 0.15 : pattern === 'cycle' ? -0.25 : 0),
                )
              }
    }

  if (photoCount > 10) {
    for (let featureCount = 1; featureCount <= 2; featureCount += 1) {
      const remainder = photoCount - featureCount
      for (let rows = 2; rows <= Math.sqrt(remainder); rows += 1) {
        if (remainder % rows !== 0 || (featureCount === 2 && rows * rows !== remainder)) continue
        const [feature, secondary] = divide(rootRegion, 'y', [featureCount === 1 ? 1 : rows, rows])
        const slots = [
          ...fill(feature, featureCount, 'columns'),
          ...grid(secondary, remainder / rows, rows),
        ]
        add(featureCount === 1 ? 'bands' : 'nested', slots, 10)
      }
    }
    return [...candidates.values()]
  }
  for (const slots of mergedGrids(photoCount)) {
    const largestArea = Math.max(...slots.map((slot) => slot.width * slot.height))
    const worstAspect = Math.max(
      ...slots.map((slot) => Math.max(slot.width / slot.height, slot.height / slot.width)),
    )
    add('merged-grid', slots, 8 + largestArea - 0.25 * Math.max(0, worstAspect - 1.5))
  }
  const smallerSide = Math.floor(Math.sqrt(photoCount))
  if (photoCount === smallerSide * smallerSide + 1) {
    const cells = grid(rootRegion, smallerSide, smallerSide)
    for (let index = 0; index < cells.length; index += 1)
      for (const axis of ['x', 'y'] as const)
        add(
          'merged-grid',
          cells.flatMap((cell, cellIndex) =>
            cellIndex === index ? divide(cell, axis, [1, 1]) : [cell],
          ),
          8 + (index === Math.floor(cells.length / 2) ? 1 : 0),
        )
  }

  for (const axis of ['x', 'y'] as const)
    for (let firstCount = 1; firstCount < photoCount; firstCount += 1) {
      const secondCount = photoCount - firstCount
      const [first, second] = divide(rootRegion, axis, [1, 1])
      for (const left of panelFills(first, firstCount))
        for (const right of panelFills(second, secondCount)) {
          const span = (slot: CollageSlot) => (axis === 'x' ? slot.width : slot.height)
          const cross = (slot: CollageSlot) => (axis === 'x' ? slot.height : slot.width)
          const capacity = (slots: CollageSlot[]) =>
            sum(slots.map((slot) => cross(slot) / span(slot))) / slots.length
          // Allocate more space to panels whose cells would otherwise be thin. A single
          // feature gives the neighboring grid enough space to keep its small cells square.
          let share = capacity(left) / (capacity(left) + capacity(right))
          if (firstCount === 1) share = 1 - Math.max(1 / 3, Math.min(3 / 4, capacity(right) / 2))
          if (secondCount === 1) share = Math.max(1 / 3, Math.min(3 / 4, capacity(left) / 2))
          share = Math.max(1 / 4, Math.min(3 / 4, share))
          const isStripe = (slots: CollageSlot[]) =>
            slots.every(
              (slot) =>
                Math.abs(slot.width - slots[0].width) < EPSILON &&
                Math.abs(slot.x - slots[0].x) < EPSILON,
            ) ||
            slots.every(
              (slot) =>
                Math.abs(slot.height - slots[0].height) < EPSILON &&
                Math.abs(slot.y - slots[0].y) < EPSILON,
            )
          const repeatedPanels =
            firstCount === secondCount &&
            signature(
              left.map((slot) => ({ ...slot, x: slot.x - first.x, y: slot.y - first.y })),
            ) ===
              signature(
                right.map((slot) => ({ ...slot, x: slot.x - second.x, y: slot.y - second.y })),
              )
          const preference =
            repeatedPanels && left.length > 2
              ? 9
              : isStripe(left) && isStripe(right) && firstCount > 1 && secondCount > 1
                ? 8.5
                : 7 + (firstCount === 1 || secondCount === 1 ? 0.5 : 0)
          if (photoCount > 4) {
            const [firstPanel, secondPanel] = divide(rootRegion, axis, [share, 1 - share])
            add(
              'nested',
              [...fitSlots(left, first, firstPanel), ...fitSlots(right, second, secondPanel)],
              preference + 0.25,
            )
          }
          add('nested', [...left, ...right], preference)
        }
    }
  return [...candidates.values()].sort(
    (left, right) =>
      right.preference - left.preference ||
      right.score - left.score ||
      left.signature.localeCompare(right.signature),
  )
}

/** More shapes are useful around a two-by-three grid; denser collages need a smaller picker. */
export function layoutCountBudget(photoCount: number): number {
  return Math.round(12 + 28 / (1 + ((photoCount - 6) / 2.5) ** 2))
}

function selectCandidates(
  candidates: readonly SelectionCandidate[],
  budget: number,
  photoCount: number,
  anchors: readonly Candidate[] = [],
  turns: readonly Motif[] = ['features', 'bands', 'bands', 'merged-grid', 'nested', 'rhythm'],
): Candidate[] {
  const selected: Candidate[] = [...anchors]
  const groups = new Map<Motif, SelectionCandidate[]>([
    ['bands', candidates.filter((candidate) => candidate.motif === 'bands')],
    ['merged-grid', candidates.filter((candidate) => candidate.motif === 'merged-grid')],
    ['nested', candidates.filter((candidate) => candidate.motif === 'nested')],
    ['rhythm', candidates.filter((candidate) => candidate.motif === 'rhythm')],
    ['features', candidates.filter((candidate) => candidate.motif === 'features')],
  ])
  const maximumSimilarity = layoutSimilarityThreshold(photoCount)
  // Give simple band arrangements more space, then alternate the more detailed motifs.
  // The budget is a ceiling; exhausted groups never get backfilled with similar layouts.
  while (selected.length < budget && [...groups.values()].some((group) => group.length > 0))
    for (const motif of turns) {
      if (selected.length >= budget) break
      const group = groups.get(motif)!
      let index = -1
      let bestScore = -Infinity
      for (let candidateIndex = 0; candidateIndex < group.length; candidateIndex += 1) {
        const candidate = group[candidateIndex]
        const similarity = Math.max(
          0,
          ...selected.map((chosen) => edgeSimilarity(candidate.edges, chosen.edges)),
        )
        if (
          similarity >= maximumSimilarity ||
          selected.some((chosen) => chosen.topology === candidate.topology)
        )
          continue
        const score = candidate.preference + candidate.score * 0.15 - similarity * 1.5
        if (score > bestScore) {
          bestScore = score
          index = candidateIndex
        }
      }
      if (index < 0) {
        group.length = 0
        continue
      }
      selected.push(group.splice(index, 1)[0])
    }
  return selected
}

function buildCandidatePool(photoCount: number): Map<LayoutFamily, Candidate[]> {
  const pool = new Map<LayoutFamily, Map<string, Candidate>>(
    LAYOUT_FAMILIES.map((family) => [family, new Map()]),
  )
  const add = (
    family: LayoutFamily,
    slots: readonly CollageSlot[],
    featuredSlots: readonly number[] = [],
  ) => {
    const candidate = makeCandidate(family, slots, featuredSlots)
    if (candidate) pool.get(family)?.set(candidate.signature, candidate)
  }

  if (photoCount <= 10) {
    const stripeVariantCount = photoCount >= 5 ? 1 : 5
    for (let variant = 0; variant < stripeVariantCount; variant += 1) {
      add('rows', divide(rootRegion, 'y', stripeWeights(photoCount, variant)))
      add('columns', divide(rootRegion, 'x', stripeWeights(photoCount, variant)))
    }
  }

  for (let bands = 2; bands <= Math.min(4, photoCount); bands += 1) {
    for (let phase = 0; phase < bands; phase += 1) {
      const counts = balancedCounts(photoCount, bands, phase)
      const rows = divide(rootRegion, 'y', Array(bands).fill(1)).flatMap((row, index) =>
        fill(row, counts[index], 'columns'),
      )
      add('grid', rows)
      add(
        'grid',
        rows.map((slot) => transformSlot(slot, 3)),
      )
    }
  }

  if (photoCount === 4) {
    const [firstBand, secondBand] = divide(rootRegion, 'y', [1, 1])
    const staggeredPair = [...divide(firstBand, 'x', [3, 2]), ...divide(secondBand, 'x', [2, 3])]
    for (let transform = 0; transform < 4; transform += 1)
      add(
        'mosaic',
        staggeredPair.map((slot) => transformSlot(slot, transform)),
      )
  }

  for (let bands = 2; bands <= Math.min(4, photoCount - 1); bands += 1) {
    for (const counts of compositions(photoCount, bands, 4)) {
      if (Math.max(...counts) - Math.min(...counts) < 1) continue
      for (let variant = 0; variant < 3; variant += 1) {
        const rowWeights = counts.map((count, index) =>
          variant === 0 ? 1 : variant === 1 ? Math.sqrt(count) : index % 2 === 0 ? 1.15 : 0.85,
        )
        const mosaic = divide(rootRegion, 'y', rowWeights).flatMap((row, index) =>
          fill(row, counts[index], variant === 2 ? 'staggered' : 'columns', index),
        )
        add('mosaic', mosaic)
        add(
          'mosaic',
          mosaic.map((slot) => transformSlot(slot, 3)),
        )
      }
    }
  }

  const heroRatios = [7 / 12, 3 / 5, 2 / 3]
  for (const ratio of heroRatios) {
    for (let direction = 0; direction < 4; direction += 1) {
      const vertical = direction < 2
      const weights = direction % 2 === 0 ? [ratio, 1 - ratio] : [1 - ratio, ratio]
      const [first, second] = divide(rootRegion, vertical ? 'x' : 'y', weights)
      const heroRegion = direction % 2 === 0 ? first : second
      const secondary = direction % 2 === 0 ? second : first
      for (const mode of ['balanced', 'staggered'] as const) {
        const slots = [heroRegion, ...fill(secondary, photoCount - 1, mode, direction)]
        add('hero', slots, [0])
      }
    }
  }

  if (photoCount >= 5) {
    for (const allocation of compositions(photoCount - 1, 4, 4)) {
      const centered = frameLayout(
        photoCount,
        allocation as [number, number, number, number],
        [1, 2.2, 1],
        [1, 2.1, 1],
      )
      add('center-hero', centered.slots, [centered.hero])
      const offset = frameLayout(
        photoCount,
        allocation as [number, number, number, number],
        [0.8, 2.35, 1.15],
        [0.85, 2.25, 0.9],
      )
      add('frame', offset.slots, [offset.hero])
      add(
        'frame',
        offset.slots.map((slot) => transformSlot(slot, 1)),
        [offset.hero],
      )
    }
  }

  for (const ratio of [7 / 12, 3 / 5, 2 / 3]) {
    for (let direction = 0; direction < 4; direction += 1) {
      const vertical = direction < 2
      const weights = direction % 2 === 0 ? [ratio, 1 - ratio] : [1 - ratio, ratio]
      const [first, second] = divide(rootRegion, vertical ? 'y' : 'x', weights)
      const feature = direction % 2 === 0 ? first : second
      const strip = direction % 2 === 0 ? second : first
      for (const featureCount of photoCount >= 6 ? [1, 2] : [1]) {
        const slots = [
          ...fill(
            feature,
            featureCount,
            featureCount === 1 ? 'rows' : vertical ? 'columns' : 'rows',
          ),
          ...fill(
            strip,
            photoCount - featureCount,
            photoCount > 6 ? 'balanced' : vertical ? 'columns' : 'rows',
          ),
        ]
        add(
          'feature-strip',
          slots,
          Array.from({ length: featureCount }, (_, index) => index),
        )
      }
    }
  }

  for (let leftSecondary = 1; leftSecondary <= Math.min(3, photoCount - 2); leftSecondary += 1) {
    const rightCount = photoCount - leftSecondary - 1
    for (const ratio of [7 / 12, 3 / 5]) {
      const [left, right] = divide(rootRegion, 'x', [ratio, 1 - ratio])
      const [feature, lower] = divide(left, 'y', [3, 2])
      const slots = [
        feature,
        ...fill(lower, leftSecondary, 'columns'),
        ...fill(right, rightCount, 'staggered', leftSecondary),
      ]
      const featuredIndex = slots.reduce(
        (largest, slot, index) =>
          slot.width * slot.height > slots[largest].width * slots[largest].height ? index : largest,
        0,
      )
      add('magazine', slots, [featuredIndex])
      add(
        'magazine',
        slots.map((slot) => transformSlot(slot, 1)),
        [featuredIndex],
      )
      add(
        'magazine',
        slots.map((slot) => transformSlot(slot, 3)),
        [featuredIndex],
      )
    }
  }

  if (photoCount >= 4) {
    if (photoCount % 2 === 0) {
      const [left, right] = divide(rootRegion, 'x', [1, 1])
      for (const mode of ['rows', 'balanced', 'staggered'] as const) {
        const half = photoCount / 2
        add('symmetric', [...fill(left, half, mode), ...fill(right, half, mode, 1)])
      }
    } else {
      const sideCount = (photoCount - 1) / 2
      const [left, center, right] = divide(rootRegion, 'x', [1, 1.35, 1])
      add('symmetric', [
        ...fill(left, sideCount, 'rows'),
        center,
        ...fill(right, sideCount, 'rows'),
      ])
      add('symmetric', [
        ...fill(left, sideCount, 'balanced'),
        center,
        ...fill(right, sideCount, 'balanced', 1),
      ])
    }
  }

  return new Map(
    [...pool].map(([family, candidates]) => [
      family,
      [...candidates.values()].sort(
        (left, right) => right.score - left.score || left.signature.localeCompare(right.signature),
      ),
    ]),
  )
}

function isFamilyEligible(family: LayoutFamily, photoCount: number): boolean {
  if (photoCount === 2) return family === 'rows' || family === 'columns'
  if ((family === 'rows' || family === 'columns') && photoCount > 10) return false
  if ((family === 'center-hero' || family === 'frame') && photoCount < 5) return false
  return true
}

function edgeSimilarity(left: Set<number>, right: Set<number>): number {
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left]
  let shared = 0
  for (const edge of smaller) if (larger.has(edge)) shared += 1
  return shared / (left.size + right.size - shared)
}

export function layoutSimilarityThreshold(photoCount: number): number {
  // A denser collage needs more separation from existing choices to earn another thumbnail.
  return 0.84 - photoCount / 100
}

export function minimumLayoutSlotArea(photoCount: number): number {
  return 0.38 / photoCount
}

function selectHighCountHighlights(
  candidates: readonly Candidate[],
  photoCount: number,
): Candidate[] {
  const highlightFamilies: readonly LayoutFamily[] = [
    'grid',
    'mosaic',
    'hero',
    'center-hero',
    'frame',
    'magazine',
  ]
  const familyOffset = photoCount - 11
  const highlightCount = photoCount <= 12 ? 2 : 1
  const selected: Candidate[] = []
  for (
    let offset = 0;
    offset < highlightFamilies.length && selected.length < highlightCount;
    offset += 1
  ) {
    const family = highlightFamilies[(familyOffset + offset) % highlightFamilies.length]
    const candidate = candidates.find(
      (item) =>
        item.family === family && !selected.some((chosen) => chosen.topology === item.topology),
    )
    if (candidate) selected.push(candidate)
  }
  return selected
}

function regularGridDimensions(slots: readonly CollageSlot[]):
  | {
      rows: number
      columns: number
    }
  | undefined {
  const xCoordinates = coordinateRanks(slots.map((slot) => slot.x))
  const yCoordinates = coordinateRanks(slots.map((slot) => slot.y))
  const columns = xCoordinates.length
  const rows = yCoordinates.length
  if (rows < 2 || columns < 2 || rows * columns !== slots.length) return undefined
  const expectedWidth = 1 / columns
  const expectedHeight = 1 / rows
  if (
    slots.some(
      (slot) =>
        Math.abs(slot.width - expectedWidth) > EPSILON ||
        Math.abs(slot.height - expectedHeight) > EPSILON ||
        !xCoordinates.some((value) => Math.abs(value - slot.x) <= EPSILON) ||
        !yCoordinates.some((value) => Math.abs(value - slot.y) <= EPSILON),
    )
  )
    return undefined
  return { rows, columns }
}

function mergeUniqueTopologies(...groups: readonly Candidate[][]): Candidate[] {
  const merged = new Map<string, Candidate>()
  for (const candidate of groups.flat())
    if (!merged.has(candidate.topology)) merged.set(candidate.topology, candidate)
  return [...merged.values()]
}

type HeroSide = 'top' | 'right' | 'bottom' | 'left'

function heroSide(candidate: Candidate): HeroSide | undefined {
  if (candidate.family !== 'hero' || candidate.featuredSlots?.length !== 1) return undefined
  const slot = candidate.slots[candidate.featuredSlots[0]]
  if (Math.abs(slot.width - 1) <= EPSILON) return slot.y <= EPSILON ? 'top' : 'bottom'
  if (Math.abs(slot.height - 1) <= EPSILON) return slot.x <= EPSILON ? 'left' : 'right'
  return undefined
}

function completeHighCountHeroAxis(
  candidates: readonly Candidate[],
  selected: readonly Candidate[],
): Candidate[] {
  const selectedHero = selected.find((candidate) => heroSide(candidate))
  if (!selectedHero) return [...selected]
  const side = heroSide(selectedHero) as HeroSide
  const opposite: Record<HeroSide, HeroSide> = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right',
  }
  const oppositeHero = candidates.find((candidate) => heroSide(candidate) === opposite[side])
  const centerHero = candidates.find((candidate) => candidate.family === 'center-hero')
  return mergeUniqueTopologies(
    [...selected],
    oppositeHero ? [oppositeHero] : [],
    centerHero ? [centerHero] : [],
  )
}

function interleaveByFamily(selected: readonly Candidate[]): Candidate[] {
  const groups = new Map(
    LAYOUT_FAMILIES.map((family) => [
      family,
      selected.filter((candidate) => candidate.family === family),
    ]),
  )
  const result: Candidate[] = []
  while (result.length < selected.length)
    for (const family of LAYOUT_FAMILIES) {
      const next = groups.get(family)?.shift()
      if (next) result.push(next)
    }
  return result
}

/** Show balanced, simple grids first, followed by editorial compositions and long strips. */
function orderForPicker(selected: readonly Candidate[]): Candidate[] {
  const primaryFamilies: readonly LayoutFamily[] = [
    'hero',
    'center-hero',
    'frame',
    'magazine',
    'feature-strip',
    'mosaic',
    'symmetric',
    'merged-grid',
    'nested',
    'rhythmic',
  ]
  const heroPosition = (candidate: Candidate): number => {
    const side = heroSide(candidate)
    return side ? { left: 0, top: 1, right: 2, bottom: 3 }[side] : 4
  }
  const gridBalance = (candidate: Candidate): number =>
    sum(
      candidate.slots.map((slot) => {
        const areaDifference = slot.width * slot.height - 1 / candidate.slots.length
        return areaDifference * areaDifference
      }),
    )
  const gridComplexity = (candidate: Candidate): number =>
    coordinateRanks(candidate.slots.flatMap((slot) => [slot.x, slot.x + slot.width])).length +
    coordinateRanks(candidate.slots.flatMap((slot) => [slot.y, slot.y + slot.height])).length
  const gridOrientation = (candidate: Candidate): number =>
    coordinateRanks(candidate.slots.map((slot) => slot.y)).length -
    coordinateRanks(candidate.slots.map((slot) => slot.x)).length
  const gridReadingWeight = (candidate: Candidate): number =>
    sum(
      candidate.slots.map((slot) => {
        const area = slot.width * slot.height
        return area * area * (slot.x + slot.y)
      }),
    )
  const compareMeasure = (left: number, right: number): number =>
    Math.abs(left - right) <= EPSILON ? 0 : left - right
  const grids = selected
    .filter((candidate) => candidate.family === 'grid')
    .sort(
      (left, right) =>
        compareMeasure(gridBalance(left), gridBalance(right)) ||
        gridComplexity(left) - gridComplexity(right) ||
        gridOrientation(left) - gridOrientation(right) ||
        compareMeasure(gridReadingWeight(left), gridReadingWeight(right)) ||
        right.score - left.score ||
        left.signature.localeCompare(right.signature),
    )
  const groups = new Map(
    primaryFamilies.map((family) => [
      family,
      selected
        .filter((candidate) => candidate.family === family)
        .sort(
          (left, right) =>
            (family === 'hero' ? heroPosition(left) - heroPosition(right) : 0) ||
            right.score - left.score ||
            left.signature.localeCompare(right.signature),
        ),
    ]),
  )
  const ordered: Candidate[] = []
  while (
    ordered.length <
    selected.filter((candidate) => primaryFamilies.includes(candidate.family)).length
  )
    for (const family of primaryFamilies) {
      const next = groups.get(family)?.shift()
      if (next) ordered.push(next)
    }
  return [
    ...grids,
    ...ordered,
    ...selected.filter((candidate) => candidate.family === 'rows'),
    ...selected.filter((candidate) => candidate.family === 'columns'),
  ]
}

const presetCache = new Map<number, CollagePreset[]>()

export function generateCuratedPresets(photoCount: number): CollagePreset[] {
  if (!SUPPORTED_PHOTO_COUNTS.includes(photoCount))
    throw new Error(`Supported photo counts are 2 through 16; received ${photoCount}`)
  // Candidate enumeration is intentionally broad. Repeated generation in a script or
  // test process can reuse it, while callers still receive independent, editable slots.
  const cached = presetCache.get(photoCount)
  if (cached) return structuredClone(cached)
  const pool = buildCandidatePool(photoCount)
  const byTopology = new Map<string, Candidate>()
  for (const candidate of [...pool.values()].flat()) {
    if (!isFamilyEligible(candidate.family, photoCount)) continue
    const current = byTopology.get(candidate.topology)
    if (
      !current ||
      candidate.score > current.score ||
      (candidate.score === current.score && candidate.signature < current.signature)
    )
      byTopology.set(candidate.topology, candidate)
  }
  const ranked = [...byTopology.values()].sort(
    (left, right) => right.score - left.score || left.topology.localeCompare(right.topology),
  )
  const canonicalGrids = ranked.filter(
    (candidate) => candidate.family === 'grid' && regularGridDimensions(candidate.slots),
  )
  const gridDefaults = new Map<string, Candidate>()
  for (const candidate of pool.get('grid') ?? []) {
    const balancedPair =
      candidate.slots.every((slot) => Math.abs(slot.height - 0.5) < EPSILON) ||
      candidate.slots.every((slot) => Math.abs(slot.width - 0.5) < EPSILON)
    if (!regularGridDimensions(candidate.slots) && !balancedPair) continue
    const current = gridDefaults.get(candidate.topology)
    if (!current || candidate.score > current.score) gridDefaults.set(candidate.topology, candidate)
  }
  let selection = photoCount <= 3 ? ranked : canonicalGrids
  if (photoCount >= 4 && photoCount <= 10) {
    const familiar = [...(pool.get('grid') ?? [])].filter(
      (candidate) =>
        regularGridDimensions(candidate.slots) ||
        (photoCount % 2 === 1 &&
          (candidate.slots.every((slot) => Math.abs(slot.height - 0.5) < EPSILON) ||
            candidate.slots.every((slot) => Math.abs(slot.width - 0.5) < EPSILON))),
    )
    const features: Candidate[] = []
    for (const side of ['left', 'top', 'right', 'bottom'] as const) {
      const candidate = ranked.find((item) => heroSide(item) === side)
      if (candidate) features.push(candidate)
    }
    for (const family of [
      'center-hero',
      'frame',
      'magazine',
      'feature-strip',
      'symmetric',
    ] as const) {
      const candidate = ranked.find((item) => item.family === family)
      if (candidate) features.push(candidate)
    }
    const budget = layoutCountBudget(photoCount)
    const motifPool = buildMotifPool(photoCount)
    const strips = ranked.filter(
      (candidate) => candidate.family === 'rows' || candidate.family === 'columns',
    )
    const reserved = mergeUniqueTopologies(familiar, strips)
    const candidates: SelectionCandidate[] = [
      ...interleaveByFamily(features).map((candidate) => ({
        ...candidate,
        motif: 'features' as const,
        preference: 8.5,
      })),
      ...motifPool,
    ]
    selection = selectCandidates(candidates, budget, photoCount, reserved)
  } else if (photoCount > 10) {
    selection = mergeUniqueTopologies(
      canonicalGrids,
      completeHighCountHeroAxis(ranked, selectHighCountHighlights(ranked, photoCount)),
    )
    const motifs = buildMotifPool(photoCount).filter(
      (candidate) => !selection.some((chosen) => chosen.topology === candidate.topology),
    )
    selection = selectCandidates(
      motifs,
      selection.length + Math.max(0, Math.ceil((16 - photoCount) / 2)),
      photoCount,
      selection,
      ['nested', 'bands', 'rhythm'],
    )
  }
  const selected = selection.map((candidate) =>
    candidate.family === 'rows' || candidate.family === 'columns'
      ? candidate
      : (gridDefaults.get(candidate.topology) ?? candidate),
  )
  const presets = orderForPicker(selected).map((candidate) => ({
    id: stableLayoutId(photoCount, candidate.slots),
    photoCount,
    family: candidate.family,
    featuredSlots: candidate.featuredSlots,
    slots: candidate.slots,
  }))
  presetCache.set(photoCount, structuredClone(presets))
  return presets
}

export function generateCuratedCatalog(): CollagePreset[] {
  return SUPPORTED_PHOTO_COUNTS.flatMap((photoCount) => generateCuratedPresets(photoCount))
}

export const curatedCollagePresets = Object.freeze(generateCuratedCatalog())
export const CURATED_LAYOUT_TOTAL = curatedCollagePresets.length
