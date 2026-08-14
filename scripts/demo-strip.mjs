#!/usr/bin/env node
/**
 * Delete every DEMONSTRATION record and its media.
 *
 *   npm run demo:strip           # dry run — lists what would go
 *   npm run demo:strip -- --yes  # actually delete
 *
 * The demo content exists to show what the archive does once its fields are filled in.
 * The moment the artist's real showings arrive it stops being useful and starts being a
 * liability, so removing it must be one command rather than an archaeology exercise —
 * otherwise a fabricated venue survives to launch because nobody could remember which of
 * thirty files were invented.
 *
 * The flag is the authority, not the filename. Anything carrying `demo: true` goes,
 * wherever it lives and whatever it is called; anything without it is never touched.
 * Media is only removed when NO surviving record still declares it, so a demo image that
 * the artist later reused on a real record cannot be deleted out from under it.
 *
 * Dry run is the default deliberately. This deletes source content.
 */
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declaredImages } from './lib/declared-images.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = join(root, 'src/content')
const mediaDir = join(root, 'public/media')

const APPLY = process.argv.includes('--yes')

/** Every content file, with its parsed front matter or JSON body. */
async function records() {
  const out = []
  const collections = await readdir(contentDir, { withFileTypes: true })
  for (const c of collections.filter((c) => c.isDirectory())) {
    const dir = join(contentDir, c.name)
    for (const f of await readdir(dir)) {
      if (!/\.(json|md)$/.test(f)) continue
      const path = join(dir, f)
      const raw = await readFile(path, 'utf8')
      let isDemo = false
      if (f.endsWith('.json')) {
        try { isDemo = JSON.parse(raw).demo === true } catch { /* left to the build */ }
      } else {
        // Front matter only — a `demo: true` occurring in the body prose must not count.
        const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
        isDemo = !!fm && /^demo:\s*true\s*$/m.test(fm[1])
      }
      out.push({ collection: c.name, path, isDemo })
    }
  }
  return out
}

const all = await records()
const doomed = all.filter((r) => r.isDemo)

if (doomed.length === 0) {
  console.log('No records carry `demo: true`. Nothing to strip.')
  process.exit(0)
}

// Which images would still be declared once the demo records are gone? Anything not in
// that set is orphaned and can go too.
const before = await declaredImages()
const doomedPaths = new Set(doomed.map((r) => r.path))
const survivingSrcs = new Set()
for (const r of all) {
  if (doomedPaths.has(r.path) || !r.path.endsWith('.json')) continue
  try {
    const data = JSON.parse(await readFile(r.path, 'utf8'))
    for (const a of data.assets ?? []) {
      if (a.kind === 'image') survivingSrcs.add(a.file.src)
      if (a.kind === 'video' && a.poster) survivingSrcs.add(a.poster.src)
    }
    if (data.keyImage?.file) survivingSrcs.add(data.keyImage.file.src)
  } catch { /* ignore */ }
}
const orphaned = before.filter((i) => !survivingSrcs.has(i.src))

console.log(`\n${doomed.length} demonstration record(s):`)
for (const r of doomed) console.log(`  ${r.path.replace(root + '/', '')}`)

console.log(`\n${orphaned.length} image(s) left undeclared, with their derivatives and social cards:`)
for (const i of orphaned) console.log(`  ${i.src}`)

if (!APPLY) {
  console.log('\nDry run. Nothing was deleted. Re-run with --yes to apply:')
  console.log('  npm run demo:strip -- --yes')
  process.exit(0)
}

const rmIf = async (p) => { try { await stat(p); await rm(p, { recursive: true }); return 1 } catch { return 0 } }

for (const r of doomed) await rm(r.path)

let files = 0
for (const i of orphaned) {
  const rel = i.src.replace(/^\/media\//, '')
  const stem = rel.replace(/\.[^.]+$/, '')
  files += await rmIf(join(mediaDir, rel))
  files += await rmIf(join(mediaDir, 'social', `${i.id}.jpg`))
  // Derivatives are `<stem>-<width>.<format>` beside the stem, so glob the parent.
  const derivedParent = join(mediaDir, 'derived', dirname(stem))
  const base = stem.split('/').pop()
  try {
    for (const f of await readdir(derivedParent)) {
      if (new RegExp(`^${base}-\\d+\\.(avif|webp|jpg)$`).test(f)) {
        files += await rmIf(join(derivedParent, f))
      }
    }
  } catch { /* no derivatives built */ }
}

console.log(`\n✓ Removed ${doomed.length} record(s) and ${files} media file(s).`)
console.log('  Run `npm run verify` to confirm the archive is still consistent.')
