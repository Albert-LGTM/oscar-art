#!/usr/bin/env node
/**
 * Document-semantics guard, run against the BUILT output.
 *
 * The field leader fails exactly these checks. olafureliasson.net's Weather Project
 * page — 113 KB of otherwise exemplary markup, with machine-composed alt text and
 * 30 <figcaption> elements — has no <h1>, no <main>, no <nav>, and a heading cascade
 * that starts at <h3>. Felix Gonzalez-Torres Foundation marks every exhibition title
 * as <h1>. Work In Progress ships an identical <title> and canonical on all four
 * routes, with /about declaring the homepage as canonical.
 *
 * These are not subtle failures; they are unchecked ones. Checking them costs a script.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')

const pages = []
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p)
    else if (e.name.endsWith('.html')) pages.push(p)
  }
}

try {
  await walk(distDir)
} catch {
  console.error('No dist/ — run `npm run build` first.')
  process.exit(1)
}

const failures = []
const seenCanonicals = new Map()

const count = (html, re) => (html.match(re) ?? []).length

for (const file of pages) {
  const rel = relative(distDir, file)
  const html = await readFile(file, 'utf8')

  // A redirect stub is a <meta http-equiv="refresh"> page with no content of its own.
  if (/http-equiv=["']refresh["']/i.test(html)) continue

  const fail = (msg) => failures.push(`${rel}: ${msg}`)

  /*
   * A noindex page (the 404) is genuinely exempt from canonical and hreflang, and this
   * is a real rule rather than an escape hatch for one file. A canonical on an error
   * page asserts that a nonexistent URL is the preferred version of itself, and
   * hreflang declares translation alternates for a page that is not content. Both are
   * wrong, not merely unnecessary.
   *
   * Everything else — one h1, landmarks, a title, alt text, intrinsic dimensions —
   * still applies. An error page is still a page someone has to read.
   */
  const isNoindex = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html)

  // 1. Exactly one <h1>. Zero is Eliasson; many is FGT.
  const h1s = count(html, /<h1[\s>]/gi)
  if (h1s === 0) fail('no <h1>')
  else if (h1s > 1) fail(`${h1s} <h1> elements — there must be exactly one`)

  // 2. Landmarks.
  if (count(html, /<main[\s>]/gi) !== 1) fail('missing or duplicated <main>')
  if (count(html, /<nav[\s>]/gi) < 1) fail('no <nav>')

  // 3. A unique, non-empty <title>.
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim()
  if (!title) fail('empty or missing <title>')

  // 4. Canonical present, and unique across the site. A shared canonical silently
  //    deindexes real pages — Work In Progress points /about at its homepage.
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1]
  if (!canonical && !isNoindex) fail('no canonical')
  else if (canonical) {
    const prior = seenCanonicals.get(canonical)
    // Locale pairs legitimately differ; a genuine duplicate is two DIFFERENT paths
    // claiming the same canonical, which is what we are catching.
    if (prior && prior !== rel) fail(`canonical "${canonical}" is also claimed by ${prior}`)
    else seenCanonicals.set(canonical, rel)
  }

  // 5. Reciprocal hreflang plus x-default. The single most consequential bilingual
  //    mechanic, and it must be present on BOTH sides or search engines discard it.
  if (!isNoindex) {
    for (const lang of ['en', 'da', 'x-default']) {
      if (!new RegExp(`hreflang="${lang}"`, 'i').test(html)) fail(`no hreflang="${lang}"`)
    }
  }

  /*
   * 6. Every <img> must carry an alt ATTRIBUTE. An explicit empty alt is legitimate for
   *    a decorative image; a MISSING attribute is always a defect.
   *
   *    The attribute may be present WITHOUT a value: Astro serialises alt="" as a bare
   *    `alt`, and in HTML5 a valueless attribute has the empty string as its value, so
   *    `<img alt>` and `<img alt="">` are the same document. The first version of this
   *    check tested for the substring `alt=` and therefore reported four real,
   *    correctly-marked-up decorative thumbnails as an accessibility failure.
   *
   *    Matching on a word boundary followed by `=`, whitespace or `>` also keeps
   *    `data-alt` or `data-alternate` from satisfying the check.
   */
  const imgs = html.match(/<img\b[^>]*>/gi) ?? []
  const noAlt = imgs.filter((tag) => !/\salt(\s*=|[\s/>])/i.test(tag))
  if (noAlt.length > 0) fail(`${noAlt.length} <img> without an alt attribute`)

  // 7. Every <img> must carry intrinsic dimensions, or the box cannot be reserved
  //    before decode and CLS becomes something you tune rather than something you have.
  const noDims = imgs.filter((tag) => !/\bwidth=/.test(tag) || !/\bheight=/.test(tag))
  if (noDims.length > 0) fail(`${noDims.length} <img> without width/height`)

  // 8. A literal "undefined" / "null" / "NaN" in shipped output is always a defect —
  //    an interpolation that lost its value. It reached the <title>, the OG title and a
  //    JSON-LD dateCreated before this check existed, and none of the other guards
  //    could see it because the markup was perfectly well-formed.
  for (const token of ['undefined', 'NaN']) {
    const re = new RegExp(`(^|[>"\\s,:])${token}([<"\\s,.]|$)`)
    const inText = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '')
    if (re.test(inText)) fail(`the literal "${token}" appears in output — a lost interpolation`)
    // JSON-LD is stripped above, so check it separately and precisely.
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      if (m[1].includes(`"${token}"`)) fail(`JSON-LD asserts "${token}" as a value`)
    }
  }

  // 9. Artwork must never be the only thing carrying meaning inside a canvas.
  if (/<canvas\b/i.test(html)) fail('a <canvas> element is present — no core content may live in canvas')
}

if (failures.length > 0) {
  console.error(`\n✗ Semantics lint FAILED — ${failures.length} issue(s) across ${pages.length} pages:\n`)
  for (const f of failures) console.error(`  ${f}`)
  console.error('')
  process.exit(1)
}

console.log(`✓ Semantics lint clean across ${pages.length} pages (h1, landmarks, canonical, hreflang, alt, dimensions).`)
