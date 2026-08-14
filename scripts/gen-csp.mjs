#!/usr/bin/env node
/**
 * Generate the Content-Security-Policy from what the build ACTUALLY emitted.
 *
 * The security baseline forbids `unsafe-inline`, but Astro inlines small scripts and
 * per-component styles. A hand-maintained hash list rots the moment anyone edits a
 * <script> block — and the failure is silent in dev and total in production, because a
 * stale hash means the script is simply blocked.
 *
 * So the hashes are derived from dist/ at build time and written into the Caddyfile.
 * Editing a component regenerates the policy; nobody has to remember.
 *
 * Note on `style-src`: the hash covers the <style> blocks Astro inlines, but any
 * runtime `element.style.x = …` would still be blocked. That is intentional — nothing
 * in this codebase sets inline styles from script, and if something ever needs to, the
 * CSP failure is the correct signal rather than a surprise.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')

const files = []
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p)
    else if (e.name.endsWith('.html')) files.push(p)
  }
}

try {
  await walk(distDir)
} catch {
  console.error('No dist/ — run `npm run build` first.')
  process.exit(1)
}

const sha256 = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`

const scriptHashes = new Set()
const styleHashes = new Set()

for (const file of files) {
  const html = await readFile(file, 'utf8')

  // Only INLINE blocks need hashing; anything with a src/href is covered by 'self'.
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc=/.test(m[1])) continue
    if (m[2].trim()) scriptHashes.add(sha256(m[2]))
  }
  for (const m of html.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)) {
    if (m[2].trim()) styleHashes.add(sha256(m[2]))
  }
}

const directives = [
  "default-src 'none'",
  // Images, media and fonts are all first-party. There is no third-party asset host,
  // by design — every image CDN in the research destroys colour by default.
  "img-src 'self' data:",
  "media-src 'self'",
  "font-src 'self'",
  "style-src 'self' " + [...styleHashes].join(' '),
  "script-src 'self' " + [...scriptHashes].join(' '),
  "connect-src 'self'",
  // No third-party embeds on artwork routes. If a video embed is ever added it is
  // click-to-load with a local poster, and this line changes deliberately.
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ')

// ── Target 1: Caddy (the container, and any self-hosted deployment) ───────────
const template = await readFile(join(root, 'Caddyfile.template'), 'utf8')
await writeFile(join(root, 'Caddyfile'), template.replace('{{CSP}}', directives), 'utf8')

// ── Target 2: Cloudflare Pages ────────────────────────────────────────────────
/*
 * Emitted from the SAME directive list as the Caddyfile, so the policy cannot drift
 * between hosts. Two hand-maintained copies of a CSP is two chances to ship a hash that
 * blocks the site's own scripts, and the failure is invisible until someone loads the
 * page in a browser rather than curl.
 *
 * CACHE-CONTROL MATCHERS ARE MUTUALLY EXCLUSIVE. This is not a style choice.
 *
 * The first version relied on "declare `/*` first, the narrow path after it, and the
 * specific value wins". That is false. Cloudflare CONCATENATES every matching rule into
 * one header, and the deployed site proved it:
 *
 *   cache-control: public, max-age=0, must-revalidate, public, max-age=604800,
 *                  public, max-age=31536000, immutable
 *
 * RFC 9111 leaves duplicate directives undefined, and browsers take the FIRST `max-age`
 * — so every content-hashed derivative was served `max-age=0, must-revalidate` and
 * revalidated on every single page load. The `immutable` was decorative. Exactly the
 * trap this comment used to claim had been avoided.
 *
 * Hence `/*` carries security headers ONLY and no caching directive, and every path
 * below appears in exactly one Cache-Control rule. That in turn is why derivatives live
 * at `/derived/` rather than `/media/derived/`: `_headers` has no negation syntax, so
 * `/media/derived/*` nested inside `/media/*` could not be given a different value
 * without the two stacking. The Caddyfile expresses the same split with `not path`,
 * which it can, and the two must agree.
 *
 * `./scripts/smoke.sh <url>` asserts the derivative header really contains `immutable`.
 */
const PERMISSIONS = 'accelerometer=(), autoplay=(), camera=(), display-capture=(), ' +
  'encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), microphone=(), ' +
  'midi=(), payment=(), usb=(), xr-spatial-tracking=()'

const headers = `# GENERATED by scripts/gen-csp.mjs — do not edit.
# Cloudflare Pages reads this from the root of the build output.

/*
  Content-Security-Policy: ${directives}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: ${PERMISSIONS}

# Content-addressed: the width and format are in the filename, so these bytes never
# change under this URL. The one legitimate exception to revalidation.
/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/derived/*
  Cache-Control: public, max-age=31536000, immutable

# The originals are what the inspection route and the press pack serve. Archival
# masters, never transformed and never re-encoded by the edge — but they CAN be
# replaced under the same name when a better scan arrives, so they revalidate weekly
# rather than being frozen for a year.
/media/*
  Cache-Control: public, max-age=604800

# Documents. An archive of record that serves a stale correction is worse than one that
# serves it a little slower, so every HTML route revalidates. Enumerated rather than
# left to /*, because /* must not carry a Cache-Control at all (see above).
/
  Cache-Control: public, max-age=0, must-revalidate

/en/*
  Cache-Control: public, max-age=0, must-revalidate

/da/*
  Cache-Control: public, max-age=0, must-revalidate

/inspect/*
  Cache-Control: public, max-age=0, must-revalidate

/404.html
  Cache-Control: public, max-age=0, must-revalidate

/robots.txt
  Cache-Control: public, max-age=0, must-revalidate

/sitemap-*
  Cache-Control: public, max-age=0, must-revalidate
`

const redirects = `# GENERATED by scripts/gen-csp.mjs — do not edit.
# The bare root carries no locale. Danish and English are at strict parity, so neither
# owns \`/\`; English is the wider default for an international curator audience and the
# Danish reader is one visible toggle away. 302 rather than 301: this is a routing
# default, not a permanent statement about which language the archive belongs to.
/  /en/  302
`

await writeFile(join(distDir, '_headers'), headers, 'utf8')
await writeFile(join(distDir, '_redirects'), redirects, 'utf8')

console.log(`✓ CSP generated from ${files.length} pages`)
console.log(`  ${scriptHashes.size} inline script hash(es), ${styleHashes.size} inline style hash(es)`)
console.log(`  no 'unsafe-inline', no third-party origins`)
console.log(`  → Caddyfile           (container / self-host)`)
console.log(`  → dist/_headers       (Cloudflare Pages)`)
console.log(`  → dist/_redirects     (Cloudflare Pages)`)
