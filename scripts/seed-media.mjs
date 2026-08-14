#!/usr/bin/env node
/**
 * Generate PLACEHOLDER source images at exactly the dimensions declared in the content
 * model, so that layout, aspect-ratio handling and the derivative pipeline can be
 * verified before any real documentation exists.
 *
 * These are obviously-synthetic neutral fields carrying their own filename. They are
 * NOT stand-ins for artwork and must never survive into a build that ships: the
 * placeholder lint fails the build if they are present alongside a production flag.
 *
 * Dimensions are read from the content JSON rather than hard-coded, so a placeholder
 * can never silently disagree with the metadata the site publishes about it.
 */
import { mkdir, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { declaredImages } from './lib/declared-images.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public/media')

/** A neutral field with a visible label. Deliberately ugly: a placeholder that looks
 *  like a photograph invites someone to forget it is one. */
function svgFor({ src, width, height, role }) {
  const name = src.split('/').pop()
  const fs = Math.max(14, Math.round(Math.min(width, height) / 18))
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#8a8a8a"/>
    <rect x="2%" y="2%" width="96%" height="96%" fill="none" stroke="#5c5c5c" stroke-width="${Math.max(2, fs / 8)}" stroke-dasharray="${fs} ${fs}"/>
    <g font-family="monospace" fill="#2b2b2b" text-anchor="middle">
      <text x="50%" y="46%" font-size="${fs}">PLACEHOLDER</text>
      <text x="50%" y="56%" font-size="${fs * 0.62}">${name} · ${role}</text>
      <text x="50%" y="64%" font-size="${fs * 0.62}">${width} × ${height}</text>
    </g>
  </svg>`)
}

const images = await declaredImages()
await mkdir(outDir, { recursive: true })

let seeded = 0
let kept = 0

for (const img of images) {
  const target = join(outDir, img.src.replace(/^\/media\//, ''))
  await mkdir(dirname(target), { recursive: true })

  // NEVER overwrite a real file. Real documentation now lives alongside placeholders,
  // and this script runs on every container build — without this guard it would quietly
  // replace the artist's photographs with grey rectangles, and the only visible symptom
  // would be that the work looked wrong.
  try {
    await access(target)
    kept++
    continue
  } catch { /* absent — safe to seed */ }
  await sharp(svgFor(img))
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    // Written explicitly rather than relying on a default. sharp strips metadata and
    // converts to sRGB by default; the whole pipeline depends on the profile being an
    // asserted fact rather than an accident.
    .withIccProfile('srgb')
    .toFile(target)
  seeded++
}

console.log(`\n${seeded} placeholder(s) written, ${kept} real file(s) left untouched.`)
