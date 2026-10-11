import type { ExportFormat } from '../render/exportPng'

export function defaultExportFilenameTemplate(title: string): string {
  return `${(title || 'collage').replaceAll('{', '{{').replaceAll('}', '}}')}-{number}`
}

const templateTokens = /\{\{|\}\}|\{title\}|\{number\}/g

export function safeExportBasename(name: string): string {
  const safe = name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\p{Cc}/gu, '_')
    .trim()
    .replace(/[. ]+$/, '')
  if (!safe) return 'collage'
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe) ? `_${safe}` : safe
}

export function exportImageFilenames(
  title: string,
  indices: readonly number[],
  format: ExportFormat,
  template = defaultExportFilenameTemplate(title),
  pageTitles: readonly string[] = [],
): string[] {
  if (!template.trim()) throw new Error('Enter a filename template')
  if (/[{}]/.test(template.replace(templateTokens, '')))
    throw new Error('Use only {title} and {number} as placeholders')
  const names = indices.map((index) => {
    const stem = safeExportBasename(
      template.replace(templateTokens, (placeholder) => {
        if (placeholder === '{{') return '{'
        if (placeholder === '}}') return '}'
        return placeholder === '{title}'
          ? pageTitles[index] || `Page ${index + 1}`
          : String(index + 1).padStart(2, '0')
      }),
    )
    if (stem.length > 240) throw new Error('Shorten the filename template or project title')
    return `${stem}.${format === 'jpeg' ? 'jpg' : 'png'}`
  })
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length)
    throw new Error('Choose a template that gives each page a different filename')
  return names
}
