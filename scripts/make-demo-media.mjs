#!/usr/bin/env node
/**
 * Synthetic documentation for the DEMONSTRATION records.
 *
 * The instruments this site is built around — the iteration ledger, the to-scale floor
 * plan, the ordered viewpoint traversal, the grid that adapts to the media rather than
 * the reverse — are invisible with a two-work archive that has no showings. They cannot
 * be judged from a description; they have to be looked at. So the demo records need
 * images.
 *
 * Two things they must NOT be:
 *
 *   1. Real photographs of the artist's work. Attaching Oscar de Palo's actual
 *      documentation to invented exhibitions at invented venues would fabricate exactly
 *      the fact the whole content model exists to protect.
 *   2. Anything that could pass for a photograph. These are drawings — flat tone, hard
 *      geometry, a scale figure — legible as diagrams at a glance and labelled in the
 *      image itself.
 *
 * What they DO carry faithfully is geometry: real installation-documentation aspect
 * ratios, from 2.6:1 panoramic to 3:4 portrait, so the plate, the mat, the contact sheet
 * and the social card are exercised against the spread they will meet in practice. Every
 * file goes through the same colour-managed path as real artwork — explicit
 * `withIccProfile('srgb')`, 4:4:4 chroma — so the ICC assertion covers them too rather
 * than silently exempting a third of the archive.
 *
 * Run: npm run demo:media     (idempotent; skips files already present)
 */
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public/media/demo')

/**
 * Each entry is one plate. Dimensions span the aspect range an installation archive
 * actually holds: a 2.6:1 panoramic run of a long room, 3:2 and 4:3 establishing views,
 * a 3:4 portrait entrance view (the mobile-frontispiece case), and a square detail.
 */
const PLATES = [
  // Standing Water — 2019, small room
  { id: 'sw-2019-01', w: 2400, h: 1600, tone: 'daylight', scene: 'room' },
  { id: 'sw-2019-02', w: 1500, h: 2000, tone: 'daylight', scene: 'portrait' },
  { id: 'sw-2019-03', w: 1800, h: 1800, tone: 'daylight', scene: 'detail' },
  // Standing Water — 2021, large room
  { id: 'sw-2021-01', w: 2600, h: 1400, tone: 'ambient', scene: 'room' },
  { id: 'sw-2021-02', w: 2400, h: 1600, tone: 'ambient', scene: 'oblique' },
  { id: 'sw-2021-03', w: 1800, h: 1800, tone: 'ambient', scene: 'detail' },
  // Standing Water — 2023, medium room
  { id: 'sw-2023-01', w: 2400, h: 1800, tone: 'low', scene: 'room' },
  { id: 'sw-2023-02', w: 2400, h: 1600, tone: 'low', scene: 'oblique' },
  // Nightshift — blackout
  { id: 'ns-2021-01', w: 2400, h: 1600, tone: 'blackout', scene: 'room' },
  { id: 'ns-2021-02', w: 1500, h: 2000, tone: 'blackout', scene: 'portrait' },
  { id: 'ns-2021-03', w: 1800, h: 1800, tone: 'blackout', scene: 'detail' },
  // The Long Room — panoramic
  { id: 'tlr-2023-01', w: 3200, h: 1230, tone: 'daylight', scene: 'panorama' },
  { id: 'tlr-2023-02', w: 2400, h: 1600, tone: 'daylight', scene: 'oblique' },
]

/**
 * Palettes. `blackout` is genuinely dark, because a blackout installation photographs
 * dark and the layout has to survive a plate close in value to the dark-theme page
 * ground — a real design case, not a decorative choice.
 */
const TONES = {
  daylight: { wall: '#d9d7d2', floor: '#b9b6b0', form: '#4a4844', accent: '#8f8b83', figure: '#6d6a65' },
  ambient: { wall: '#c9c7c3', floor: '#a5a29c', form: '#3d3b38', accent: '#7d7a73', figure: '#5e5b57' },
  low: { wall: '#8e8c88', floor: '#6f6d69', form: '#2b2a28', accent: '#57544f', figure: '#403e3b' },
  blackout: { wall: '#2a2a2c', floor: '#1c1c1e', form: '#0e0e10', accent: '#5b6470', figure: '#3a3c40' },
}

/** A person, ~1.7 m, for scale — the same information the scale rule carries beside the
 *  plate, placed inside the picture as installation documentation conventionally does. */
function figure(x, groundY, hPx, fill) {
  const headR = hPx * 0.075
  const bodyW = hPx * 0.17
  return `
    <circle cx="${x}" cy="${groundY - hPx + headR}" r="${headR}" fill="${fill}"/>
    <path d="M ${x - bodyW / 2} ${groundY}
             L ${x - bodyW / 2} ${groundY - hPx + headR * 2.4}
             Q ${x} ${groundY - hPx + headR * 1.5} ${x + bodyW / 2} ${groundY - hPx + headR * 2.4}
             L ${x + bodyW / 2} ${groundY} Z" fill="${fill}"/>`
}

function scene(kind, w, h, c) {
  const horizon = Math.round(h * (kind === 'panorama' ? 0.56 : 0.62))
  const g = []
  g.push(`<rect width="${w}" height="${h}" fill="${c.wall}"/>`)
  g.push(`<rect y="${horizon}" width="${w}" height="${h - horizon}" fill="${c.floor}"/>`)

  if (kind === 'detail') {
    // No figure: a detail plate genuinely has no scale reference, which is why its role
    // is recorded as `detail` rather than pretending otherwise.
    g.push(`<rect x="${w * 0.16}" y="${h * 0.2}" width="${w * 0.68}" height="${h * 0.6}" fill="${c.form}"/>`)
    g.push(`<rect x="${w * 0.24}" y="${h * 0.3}" width="${w * 0.2}" height="${h * 0.4}" fill="${c.accent}" opacity="0.55"/>`)
    return g.join('')
  }

  if (kind === 'panorama') {
    const n = 5
    for (let i = 0; i < n; i++) {
      const x = w * (0.08 + i * 0.185)
      const fh = h * (0.3 - i * 0.02)
      g.push(`<rect x="${x}" y="${horizon - fh}" width="${w * 0.055}" height="${fh}" fill="${c.form}"/>`)
      g.push(`<rect x="${x}" y="${horizon}" width="${w * 0.055}" height="${fh * 0.32}" fill="${c.form}" opacity="0.2"/>`)
    }
    g.push(figure(w * 0.9, horizon + h * 0.13, h * 0.3, c.figure))
    return g.join('')
  }

  if (kind === 'portrait') {
    g.push(`<rect x="${w * 0.2}" y="${h * 0.16}" width="${w * 0.6}" height="${horizon - h * 0.16}" fill="${c.form}"/>`)
    g.push(`<ellipse cx="${w * 0.5}" cy="${horizon + h * 0.1}" rx="${w * 0.42}" ry="${h * 0.05}" fill="${c.accent}" opacity="0.4"/>`)
    g.push(figure(w * 0.86, horizon + h * 0.19, h * 0.3, c.figure))
    return g.join('')
  }

  if (kind === 'oblique') {
    g.push(`<path d="M ${w * 0.1} ${horizon} L ${w * 0.52} ${horizon - h * 0.34} L ${w * 0.74} ${horizon - h * 0.3} L ${w * 0.36} ${horizon + h * 0.06} Z" fill="${c.form}"/>`)
    g.push(`<rect x="${w * 0.62}" y="${horizon - h * 0.46}" width="${w * 0.06}" height="${h * 0.46}" fill="${c.accent}" opacity="0.5"/>`)
    g.push(figure(w * 0.88, horizon + h * 0.16, h * 0.34, c.figure))
    return g.join('')
  }

  // `room` — a frontal establishing view.
  g.push(`<rect x="${w * 0.22}" y="${horizon - h * 0.36}" width="${w * 0.4}" height="${h * 0.36}" fill="${c.form}"/>`)
  g.push(`<ellipse cx="${w * 0.42}" cy="${horizon + h * 0.09}" rx="${w * 0.3}" ry="${h * 0.055}" fill="${c.accent}" opacity="0.45"/>`)
  g.push(`<rect x="${w * 0.7}" y="${horizon - h * 0.5}" width="${w * 0.035}" height="${h * 0.5}" fill="${c.accent}" opacity="0.4"/>`)
  g.push(figure(w * 0.86, horizon + h * 0.17, h * 0.33, c.figure))
  return g.join('')
}

function svg({ w, h, tone, scene: kind }) {
  const c = TONES[tone]
  const label = Math.round(Math.min(w, h) * 0.024)
  const pad = Math.round(Math.min(w, h) * 0.032)
  const onDark = tone === 'blackout'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  ${scene(kind, w, h, c)}
  <text x="${pad}" y="${h - pad}" font-family="monospace" font-size="${label}"
        fill="${onDark ? '#9aa0a8' : '#3f3d3a'}" opacity="0.75"
        letter-spacing="${label * 0.08}">SYNTHETIC DEMONSTRATION PLATE — NOT AN ARTWORK</text>
</svg>`
}

await mkdir(outDir, { recursive: true })

let written = 0
let skipped = 0
for (const plate of PLATES) {
  const target = join(outDir, `${plate.id}.jpg`)
  try {
    await stat(target)
    skipped++
    continue
  } catch { /* absent is the normal case */ }

  await sharp(Buffer.from(svg(plate)))
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4', mozjpeg: true })
    .withIccProfile('srgb')
    .toFile(target)
  written++
}

// The declared dimensions in the content records must match the files exactly, or the
// intrinsic-size guarantee (and CLS) is a fiction. Emitting them means the JSON is
// derived from the images rather than typed alongside them.
const manifest = PLATES.map((p) => ({ id: p.id, src: `/media/demo/${p.id}.jpg`, width: p.w, height: p.h }))
await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

console.log(`✓ ${written} demo plates written, ${skipped} already present → public/media/demo/`)
