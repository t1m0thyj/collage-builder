import { describe, expect, it } from 'vitest'
import { readAssetDragData, writeAssetDragData } from '../../src/lib/app/assetDrag'

function transfer() {
  const data = new Map<string, string>()
  return {
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => data.set(type, value),
    clearData: (type: string) => data.delete(type),
    effectAllowed: 'none',
  } as unknown as DataTransfer
}

describe('asset drag data', () => {
  it('preserves the asset when a native drag discards custom MIME data', () => {
    const data = transfer()
    writeAssetDragData(data, 'photo-id')
    expect(readAssetDragData(data)).toBe('photo-id')
    data.clearData('application/x-collage-asset')
    expect(readAssetDragData(data)).toBe('photo-id')
    expect(data.effectAllowed).toBe('copy')
  })

  it('ignores ordinary text and absent drag data', () => {
    const data = transfer()
    data.setData('text/plain', 'photo-id')
    expect(readAssetDragData(data)).toBeUndefined()
    expect(readAssetDragData(null)).toBeUndefined()
    expect(() => writeAssetDragData(null, 'photo-id')).not.toThrow()
  })
})
