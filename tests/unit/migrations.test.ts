import { describe, expect, it } from 'vitest'
import { createProject } from '../../src/lib/domain/factories'
import { migrateDocument } from '../../src/lib/domain/migrations'

describe('document migration boundary', () => {
  it('accepts the current document version', () =>
    expect(migrateDocument(createProject()).schemaVersion).toBe(1))
  it('rejects an unsupported document', () =>
    expect(() => migrateDocument({ schemaVersion: 99 })).toThrow('Invalid project document'))
})
