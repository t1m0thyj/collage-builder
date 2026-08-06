import { describe, expect, it } from 'vitest'
import { createProject } from '../../src/lib/domain/factories'
import { createArchive, openArchive } from '../../src/lib/persistence/archive'
import { zipSync, strToU8 } from 'fflate'

describe('collage archive', () => {
  it('round trips a document', async () => {
    const document = createProject('Archive test')
    const archive = await createArchive(document, { get: () => undefined })
    const opened = await openArchive(archive)
    expect(opened.document.title).toBe('Archive test')
    expect(opened.document.projectId).toBe(document.projectId)
  })

  it('rejects unsafe archive paths', async () => {
    const archive = new Blob([zipSync({ mimetype: strToU8('application/vnd.collage-builder+zip'), 'document.json': strToU8('{}'), '../unsafe': strToU8('x') })])
    await expect(openArchive(archive)).rejects.toThrow('unsafe path')
  })
})
