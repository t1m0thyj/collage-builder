/** Aggregate stored-asset budget for a project archive. */
export const maxProjectBytes = 1024 * 1024 * 1024
/** Leave two ZIP entries for the format marker and document. */
export const maxProjectAssetCount = 4094
export const maxArchiveEntryCount = maxProjectAssetCount + 2
/** Total recovery payload budget, separate from the bounded derived-preview cache. */
export const maxRecoveryBytes = 2 * 1024 * 1024 * 1024
export const maxRecoveryCount = 5
