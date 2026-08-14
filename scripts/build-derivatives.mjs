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
import { mkdir, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { declaredImages } from './lib/declared-images.mjs'

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

/*
 * Sources come from the CONTENT DECLARATIONS, not from a directory scan.
 *
 * This used to be a flat `readdir` of public/media/, which was wrong in both directions.
 * A file sitting in the folder but declared by nothing still got 21 derivatives built and
 * shipped; and a declared file in a SUBDIRECTORY — public/media/demo/… — got none at all,
 * silently, so thirteen images resolved to 404 with a green build.
 *
 * `declaredImages()` is already the single source of truth for seed-media and
 * build-social. Reading it here too means the set of files that exist is the set the
 * archive actually references — the same fix, applied to the last script that had grown
 * its own private walk.
 */
const images = await declaredImages()
if (images.length === 0) {
  console.error('No images declared by any work or showing. Nothing to build.')
  process.exit(1)
}

await mkdir(derivedDir, { recursive: true })

let written = 0
let skipped = 0
let missing = 0

for (const img of images) {
  const rel = img.src.replace(/^\/media\//, '')
  const file = join(mediaDir, rel)
  // Mirrors `derivativePath()` in src/lib/image.ts, which strips /media/ and the
  // extension — so a nested source keeps its subdirectory under derived/ and the two
  // sides agree on the URL.
  const stem = rel.replace(/\.[^.]+$/, '')

  let srcStat
  try {
    srcStat = await stat(file)
  } catch {
    // Declared but absent. Fail loudly rather than shipping a record whose plate 404s.
    console.error(`  MISSING SOURCE: ${img.src} (declared as "${img.id}")`)
    missing++
    continue
  }

  const meta = await sharp(file).metadata()
  await mkdir(dirname(join(derivedDir, stem)), { recursive: true })

  // Never upscale. A derivative wider than the source is an invented image.
  const widths = WIDTHS.filter((w) => w <= meta.width)
  if (widths.length === 0) widths.push(meta.width)

  for (const width of widths) {
    for (const [format, encode] of Object.entries(ENCODE)) {
      const target = join(derivedDir, `${stem}-${width}.${format}`)

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
  console.log(`${img.id}: ${widths.length} widths × ${Object.keys(ENCODE).length} formats`)
}

if (missing > 0) {
  console.error(`\n✗ ${missing} declared image(s) have no source file.`)
  process.exit(1)
}

console.log(`\n${written} derivatives written, ${skipped} up to date.`)
console.log('Run `npm run test:colour` to assert every derivative carries its profile.')
