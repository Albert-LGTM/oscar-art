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

/**
 * `sizes` values, derived from the ACTUAL layout rather than guessed.
 *
 * This is not a micro-optimisation. `sizes` is what the browser uses to choose a
 * candidate, and an inaccurate value is not a rounding error — it is a multiplier on
 * how many pixels have to be DECODED before the page can paint.
 *
 * The first cut passed `76vw` for a plate that is actually constrained by
 * `.shell { max-width: 84rem }`. On a 3840px monitor that resolved to 2918px, so the
 * browser fetched the 3200w derivative and decoded ~6.8 megapixels in order to paint
 * an image 1160px wide — roughly SEVEN TIMES the pixels needed. Chromium absorbed it;
 * Firefox, whose AVIF decode path is slower, spent seconds on it per navigation.
 *
 * The arithmetic, so the next person can check it rather than trust it:
 *   .shell   max-width 84rem = 1344px, padding clamp(1rem, 4vw, 3rem) → 96px at large
 *   plate    mat padding clamp(1rem, 3vw, 2.75rem) → 88px at large
 *   ⇒ a plate inside .shell is at most 1344 − 96 − 88 = 1160px wide, ever.
 *
 * If either of those values changes, these strings must change with them.
 */
export const SIZES = {
  /**
   * A plate inside `.shell` — every record route. Hard-capped at 1160px because the
   * container is, so above ~84rem the viewport width is irrelevant.
   */
  record:
    '(min-width: 84rem) 1160px, ' +
    // 86vw, not `calc(100vw - 184px)`. The 184px constant assumed BOTH clamps at their
    // maximum (2x48 shell + 2x44 mat), which only holds above ~1200px. Between 768 and
    // 1344px the real chrome is 2x4vw + 2x3vw = 14vw, so the constant under-stated the
    // box and the browser fetched a derivative SMALLER than the display size — meaning
    // the artwork was being upscaled on exactly the widths a laptop uses.
    '(min-width: 48rem) 86vw, ' +
    'calc(100vw - 64px)',

  /**
   * The home frontispiece — full-bleed, outside `.shell`, so it genuinely does scale
   * with the viewport. Capped at 2000px: beyond that the extra decode cost buys
   * nothing a viewer can see at normal distance, and the plan's LCP budget is 250 KB.
   */
  frontispiece: '(min-width: 2000px) 2000px, calc(100vw - 88px)',

  /** Index thumbnails, when the sheet gains imagery. */
  thumb: '(min-width: 48rem) 240px, 40vw',
} as const

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
  return `/derived/${base}-${width}.${format}`
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
