#!/usr/bin/env node
/**
 * Build image derivatives ONCE, at ingest, as static files.
 *
 * There is deliberately no on-demand image CDN on the artwork path. Every one of them
 * degrades colour by default, and the failure is invisible on a developer's monitor:
 *
 *   - sharp strips metadata and converts to sRGB by default — and it is the engine
 *     under next/image, the Vercel image CDN and the Netlify image CDN.
 *   - Cloudflare Polish removes the iCCP chunk, even in lossless mode.
 *   - imgix `auto=compress` removes the colour profile unless `cs=origin` is pinned.
 *   - next/image converts Display-P3 to sRGB, with an open unresolved issue.
 *
 * Two rules make this survivable long-term:
 *   1. `withIccProfile()` is called EXPLICITLY rather than relying on `keepIccProfile`,
 *      so output is deterministic rather than dependent on what the source happened to
 *      carry.
 *   2. Derivatives are never upscaled past the source's native width. An upscaled
 *      derivative is a fabricated version of the work.
 */
import { readdir, readFile, mkdir, stat } from 'node:fs/promises'
import { join, dirname, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const mediaDir = join(root, 'public/media')
const derivedDir = join(mediaDir, 'derived')

const WIDTHS = [640, 960, 1280, 1600, 2000, 2400, 3200]

/** Quality settings. AVIF is never the archival master — the libvips nclx/CICP handling
 *  for wide-gamut AVIF input has a long-standing open issue, so the ORIGINAL always
 *  remains the source of truth and is what the inspection route and press pack serve. */
const ENCODE = {
  avif: (p) => p.avif({ quality: 62, effort: 5, chromaSubsampling: '4:4:4' }),
  webp: (p) => p.webp({ quality: 82, effort: 5 }),
  jpg: (p) => p.jpeg({ quality: 86, chromaSubsampling: '4:4:4', mozjpeg: true }),
}

async function sources() {
  const entries = await readdir(mediaDir, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && /\.(jpe?g|png|tiff?)$/i.test(e.name))
    .map((e) => join(mediaDir, e.name))
}

const files = await sources()
if (files.length === 0) {
  console.error('No source images in public/media/. Run `npm run seed:media` first.')
  process.exit(1)
}

await mkdir(derivedDir, { recursive: true })

let written = 0
let skipped = 0

for (const file of files) {
  const meta = await sharp(file).metadata()
  const name = basename(file, extname(file))
  const srcStat = await stat(file)

  // Never upscale. A derivative wider than the source is an invented image.
  const widths = WIDTHS.filter((w) => w <= meta.width)
  if (widths.length === 0) widths.push(meta.width)

  for (const width of widths) {
    for (const [format, encode] of Object.entries(ENCODE)) {
      const target = join(derivedDir, `${name}-${width}.${format}`)

      // Idempotent: skip when the derivative is newer than its source.
      try {
        const t = await stat(target)
        if (t.mtimeMs >= srcStat.mtimeMs) { skipped++; continue }
      } catch { /* not built yet */ }

      const pipeline = sharp(file)
        .resize({ width, withoutEnlargement: true })
        .withIccProfile('srgb')

      await encode(pipeline).toFile(target)
      written++
    }
  }
  console.log(`${name}: ${widths.length} widths × ${Object.keys(ENCODE).length} formats`)
}

console.log(`\n${written} derivatives written, ${skipped} up to date.`)
console.log('Run `npm run test:colour` to assert every derivative carries its profile.')
