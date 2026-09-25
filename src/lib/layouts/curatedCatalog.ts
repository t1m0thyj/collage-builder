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
        Math.max(slot.width / slot.height, slot.height / slot.width) > 7.5,
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

function makeCandidate(
  family: LayoutFamily,
  slots: readonly CollageSlot[],
  featuredSlots: readonly number[] = [],
): Candidate | undefined {
  const normalized = normalizeSlots(slots, featuredSlots)
  if (!isValidGeometry(normalized.slots)) return undefined
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

  if (photoCount <= 6) {
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
  if ((family === 'rows' || family === 'columns') && photoCount > 7) return false
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
  return Math.min(1, 2.5 / photoCount)
}

export function minimumLayoutSlotArea(photoCount: number): number {
  return 0.38 / photoCount
}

function selectVisuallyDistinct(
  candidates: readonly Candidate[],
  maximumEdgeSimilarity = 0.3,
): Candidate[] {
  const selected: Candidate[] = []
  for (const candidate of interleaveByFamily(candidates)) {
    if (
      selected.every(
        (chosen) => edgeSimilarity(candidate.edges, chosen.edges) < maximumEdgeSimilarity,
      )
    )
      selected.push(candidate)
  }
  return selected
}

function removeCrampedLayouts(candidates: readonly Candidate[], photoCount: number): Candidate[] {
  if (photoCount < 8 || photoCount > 10) return [...candidates]
  return candidates.filter((candidate) => {
    const smallestArea = Math.min(...candidate.slots.map((slot) => slot.width * slot.height))
    return smallestArea >= minimumLayoutSlotArea(photoCount)
  })
}

function limitDominantFamily(candidates: readonly Candidate[]): Candidate[] {
  const selected = [...candidates]
  while (selected.length > 1) {
    const counts = new Map<LayoutFamily, number>()
    for (const candidate of selected)
      counts.set(candidate.family, (counts.get(candidate.family) ?? 0) + 1)
    const dominant = [...counts].sort(
      ([leftFamily, leftCount], [rightFamily, rightCount]) =>
        rightCount - leftCount || leftFamily.localeCompare(rightFamily),
    )[0]
    if (!dominant || dominant[1] * 2 < selected.length) break
    const removable = selected
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => candidate.family === dominant[0])
      .sort(
        (left, right) =>
          left.candidate.score - right.candidate.score ||
          right.candidate.signature.localeCompare(left.candidate.signature),
      )[0]
    if (!removable) break
    selected.splice(removable.index, 1)
  }
  return selected
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

/** Show one familiar example of each composition before secondary variants and long strips. */
function orderForPicker(selected: readonly Candidate[]): Candidate[] {
  const primaryFamilies: readonly LayoutFamily[] = [
    'grid',
    'hero',
    'center-hero',
    'frame',
    'magazine',
    'feature-strip',
    'mosaic',
    'symmetric',
  ]
  const heroPosition = (candidate: Candidate): number => {
    const side = heroSide(candidate)
    return side ? { left: 0, top: 1, right: 2, bottom: 3 }[side] : 4
  }
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
    ...ordered,
    ...selected.filter((candidate) => candidate.family === 'rows'),
    ...selected.filter((candidate) => candidate.family === 'columns'),
  ]
}

export function generateCuratedPresets(photoCount: number): CollagePreset[] {
  if (!SUPPORTED_PHOTO_COUNTS.includes(photoCount))
    throw new Error(`Supported photo counts are 2 through 16; received ${photoCount}`)
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
  const initialSelection =
    photoCount <= 4
      ? ranked
      : photoCount <= 10
        ? limitDominantFamily(
            removeCrampedLayouts(
              selectVisuallyDistinct(ranked, layoutSimilarityThreshold(photoCount)),
              photoCount,
            ),
          )
        : selectHighCountHighlights(ranked, photoCount)
  const curated =
    photoCount > 10 ? completeHighCountHeroAxis(ranked, initialSelection) : initialSelection
  const canonicalGrids = ranked.filter(
    (candidate) => candidate.family === 'grid' && regularGridDimensions(candidate.slots),
  )
  const selected = mergeUniqueTopologies(canonicalGrids, curated)
  return orderForPicker(selected).map((candidate) => ({
    id: stableLayoutId(photoCount, candidate.slots),
    photoCount,
    family: candidate.family,
    featuredSlots: candidate.featuredSlots,
    slots: candidate.slots,
  }))
}

export function generateCuratedCatalog(): CollagePreset[] {
  return SUPPORTED_PHOTO_COUNTS.flatMap((photoCount) => generateCuratedPresets(photoCount))
}

export const curatedCollagePresets = Object.freeze(generateCuratedCatalog())
export const CURATED_LAYOUT_TOTAL = curatedCollagePresets.length
