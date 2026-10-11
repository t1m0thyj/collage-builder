import { describe, expect, it } from 'vitest'
import { exportImageFilenames, safeExportBasename } from '../../src/lib/app/exportFilenames'

describe('export filenames', () => {
  it('preserves default filenames and original page numbers for ranges', () => {
    expect(exportImageFilenames('Summer', [1, 2, 99], 'png')).toEqual([
      'Summer-02.png',
      'Summer-03.png',
      'Summer-100.png',
    ])
    expect(
      exportImageFilenames('Summer', [1, 2], 'jpeg', 'Page {number} - {title}', [
        'Cover',
        'Beach',
        'Sunset',
      ]),
    ).toEqual(['Page 02 - Beach.jpg', 'Page 03 - Sunset.jpg'])
  })

  it('substitutes placeholders once even when the title contains placeholder text', () => {
    expect(exportImageFilenames('{number}', [0], 'png')).toEqual(['{number}-01.png'])
    expect(exportImageFilenames('Summer', [0], 'png', '{title}-{number}', ['{number}'])).toEqual([
      '{number}-01.png',
    ])
  })

  it.each(['', '   ', '{unknown}-{number}', '{title}-{number'])(
    'rejects invalid bulk templates: %s',
    (template) => {
      expect(() => exportImageFilenames('Summer', [0, 1], 'png', template)).toThrow()
    },
  )

  it('sanitizes filenames and prevents ZIP paths and Windows device names', () => {
    expect(
      exportImageFilenames('Summer', [0, 1], 'png', '../{title}\\{number}', [
        '../Summer:trip',
        '../Summer:trip',
      ]),
    ).toEqual(['.._.._Summer_trip_01.png', '.._.._Summer_trip_02.png'])
    expect(safeExportBasename('CON')).toBe('_CON')
    expect(safeExportBasename('test\u0000\n')).toBe('test__')
    expect(safeExportBasename('...')).toBe('collage')
  })

  it('rejects duplicate or overly long filenames before rendering', () => {
    expect(() => exportImageFilenames('Summer', [0, 0], 'png')).toThrow('different filename')
    expect(() => exportImageFilenames('Summer', [0], 'png', `${'a'.repeat(241)}{number}`)).toThrow(
      'Shorten',
    )
    expect(() =>
      exportImageFilenames('Summer', [0, 1], 'png', '{title}', ['Cover', 'Cover']),
    ).toThrow('different filename')
    expect(exportImageFilenames('Summer', [0, 1], 'png', '{title}', ['Cover', 'Sunset'])).toEqual([
      'Cover.png',
      'Sunset.png',
    ])
  })
})
