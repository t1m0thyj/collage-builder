// Per backing surface, including DPR. Konva also owns hit and buffer canvases.
export const maxEditorCanvasPixels = 16_000_000
export const maxEditorCanvasDimension = 8192
const margin = 48

/** Shrink first: Konva applies width and height separately, allocating at each step. */
export function prepareEditorResize(
  stage: {
    width(): number
    height(): number
    size(value: { width: number; height: number }): void
  },
  next: { width: number; height: number },
): void {
  const width = Math.min(stage.width(), next.width)
  const height = Math.min(stage.height(), next.height)
  if (width !== stage.width() || height !== stage.height()) stage.size({ width, height })
}

/** Bound the full-document stage until viewport rendering replaces it. */
export function editorSurface(
  page: { width: number; height: number },
  viewport: { width: number; height: number },
  requestedZoom: number,
  pixelRatio: number,
) {
  // Hit canvases always use ratio 1, even when scene canvases use a lower ratio.
  const ratio = Math.max(1, Number.isFinite(pixelRatio) ? pixelRatio : 1)
  const maxDimension = Math.max(1, Math.floor(maxEditorCanvasDimension / ratio))
  const maxPixels = maxEditorCanvasPixels / ratio ** 2
  let viewportWidth = Math.min(maxDimension, Math.max(1, Math.floor(viewport.width)))
  let viewportHeight = Math.min(maxDimension, Math.max(1, Math.floor(viewport.height)))
  if (viewportWidth * viewportHeight > maxPixels) {
    const factor = Math.sqrt(maxPixels / (viewportWidth * viewportHeight))
    viewportWidth = Math.max(1, Math.floor(viewportWidth * factor))
    viewportHeight = Math.max(1, Math.floor(viewportHeight * factor))
  }
  const size = (zoom: number) => ({
    width: Math.max(viewportWidth, Math.ceil(page.width * zoom + margin)),
    height: Math.max(viewportHeight, Math.ceil(page.height * zoom + margin)),
  })
  const fits = (zoom: number) => {
    const { width, height } = size(zoom)
    return width <= maxDimension && height <= maxDimension && width * height <= maxPixels
  }
  let zoom = Math.max(0, Number.isFinite(requestedZoom) ? requestedZoom : 0)
  if (!fits(zoom)) {
    let low = 0
    let high = zoom
    for (let iteration = 0; iteration < 48; iteration++) {
      const middle = (low + high) / 2
      if (fits(middle)) low = middle
      else high = middle
    }
    zoom = low
  }
  return { ...size(zoom), zoom, limited: zoom < requestedZoom }
}
