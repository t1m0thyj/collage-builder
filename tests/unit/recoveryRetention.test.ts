import { describe, expect, it } from 'vitest'
import { createProject } from '../../src/lib/domain/factories'
import { maxProjectBytes, maxRecoveryBytes } from '../../src/lib/persistence/limits'
import { recoveryPayloadBytes, retainRecoveries } from '../../src/lib/persistence/recoveryRetention'

function draft(bytes: number, date: string) {
  const document = createProject()
  document.updatedAt = date
  const id = crypto.randomUUID()
  document.assets[id] = {
    id,
    originalName: 'photo.png',
    mediaType: 'image/png',
    byteLength: bytes,
    width: 1,
    height: 1,
    sha256: 'a'.repeat(64),
    storage: { kind: 'embedded', archivePath: `assets/${id}` },
  }
  return document
}

describe('recovery byte and count retention', () => {
  it('keeps the project being saved and evicts oldest copies until the aggregate fits', () => {
    const oldest = draft(800_000_000, '2026-01-01T00:00:00.000Z')
    const newest = draft(800_000_000, '2026-03-01T00:00:00.000Z')
    const current = draft(800_000_000, '2025-01-01T00:00:00.000Z')
    const result = retainRecoveries([oldest, newest, current], current.projectId, new Map())
    expect(result.retained.map((document) => document.projectId)).toEqual([
      current.projectId,
      newest.projectId,
    ])
    expect(result.bytes).toBeLessThanOrEqual(maxRecoveryBytes)
  })
  it('counts UTF-8 document data and thumbnails, not just original bytes', () => {
    const current = draft(maxProjectBytes - 1000, '2026-03-01T00:00:00.000Z')
    const other = draft(maxProjectBytes - 1000, '2026-02-01T00:00:00.000Z')
    current.title = '📷'.repeat(50)
    const previews = new Map([
      [current.projectId, 1000],
      [other.projectId, 1000],
    ])
    expect(recoveryPayloadBytes(current, 1000)).toBe(
      maxProjectBytes + new TextEncoder().encode(JSON.stringify(current)).byteLength,
    )
    expect(retainRecoveries([current, other], current.projectId, previews).retained).toEqual([
      current,
    ])
  })
  it('keeps five small copies and evicts the sixth by age', () => {
    const documents = Array.from({ length: 6 }, (_, index) =>
      draft(1000, `2026-01-0${index + 1}T00:00:00.000Z`),
    )
    const result = retainRecoveries(documents, documents[5].projectId, new Map())
    expect(result.retained).toHaveLength(5)
    expect(result.retained).not.toContain(documents[0])
  })
  it('treats a replacement as one copy and does not mutate the supplied order', () => {
    const current = draft(1000, '2026-01-01T00:00:00.000Z')
    const other = draft(1000, '2026-02-01T00:00:00.000Z')
    const documents = [other, current]
    expect(retainRecoveries(documents, current.projectId, new Map()).retained).toEqual([
      current,
      other,
    ])
    expect(documents).toEqual([other, current])
  })
})
