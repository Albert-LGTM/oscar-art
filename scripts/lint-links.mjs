#!/usr/bin/env node
/**
 * Internal link checker. Fails the build on a single dead internal link.
 *
 * This is the guard that should have existed from the first commit. Without it the
 * masthead advertised five doors and only two resolved — which is exactly the
 * "staleness tell" the research documented and which this project explicitly set out
 * not to reproduce:
 *
 *   - jeppehein.net links Works and CV in its nav; /works returns 404 and /cv/ 403.
 *   - Other Circle ships "SEE MORE…" anchors to /exhibitor/<slug>/ URLs that serve the
 *     whole archive back with a canonical pointing elsewhere.
 *
 * A curator reads a dead nav link as an abandoned practice, within seconds. Checking it
 * costs a script, and no amount of care substitutes for the check — I wrote the warning
 * into two other files and still shipped the bug.
 *
 * Runs against dist/, so it tests what will actually be served rather than what the
 * router believes exists.
 */
import { readdir, readFile, access } from 'node:fs/promises'
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

const exists = async (p) => {
  try { await access(p); return true } catch { return false }
}

/** Resolve a site-absolute URL the way a static file server will. */
async function resolves(url) {
  const clean = url.split('#')[0].split('?')[0]
  if (clean === '' || clean === '/') return exists(join(distDir, 'index.html'))
  const p = join(distDir, clean)
  // Directory-style URL → its index.html; otherwise the file itself.
  if (clean.endsWith('/')) return exists(join(p, 'index.html'))
  return (await exists(p)) || (await exists(join(p, 'index.html'))) || exists(`${p}.html`)
}

const broken = new Map() // url -> Set(pages linking to it)
let checked = 0

for (const file of pages) {
  const html = await readFile(file, 'utf8')
  const rel = relative(distDir, file)

  // Site-absolute internal links only. External URLs are a separate concern (they need
  // network access and a different cadence — see the press link `urlCheckedOn` field).
  for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    const url = m[1]
    checked++
    if (!(await resolves(url))) {
      if (!broken.has(url)) broken.set(url, new Set())
      broken.get(url).add(rel)
    }
  }
}

if (broken.size > 0) {
  console.error(`\n✗ Link check FAILED — ${broken.size} dead internal target(s):\n`)
  for (const [url, sources] of [...broken].sort()) {
    console.error(`  ${url}`)
    console.error(`    linked from: ${[...sources].slice(0, 4).join(', ')}${sources.size > 4 ? ` (+${sources.size - 4} more)` : ''}`)
  }
  console.error('\nA nav link that 404s reads as an abandoned practice. Do not ship this build.\n')
  process.exit(1)
}

console.log(`✓ Link check clean — ${checked} internal references across ${pages.length} pages all resolve.`)
