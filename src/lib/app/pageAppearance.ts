import type { PageV1 } from '../domain/types'
import type { ProjectStore } from '../state/projectStore'

export function shadowDistance(page: PageV1): number {
  return Math.round(Math.hypot(page.style.shadow.offsetX, page.style.shadow.offsetY))
}

export function shadowAngle(page: PageV1): number {
  return Math.round(
    ((Math.atan2(page.style.shadow.offsetY, page.style.shadow.offsetX) * 180) / Math.PI -
      135 +
      360) %
      360,
  )
}

export function updateShadowPolar(
  project: ProjectStore,
  page: PageV1,
  distance = shadowDistance(page),
  angle = shadowAngle(page),
): void {
  const radians = ((angle + 135) * Math.PI) / 180
  project.setPageStyle(page.id, {
    shadow: {
      ...page.style.shadow,
      offsetX: Math.round(Math.cos(radians) * distance * 100) / 100,
      offsetY: Math.round(Math.sin(radians) * distance * 100) / 100,
    },
  })
}

export function resizePage(
  project: ProjectStore,
  page: PageV1,
  axis: 'width' | 'height',
  value: number,
  aspectLinked: boolean,
): void {
  if (!Number.isFinite(value)) return
  const aspectRatio = page.width / page.height
  const width =
    axis === 'width' ? value : aspectLinked ? Math.round(value * aspectRatio) : page.width
  const height =
    axis === 'height' ? value : aspectLinked ? Math.round(value / aspectRatio) : page.height
  project.resizePage(page.id, width, height)
}
