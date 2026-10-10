export type ProjectOperationKind = 'save' | 'open' | 'recovery'

export interface ProjectOperation {
  id: number
  kind: ProjectOperationKind
  phase: string
  completed?: number
  total?: number
  detail?: string
  indeterminate?: boolean
}

export function operationPercent(operation: ProjectOperation): number | undefined {
  if (!operation.total || operation.indeterminate) return undefined
  return Math.max(
    0,
    Math.min(100, Math.round(((operation.completed ?? 0) / operation.total) * 100)),
  )
}

export function formatOperationBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = units[0]
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024
    unit = units[index]
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`
}
