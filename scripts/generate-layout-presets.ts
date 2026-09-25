#!/usr/bin/env node

import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import type { LayoutPresetDefinition, LayoutPresetNode } from '../src/lib/domain/types.ts'
import {
  SUPPORTED_PHOTO_COUNTS,
  curatedCollagePresets,
  type CollagePreset,
  type CollageSlot,
} from '../src/lib/layouts/curatedCatalog.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUTPUT = path.join(ROOT, 'src', 'lib', 'layouts', 'definitions')
const EPSILON = 1e-7

interface IndexedSlot extends CollageSlot {
  key: string
}

type Region = CollageSlot

function uniqueCoordinates(values: readonly number[]): number[] {
  return [...values]
    .sort((left, right) => left - right)
    .filter((value, index, sorted) => index === 0 || Math.abs(value - sorted[index - 1]) > EPSILON)
}

function fullCuts(
  slots: readonly IndexedSlot[],
  axis: 'x' | 'y',
  regionStart: number,
  regionLength: number,
): number[] {
  const endKey = axis === 'x' ? 'width' : 'height'
  const regionEnd = regionStart + regionLength
  const candidates = uniqueCoordinates(
    slots.flatMap((slot) => [slot[axis], slot[axis] + slot[endKey]]),
  ).filter((coordinate) => coordinate > regionStart + EPSILON && coordinate < regionEnd - EPSILON)
  return candidates.filter((coordinate) =>
    slots.every(
      (slot) =>
        slot[axis] + slot[endKey] <= coordinate + EPSILON || slot[axis] >= coordinate - EPSILON,
    ),
  )
}

function convertRegion(slots: readonly IndexedSlot[], region: Region): LayoutPresetNode {
  if (slots.length === 1) return { kind: 'leaf', key: slots[0].key }

  const candidates: Array<{ node: LayoutPresetNode; childCount: number; axis: 'x' | 'y' }> = []
  for (const axis of ['x', 'y'] as const) {
    const start = region[axis]
    const length = axis === 'x' ? region.width : region.height
    const cuts = fullCuts(slots, axis, start, length)
    if (cuts.length === 0) continue
    const boundaries = [start, ...cuts, start + length]
    const children: LayoutPresetNode[] = []
    let valid = true
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const lower = boundaries[index]
      const upper = boundaries[index + 1]
      const bandSlots = slots.filter((slot) => {
        const center = slot[axis] + slot[axis === 'x' ? 'width' : 'height'] / 2
        return center > lower - EPSILON && center < upper + EPSILON
      })
      if (bandSlots.length === 0) {
        valid = false
        break
      }
      const childRegion: Region =
        axis === 'x'
          ? { x: lower, y: region.y, width: upper - lower, height: region.height }
          : { x: region.x, y: lower, width: region.width, height: upper - lower }
      children.push(convertRegion(bandSlots, childRegion))
    }
    if (!valid) continue
    candidates.push({
      node: {
        kind: 'split',
        axis,
        weights: boundaries.slice(0, -1).map((value, index) => boundaries[index + 1] - value),
        children,
      },
      childCount: children.length,
      axis,
    })
  }

  if (candidates.length === 0)
    throw new Error(`Layout region with ${slots.length} slots cannot be represented as splits`)
  candidates.sort(
    (left, right) => left.childCount - right.childCount || left.axis.localeCompare(right.axis),
  )
  return candidates[0].node
}

function tagsForPreset(preset: CollagePreset): LayoutPresetDefinition['tags'] {
  const areas = preset.slots.map((slot) => slot.width * slot.height)
  const uniform = Math.max(...areas) - Math.min(...areas) <= EPSILON
  const tags: LayoutPresetDefinition['tags'] = [uniform ? 'uniform' : 'asymmetric']
  const featured = preset.featuredSlots?.map((index) => preset.slots[index]) ?? []
  if (featured.length > 0) {
    const largest = featured.reduce((current, slot) =>
      slot.width * slot.height > current.width * current.height ? slot : current,
    )
    tags.push(largest.width >= largest.height ? 'landscape-led' : 'portrait-led')
  }
  return tags
}

function familyName(family: CollagePreset['family']): string {
  return family
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

export function convertCollagePreset(preset: CollagePreset, index: number): LayoutPresetDefinition {
  const indexedSlots = preset.slots.map((slot, slotIndex) => ({
    ...slot,
    key: `cell-${slotIndex + 1}`,
  }))
  return {
    id: preset.id,
    revision: 1,
    name: `${familyName(preset.family)} ${index + 1}`,
    frameCount: preset.photoCount,
    tags: tagsForPreset(preset),
    root: convertRegion(indexedSlots, { x: 0, y: 0, width: 1, height: 1 }),
  }
}

export function generateLayoutDefinitions(): LayoutPresetDefinition[] {
  const definitions = SUPPORTED_PHOTO_COUNTS.flatMap((photoCount) =>
    curatedCollagePresets
      .filter((preset) => preset.photoCount === photoCount)
      .map((preset, index) => convertCollagePreset(preset, index)),
  )
  if (new Set(definitions.map((preset) => preset.id)).size !== definitions.length)
    throw new Error('Generated layout topology IDs must be unique')
  return definitions
}

function renderPresetFile(photoCount: number, presets: readonly LayoutPresetDefinition[]): string {
  return `// Generated by scripts/generate-layout-presets.ts. Do not edit by hand.\nimport type { LayoutPresetDefinition } from '../../domain/types'\n\n// prettier-ignore\nexport const layout${photoCount}Presets: LayoutPresetDefinition[] = ${JSON.stringify(presets, null, 2)}\n`
}

function renderIndexFile(): string {
  const exports = SUPPORTED_PHOTO_COUNTS.map(
    (photoCount) => `export { layout${photoCount}Presets } from './${photoCount}'`,
  ).join('\n')
  return `// Generated by scripts/generate-layout-presets.ts. Do not edit by hand.\n${exports}\n`
}

function renderOptionalFile(): string {
  const optionalCounts = SUPPORTED_PHOTO_COUNTS.filter((photoCount) => photoCount >= 4)
  const imports = optionalCounts
    .map((photoCount) => `import { layout${photoCount}Presets } from './${photoCount}'`)
    .join('\n')
  const entries = optionalCounts
    .map((photoCount) => `  ${photoCount}: layout${photoCount}Presets,`)
    .join('\n')
  return `// Generated by scripts/generate-layout-presets.ts. Do not edit by hand.\nimport type { LayoutPresetDefinition } from '../../domain/types'\n${imports}\n\nexport const optionalLayouts: Record<number, LayoutPresetDefinition[]> = {\n${entries}\n}\n`
}

export async function generateLayoutFiles(outputDirectory = DEFAULT_OUTPUT): Promise<void> {
  const output = path.resolve(outputDirectory)
  if (!output.startsWith(`${path.resolve(ROOT)}${path.sep}`))
    throw new Error(`Generated layout output must stay inside ${ROOT}`)
  await mkdir(output, { recursive: true })

  const definitions = generateLayoutDefinitions()
  const generatedFiles = new Map<string, string>()
  for (const photoCount of SUPPORTED_PHOTO_COUNTS) {
    const presets = definitions.filter((preset) => preset.frameCount === photoCount)
    generatedFiles.set(`${photoCount}.ts`, renderPresetFile(photoCount, presets))
  }
  generatedFiles.set('index.ts', renderIndexFile())
  generatedFiles.set('optional.ts', renderOptionalFile())

  // Keep every destination readable while generation is in progress. This matters when a
  // dev server or test watcher reloads a module at the same time as this script runs.
  const temporaryFiles: string[] = []
  try {
    for (const [fileName, contents] of generatedFiles) {
      const temporaryPath = path.join(output, `.${fileName}.${process.pid}.tmp`)
      temporaryFiles.push(temporaryPath)
      await writeFile(temporaryPath, contents, 'utf8')
    }
    for (const fileName of generatedFiles.keys()) {
      const temporaryPath = path.join(output, `.${fileName}.${process.pid}.tmp`)
      await rename(temporaryPath, path.join(output, fileName))
      temporaryFiles.splice(temporaryFiles.indexOf(temporaryPath), 1)
    }
  } finally {
    await Promise.all(temporaryFiles.map((temporaryPath) => rm(temporaryPath, { force: true })))
  }

  for (const entry of await readdir(output, { withFileTypes: true }))
    if (entry.isFile() && entry.name.endsWith('.ts') && !generatedFiles.has(entry.name))
      await rm(path.join(output, entry.name), { force: true })

  process.stdout.write(`Generated ${definitions.length} split-tree runtime presets in ${output}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await generateLayoutFiles(process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUTPUT)
