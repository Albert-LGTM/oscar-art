/**
 * Image derivative addressing.
 *
 * Derivatives are produced ONCE at ingest by scripts/build-derivatives.mjs and served
 * as static files. There is deliberately no on-demand image CDN on the artwork path,
 * because every one of them destroys colour by default and the failure is invisible on
 * a developer's monitor:
 *
 *   - sharp strips metadata and converts to sRGB by default — and it is the engine
 *     under next/image, the Vercel image CDN and the Netlify image CDN.
 *   - Cloudflare Polish removes the iCCP chunk, even in lossless mode.
 *   - imgix `auto=compress` removes the colour profile unless `cs=origin` is pinned.
 *   - next/image converts Display-P3 to sRGB, with an open unresolved issue.
 *
 * `npm run test:colour` asserts every derivative still carries the expected profile and
 * fails the build otherwise. That assertion — not this module — is what makes
 * "colour-faithful" survive a dependency bump.
 */

/** Widths generated for every plate. Hard-capped at the source's native width: an
 *  upscaled derivative is a fabricated version of the work. */
export const WIDTHS = [640, 960, 1280, 1600, 2000, 2400, 3200] as const

export const FORMATS = ['avif', 'webp', 'jpg'] as const
export type Format = (typeof FORMATS)[number]

export const MIME: Record<Format, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
}

/** Derivative path for one source, one width, one format. Stable and content-addressed
 *  by the source's own basename so a re-ingest is idempotent. */
export function derivativePath(src: string, width: number, format: Format): string {
  const base = src.replace(/^\/media\//, '').replace(/\.[^.]+$/, '')
  return `/media/derived/${base}-${width}.${format}`
}

/** Widths actually available for a source, never exceeding its native width. */
export function availableWidths(nativeWidth: number): number[] {
  const fitting = WIDTHS.filter((w) => w <= nativeWidth)
  // Always offer at least one derivative, even for a small archive scan.
  return fitting.length > 0 ? [...fitting] : [Math.min(nativeWidth, WIDTHS[0])]
}

export function srcset(src: string, nativeWidth: number, format: Format): string {
  return availableWidths(nativeWidth)
    .map((w) => `${derivativePath(src, w, format)} ${w}w`)
    .join(', ')
}

/**
 * The JPEG fallback `src`. Deliberately a mid-range width rather than the largest:
 * this attribute is only ever used by a browser that supports neither AVIF nor WebP,
 * which in practice means something old and probably slow.
 */
export function fallbackSrc(src: string, nativeWidth: number): string {
  const widths = availableWidths(nativeWidth)
  const mid = widths[Math.min(1, widths.length - 1)]!
  return derivativePath(src, mid, 'jpg')
}
