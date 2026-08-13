#!/usr/bin/env node
/**
 * Colour regression detector.
 *
 * This assertion — not the pipeline code — is what makes "colour-faithful" survive a
 * dependency bump. sharp has silently broken colour handling at least twice (libvips
 * #2862, #4008), and the failure mode is invisible: the images still render, they are
 * just wrong, on a monitor where nobody would notice.
 *
 * Fails the build when any derivative has lost its profile or carries an unexpected one.
 */
import { readdir, stat } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const derivedDir = join(root, 'public/media/derived')

/** What every derivative must carry. Widen deliberately if a Display-P3 path is added
 *  in Phase 0 — and double the CI assertions at the same time, not later. */
const EXPECTED = ['srgb', 'srgb iec61966-2.1', 'iec 61966-2-1', 'sgrb']

let checked = 0
const failures = []

try {
  await stat(derivedDir)
} catch {
  console.error('No derivatives found. Run `npm run build:media` first.')
  process.exit(1)
}

for (const name of await readdir(derivedDir)) {
  if (!/\.(avif|webp|jpe?g)$/i.test(name)) continue
  const file = join(derivedDir, name)

  let meta
  try {
    meta = await sharp(file).metadata()
  } catch (err) {
    failures.push(`${name}: unreadable — ${err.message}`)
    continue
  }
  checked++

  // 1. The profile must be present at all.
  if (!meta.icc) {
    failures.push(`${name}: NO ICC PROFILE. sharp strips metadata by default — check that withIccProfile() is still being called.`)
    continue
  }

  // 2. And it must be the one we intend.
  const described = String(meta.iccProfileDescription ?? '').toLowerCase().trim()
  if (described && !EXPECTED.some((e) => described.includes(e))) {
    failures.push(`${name}: unexpected profile "${meta.iccProfileDescription}" (expected sRGB).`)
  }

  // 3. Three channels, 8 bits. A silent conversion to CMYK or greyscale would be a
  //    catastrophic and entirely invisible failure on artwork.
  if (meta.channels && meta.channels < 3) {
    failures.push(`${name}: ${meta.channels} channel(s) — artwork must not be reduced to greyscale.`)
  }
  if (meta.space && !['srgb', 'rgb'].includes(String(meta.space).toLowerCase())) {
    failures.push(`${name}: colour space "${meta.space}" is not RGB.`)
  }
}

if (failures.length > 0) {
  console.error(`\n✗ Colour assertion FAILED — ${failures.length} of ${checked} derivatives:\n`)
  for (const f of failures) console.error(`  ${f}`)
  console.error('\nArtwork colour fidelity is a hard constraint. Do not ship this build.\n')
  process.exit(1)
}

console.log(`✓ ${checked} derivatives carry an sRGB profile with 3+ RGB channels.`)
