export type SidebarTab = 'layouts' | 'images'
export type PageStyleControl =
  | 'padding'
  | 'gap'
  | 'cornerRadius'
  | 'shadow.opacity'
  | 'shadow.blur'
  | 'shadow.distance'
  | 'shadow.angle'

export function clampViewportZoom(zoom: number): number {
  return Math.min(2, Math.max(0.1, zoom))
}
