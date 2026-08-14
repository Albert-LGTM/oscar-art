#!/usr/bin/env node
/**
 * Social cards — 1200 × 630, LETTERBOXED, never cropped.
 *
 * The primary distribution channel for an artist is a curator forwarding a link. If it
 * previews as a bare URL, the first five seconds are spent on nothing — which is
 * precisely what the reference research found on johanbechjespersen.com: no
 * description, no Open Graph, no card anywhere on the site.
 *
 * The rule that makes this different from every other OG-image generator: the artwork
 * is FITTED, not filled. `fit: 'contain'` on a neutral field, never `cover`. A social
 * card is still a reproduction of the work, and the project's hard constraint does not
 * pause because the surface is a chat client. Cropping a 3:2 installation view to 1.91:1
 * for someone's link preview is exactly the casual damage the whole pipeline exists to
 * prevent.
 *
 * Consequences accepted deliberately:
 *   - Tall/portrait works get wide neutral margins. That is correct: the proportions of
 *     the work survive, and the card reads as a mounted plate rather than a banner.
 *   - JPEG, not AVIF/WebP. Many link-preview scrapers still do not decode either, and a
 *     card nobody can render is worse than a slightly larger one.
 */
import { mkdir, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { declaredImages } from './lib/declared-images.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mediaDir = join(root, 'public/media')
const outDir = join(mediaDir, 'social')

/** Open Graph's expected size. 1.91:1. */
const W = 1200
const H = 630

/**
 * The neutral field. Chroma 0, matching the plate ground — so the card carries the same
 * colorimetric promise as the site. A tinted or branded background would shift the
 * perceived colour of the work in the one context where the viewer has no way to
 * check it.
 */
const GROUND = { r: 233, g: 233, b: 233 }


const images = await declaredImages()
if (images.length === 0) {
  console.error('No images declared. Run `npm run seed:media` first.')
  process.exit(1)
}

await mkdir(outDir, { recursive: true })
let written = 0
let skipped = 0

for (const img of images) {
  const source = join(mediaDir, img.src.replace(/^\/media\//, ''))
  const target = join(outDir, `${img.id}.jpg`)

  try {
    const [s, t] = await Promise.all([stat(source), stat(target)])
    if (t.mtimeMs >= s.mtimeMs) { skipped++; continue }
  } catch { /* source missing is fatal below; target missing is the normal case */ }

  try {
    await sharp(source)
      // `contain`, never `cover`. This single option is the whole point of the file.
      .resize(W, H, { fit: 'contain', background: GROUND })
      .flatten({ background: GROUND })
      .jpeg({ quality: 82, chromaSubsampling: '4:4:4', mozjpeg: true })
      .withIccProfile('srgb')
      .toFile(target)
    written++
  } catch (err) {
    console.error(`  ${img.id}: ${err.message}`)
    process.exit(1)
  }
}

console.log(`✓ ${written} social cards written, ${skipped} up to date (1200×630, letterboxed, never cropped)`)
