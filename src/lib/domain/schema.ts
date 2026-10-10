import { z } from 'zod'
import { maxImageDimension, maxImagePixels } from './imageLimits'
import { pageDimensionError } from './pageLimits'

const finiteNumber = z.number().finite()
const nonNegative = finiteNumber.nonnegative()
const color = z.string().regex(/^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/)
const imageDimension = z.number().int().positive().max(maxImageDimension)

export const layoutNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('leaf'),
      slotId: z.string().uuid(),
      polygon: z
        .array(z.object({ x: finiteNumber.min(0).max(1), y: finiteNumber.min(0).max(1) }))
        .min(3)
        .optional(),
    }),
    z
      .object({
        kind: z.literal('split'),
        axis: z.enum(['x', 'y']),
        weights: z.array(finiteNumber.positive()).min(2),
        children: z.array(layoutNodeSchema).min(2),
      })
      .refine(
        (value) => value.weights.length === value.children.length,
        'Split weights must match its children',
      ),
    z.object({
      kind: z.literal('grid'),
      columns: z.number().int().positive(),
      rows: z.number().int().positive(),
      cells: z
        .array(
          z.object({
            slotId: z.string().uuid(),
            x: z.number().int().nonnegative(),
            y: z.number().int().nonnegative(),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          }),
        )
        .min(1),
    }),
  ]),
)

export const collageDocumentSchema = z.object({
  format: z.literal('collage-builder'),
  schemaVersion: z.literal(1),
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  pages: z
    .array(
      z
        .object({
          id: z.string().uuid(),
          name: z.string().trim().min(1).max(200),
          width: finiteNumber.positive(),
          height: finiteNumber.positive(),
          layout: z.object({
            presetId: z.string().min(1),
            presetRevision: z.number().int().positive(),
            root: layoutNodeSchema,
          }),
          slots: z.record(
            z.string().uuid(),
            z
              .object({
                assetId: z.string().uuid(),
                placement: z.object({
                  zoom: finiteNumber.min(1).max(8),
                  positionX: finiteNumber.min(0).max(1),
                  positionY: finiteNumber.min(0).max(1),
                  rotation: z
                    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
                    .default(0),
                  flipHorizontal: z.boolean().default(false),
                  flipVertical: z.boolean().default(false),
                }),
              })
              .nullable(),
          ),
          style: z.object({
            backgroundColor: color,
            transparentBackground: z.boolean().default(false),
            padding: nonNegative,
            gap: nonNegative,
            cornerRadius: nonNegative,
            shadow: z.object({
              enabled: z.boolean(),
              color: z.string().regex(/^#[0-9A-F]{6}$/),
              opacity: finiteNumber.min(0).max(1),
              blur: nonNegative,
              offsetX: finiteNumber,
              offsetY: finiteNumber,
            }),
          }),
        })
        .superRefine((page, context) => {
          const message = pageDimensionError(page.width, page.height)
          if (message) context.addIssue({ code: 'custom', message, path: ['width'] })
        }),
    )
    .min(1),
  assets: z.record(
    z.string().uuid(),
    z
      .object({
        id: z.string().uuid(),
        originalName: z.string().min(1),
        mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
        byteLength: z.number().int().nonnegative(),
        width: imageDimension,
        height: imageDimension,
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        storage: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('embedded'), archivePath: z.string().startsWith('assets/') }),
          z.object({
            kind: z.literal('linked'),
            displayHint: z.string().min(1),
            relativePath: z.string().min(1).optional(),
            lastModified: z.number().int().optional(),
          }),
        ]),
      })
      .refine((asset) => asset.width * asset.height <= maxImagePixels, {
        message: 'Image dimensions exceed the 100 megapixel limit',
      }),
  ),
  exportDefaults: z.object({
    width: finiteNumber.positive(),
    height: finiteNumber.positive(),
    aspectLocked: z.boolean(),
  }),
})
