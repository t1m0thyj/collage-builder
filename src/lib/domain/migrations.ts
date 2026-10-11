import { collageDocumentSchema } from './schema'
import { assertDocumentStructure } from './documentLimits'
import { assertDocumentInvariants } from './invariants'
import type { CollageDocumentV1 } from './types'

/** Central migration boundary. Add one explicit function per future schema version. */
export function migrateDocument(input: unknown): CollageDocumentV1 {
  assertDocumentStructure(input)
  const parsed = collageDocumentSchema.safeParse(input)
  if (!parsed.success)
    throw new Error(
      `Invalid project document: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
    )
  const document = parsed.data as CollageDocumentV1
  assertDocumentInvariants(document)
  return document
}
