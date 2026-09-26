/** Aggregate stored-asset budget for a project archive. */
export const maxProjectBytes = 1024 * 1024 * 1024
/** Leave two ZIP entries for the format marker and document. */
export const maxProjectAssetCount = 4094
export const maxArchiveEntryCount = maxProjectAssetCount + 2
