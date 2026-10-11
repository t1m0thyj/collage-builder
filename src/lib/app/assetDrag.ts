const assetMimeType = 'application/x-collage-asset'
const assetTextPrefix = 'collage-builder:asset:'

export function writeAssetDragData(transfer: DataTransfer | null, assetId: string) {
  if (!transfer) return
  transfer.setData(assetMimeType, assetId)
  // Native WebKit drags can discard custom MIME data while preserving plain text.
  transfer.setData('text/plain', `${assetTextPrefix}${assetId}`)
  transfer.effectAllowed = 'copy'
}

export function readAssetDragData(transfer: DataTransfer | null): string | undefined {
  if (!transfer) return
  const assetId = transfer.getData(assetMimeType)
  if (assetId) return assetId
  const text = transfer.getData('text/plain')
  return text.startsWith(assetTextPrefix) ? text.slice(assetTextPrefix.length) : undefined
}
