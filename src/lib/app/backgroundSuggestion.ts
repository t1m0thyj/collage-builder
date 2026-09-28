type Rgb = readonly [number, number, number]
type Lab = { lightness: number; a: number; b: number }

interface Swatch {
  rgb: Rgb
  lab: Lab
  weight: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function hueAndSaturation([red, green, blue]: Rgb): {
  hue: number
  saturation: number
  lightness: number
} {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const lightness = (max + min) / 2
  if (!delta) return { hue: 0, saturation: 0, lightness }
  let hue =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  hue = (hue * 60 + 360) % 360
  return { hue, saturation: delta / (1 - Math.abs(2 * lightness - 1)), lightness }
}

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const sector = (((hue % 360) + 360) % 360) / 60
  const second = chroma * (1 - Math.abs((sector % 2) - 1))
  const offset = lightness - chroma / 2
  const channels =
    sector < 1
      ? [chroma, second, 0]
      : sector < 2
        ? [second, chroma, 0]
        : sector < 3
          ? [0, chroma, second]
          : sector < 4
            ? [0, second, chroma]
            : sector < 5
              ? [second, 0, chroma]
              : [chroma, 0, second]
  return [
    Math.round((channels[0] + offset) * 255),
    Math.round((channels[1] + offset) * 255),
    Math.round((channels[2] + offset) * 255),
  ]
}

function toLinear(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

function toLab([red, green, blue]: Rgb): Lab {
  const r = toLinear(red)
  const g = toLinear(green)
  const b = toLinear(blue)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

function labDistance(first: Lab, second: Lab): number {
  return Math.hypot(first.lightness - second.lightness, first.a - second.a, first.b - second.b)
}

function dominantSwatches(samples: readonly Rgb[]): Swatch[] {
  const bins = new Map<string, { count: number; red: number; green: number; blue: number }>()
  for (const color of samples) {
    const { hue, saturation, lightness } = hueAndSaturation(color)
    const key =
      saturation < 0.12
        ? `neutral:${Math.floor(lightness * 4)}`
        : `${Math.floor(hue / 30)}:${Math.floor(lightness * 3)}`
    const bin = bins.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 }
    bin.count++
    bin.red += color[0]
    bin.green += color[1]
    bin.blue += color[2]
    bins.set(key, bin)
  }
  const leaders = [...bins.values()].sort((left, right) => right.count - left.count).slice(0, 3)
  const total = leaders.reduce((sum, bin) => sum + bin.count, 0)
  return leaders.map((bin) => {
    const rgb: Rgb = [bin.red / bin.count, bin.green / bin.count, bin.blue / bin.count]
    return { rgb, lab: toLab(rgb), weight: bin.count / total }
  })
}

function hex([red, green, blue]: Rgb): string {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`
}

/** Each image contributes equally, even when its source dimensions differ. */
export function suggestBackgroundFromSamples(images: readonly (readonly Rgb[])[]): string | null {
  const palettes = images.map(dominantSwatches).filter((swatches) => swatches.length)
  if (!palettes.length) return null
  const swatches = palettes.flatMap((palette) =>
    palette.map((swatch) => ({ ...swatch, weight: swatch.weight / palettes.length })),
  )
  const chromatic = swatches
    .map((swatch) => ({ ...swatch, ...hueAndSaturation(swatch.rgb) }))
    .filter((swatch) => swatch.saturation >= 0.12)
    .sort((left, right) => right.weight * right.saturation - left.weight * left.saturation)
    .slice(0, 8)
  const strongest = chromatic[0]
  const prominent = strongest
    ? chromatic.filter(
        (swatch) =>
          swatch.weight * swatch.saturation >= strongest.weight * strongest.saturation * 0.25,
      )
    : []
  const hues = new Set<number>(prominent.length ? [] : [30, 210])
  for (const swatch of prominent) {
    for (const offset of [-35, -20, 0, 20, 35])
      hues.add((Math.round((swatch.hue + offset) / 10) * 10 + 360) % 360)
  }
  if (prominent.length) {
    const x = prominent.reduce(
      (sum, swatch) => sum + Math.cos((swatch.hue * Math.PI) / 180) * swatch.weight,
      0,
    )
    const y = prominent.reduce(
      (sum, swatch) => sum + Math.sin((swatch.hue * Math.PI) / 180) * swatch.weight,
      0,
    )
    if (Math.hypot(x, y) > 0.01)
      hues.add((Math.round((Math.atan2(y, x) * 180) / Math.PI / 10) * 10 + 360) % 360)
  }

  const averageLightness = swatches.reduce(
    (sum, swatch) => sum + swatch.lab.lightness * swatch.weight,
    0,
  )
  const preferredLightness = clamp(0.74 - 0.25 * averageLightness, 0.48, 0.68)
  let best: { color: Rgb; score: number } | null = null
  for (const hue of hues) {
    for (const saturation of chromatic.length ? [0.18, 0.28, 0.38] : [0.08, 0.16]) {
      for (const lightness of [0.42, 0.54, 0.66]) {
        const color = hslToRgb(hue, saturation, lightness)
        const lab = toLab(color)
        const score =
          swatches.reduce((sum, swatch) => {
            const distance = labDistance(lab, swatch.lab)
            return (
              sum +
              swatch.weight *
                ((distance - 0.22) ** 2 +
                  1.5 * Math.max(0, 0.12 - distance) ** 2 +
                  Math.max(0, distance - 0.36) ** 2)
            )
          }, 0) +
          0.15 * (lab.lightness - preferredLightness) ** 2
        if (!best || score < best.score) best = { color, score }
      }
    }
  }
  return best ? hex(best.color) : null
}

export function suggestBackgroundFromImages(images: readonly HTMLImageElement[]): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  const samples = images.map((image) => {
    context.clearRect(0, 0, 32, 32)
    context.drawImage(image, 0, 0, 32, 32)
    const data = context.getImageData(0, 0, 32, 32).data
    const colors: Rgb[] = []
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] < 128) continue
      colors.push([data[index], data[index + 1], data[index + 2]])
    }
    return colors
  })
  return suggestBackgroundFromSamples(samples)
}
