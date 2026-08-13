#!/usr/bin/env node
/**
 * The plate lint — second line of defence for the artwork-integrity guarantee.
 *
 * Plate.astro's Props interface has no field for a crop, a filter, an aspect override
 * or a class name, so a violation cannot be expressed through the component's API. This
 * catches the other direction: a CSS rule written elsewhere that reaches INTO a plate,
 * which is exactly how the reference sites broke their own stated intentions.
 *
 *   - G. Colombel built a per-item --aspect-ratio variable, then fed it `1 / 1`
 *     everywhere plus a permanent `fakeScale = 1.1` overscan.
 *   - Work In Progress applies `filter: grayscale(1)` to artist photographs and never
 *     fully restores colour, even on hover.
 *   - Matthew Pothier collapses thumbnails to fixed 50 × 50 squares on mobile with
 *     hotspot data sitting unused.
 *
 * None of those were decisions anyone defended. They were defaults nobody re-read.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')

/** Declarations that alter an artwork's colour, proportions or framing. */
const FORBIDDEN_IN_PLATE = [
  { re: /\bobject-fit\s*:/i, why: 'object-fit crops the work to a container. The plate is sized by the image, never the reverse.' },
  { re: /\bobject-position\s*:/i, why: 'object-position only matters when something is being cropped.' },
  { re: /\bfilter\s*:(?!\s*none)/i, why: 'a filter changes the colour the artist chose.' },
  { re: /\bbackdrop-filter\s*:/i, why: 'a backdrop-filter alters everything seen through it.' },
  { re: /\bmix-blend-mode\s*:(?!\s*normal)/i, why: 'a blend mode recomputes the artwork\'s pixels against the page.' },
  { re: /\bclip-path\s*:(?!\s*none)/i, why: 'clip-path is a crop.' },
  { re: /\baspect-ratio\s*:/i, why: 'the aspect ratio comes from the image\'s own width/height, not from CSS.' },
  { re: /\btransform\s*:\s*[^;]*scale/i, why: 'scaling a plate changes its reproduction size against the caption\'s stated dimensions.' },
  { re: /\bopacity\s*:\s*0?\.\d/i, why: 'a partially transparent artwork is composited against the page ground.' },
]

/** Banned on any <img> anywhere, not only inside a plate — an index thumbnail is still
 *  the work, and cropping it is where most artist sites actually do the damage. */
const IMG_SELECTOR = /(^|[\s,>+~])img\b/i

const files = []
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p)
    else if (/\.(astro|css)$/.test(e.name)) files.push(p)
  }
}
await walk(srcDir)

const violations = []

for (const file of files) {
  const text = await readFile(file, 'utf8')

  // Crude but honest rule extraction: `selector { declarations }`. Good enough to catch
  // a real regression, and it never has to parse arbitrary CSS because this codebase
  // writes plain CSS in <style> blocks and .css files.
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = ruleRe.exec(text)) !== null) {
    const selector = m[1].trim().replace(/\s+/g, ' ')
    const body = m[2]
    if (selector.startsWith('@')) continue

    const touchesPlate = /\.plate\b/.test(selector)
    const touchesImg = IMG_SELECTOR.test(selector)
    if (!touchesPlate && !touchesImg) continue

    for (const rule of FORBIDDEN_IN_PLATE) {
      // `aspect-ratio` on a non-plate img is legitimate (a plan SVG box, an avatar);
      // only guard it where artwork is actually rendered.
      if (rule.re === FORBIDDEN_IN_PLATE[6].re && !touchesPlate) continue

      if (rule.re.test(body)) {
        violations.push({
          file: relative(root, file),
          selector,
          why: rule.why,
          decl: (body.match(rule.re) ?? [''])[0].trim(),
        })
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`\n✗ Plate lint FAILED — ${violations.length} violation(s):\n`)
  for (const v of violations) {
    console.error(`  ${v.file}`)
    console.error(`    ${v.selector} { … ${v.decl} … }`)
    console.error(`    → ${v.why}\n`)
  }
  console.error('Artwork must never be cropped, filtered or reproportioned. Do not ship this build.\n')
  process.exit(1)
}

console.log(`✓ Plate lint clean across ${files.length} files — no rule crops, filters or reproportions artwork.`)
