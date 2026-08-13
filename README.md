# Ståsted

Archive of record for a contemporary installation artist. Danish + English.

Plan: `~/.claude/plans/you-are-in-planning-structured-locket.md`

---

## The one structural idea

**The atomic unit is the Showing (work × venue × exhibition × dates), not the work and
not the image.**

A work record is identity — materials, variability, existence status, technical
requirements. A *showing* record is where photographs, floor plan, press and as-installed
data live. This is the profession's own model (the Guggenheim's Identity Report /
Iteration Report pair, adopted by the Met, Whitney, Hirshhorn and SAAM), and **no artist
website in the reference survey implements it** — not Eliasson, not SUPERFLEX, not the
Felix Gonzalez-Torres Foundation, not Holt/Smithson.

Everything else follows: the ledger, the venue door, the derived CV, the facets a curator
actually needs.

## Governing rule

> No effect exists that is not a rendering of a field in the record.

If a field is empty, the instrument is **absent** — never a placeholder. A page that
advertises what the artist failed to keep is worse than one that does not make the claim.

## Current state

| Area | State |
|---|---|
| Content model (10 collections, Zod-validated) | ✅ Built |
| Localisation: Shared / Original+Gloss / Translated, per-field fallback | ✅ Built |
| URL grammar, translated slugs, reciprocal hreflang + x-default | ✅ Built |
| Plate (mat contract) + CAA Caption | ✅ Built |
| Home composition (frontispiece, doors, selected) | ✅ Built |
| Work record with iteration ledger + three depths | ✅ Built |
| Image pipeline: 7 widths × 3 formats, explicit ICC | ✅ Built |
| CI guards: plates, colour, semantics | ✅ Built, negative-tested |
| Showing record, viewpoint traversal, inspection route | ⬜ Next |
| Door indexes, facets, Find, press room, CV | ⬜ Next |
| Sanity migration | ⬜ After Phase 0 |

## Run it (Podman)

```bash
# Production: build + serve. ~2 min first build, seconds after.
podman build -t localhost/staasted:latest -f Containerfile .
podman run -d --name staasted -p 8080:8080 \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  localhost/staasted:latest

./scripts/smoke.sh          # 21 checks against the running container
podman logs -f staasted
podman rm -f staasted
```

→ **http://localhost:8080**

```bash
# Development: hot reload, source bind-mounted.
podman build -t localhost/staasted-dev:latest -f Containerfile.dev .
podman run -d --name staasted-dev -p 4321:4321 \
  -v ./src:/app/src:Z -v ./scripts:/app/scripts:Z -v ./astro.config.mjs:/app/astro.config.mjs:Z \
  localhost/staasted-dev:latest
```

→ **http://localhost:4321** — edits under `src/` reload live.

Or with compose: `podman-compose up site` / `podman-compose up dev`.

### What the image does that a plain static host does not

- **The artwork guards run inside the build.** `test:colour`, `lint:plates` and
  `lint:semantics` are `RUN` steps. An image that builds is an image whose artwork was
  verified uncropped, unfiltered and colour-profiled. A stripped ICC profile fails the
  build rather than shipping and looking fine on your monitor.
- **The CSP is generated from what the build emitted.** `scripts/gen-csp.mjs` hashes
  every inline `<script>` and `<style>` in `dist/` and writes them into the Caddyfile,
  so there is no `unsafe-inline` and no hand-maintained hash list to rot. Verified at
  runtime by the smoke test.
- **Real 404s.** A missing page returns 404, not a soft 200 — the failure that makes a
  mistyped URL look like a real page and poisons indexing.
- **Caching split correctly.** Content-addressed assets and image derivatives are
  `immutable`; everything else revalidates, because an archive of record must be able
  to serve a correction.
- **Non-root, read-only, all capabilities dropped.** No Node in the runtime image.

### Three things that will bite you if you change them

1. **The Caddy binary's file capability.** Upstream ships
   `cap_net_bind_service=ep` so it can bind :80. Under `--cap-drop ALL` the bounding
   set cannot satisfy that and **exec fails outright** — `"Operation not permitted"`,
   which reads like a corrupt image. The Containerfile strips it by copying the binary
   over itself (`cp` does not carry xattrs). We bind :8080, so it is not needed.
2. **`--host ::` in the dev container, not `0.0.0.0`.** `localhost` resolves to `::1`
   first here; an IPv4-only bind means the browser connects, sends the request, and
   hangs with no response. Looks like a broken dev server, is an address-family
   mismatch.
3. **`:Z` on every bind mount.** SELinux is enforcing on Fedora. Without it the
   container gets permission denied on files that are plainly readable from the host.

`Caddyfile` is generated from `Caddyfile.template` and is gitignored — edit the
template. `public/media/` is generated too; real documentation replaces it in Phase 0.

## Deploy to Cloudflare Pages

The output is static, so Pages is a clean fit. Two settings, then done:

| Setting | Value |
|---|---|
| Build command | `npm run build:cf` |
| Output directory | `dist` |
| Node version | `22` (set `NODE_VERSION=22`) |

`build:cf` seeds media → builds derivatives → builds the site → generates the CSP.
`gen-csp.mjs` emits `dist/_headers` and `dist/_redirects` from the **same directive
list** as the Caddyfile, so the two hosts cannot drift apart.

Verify the real deployment with the same 21 checks the container gets:

```bash
./scripts/smoke.sh https://your-project.pages.dev
```

### ⚠️ Turn Polish OFF. This is not optional here.

**Cloudflare Polish strips the iCCP chunk — even in lossless mode.** For this project
that is a silent, total failure: every artwork loses its colour profile, the images
still render, they are just wrong, and nobody notices on a normal monitor. The entire
image pipeline exists to prevent exactly this.

On the zone serving the site:

- **Speed → Optimization → Polish: Off**
- **Cloudflare Images / Image Resizing: do not enable** for `/media/*`
- **Auto Minify: off for HTML** — it would rewrite inline `<script>`/`<style>` and
  invalidate the CSP hashes, blocking the site's own scripts

Polish is off by default and is **not applied to `*.pages.dev`** — it only becomes a
risk once you attach a custom domain through a proxied zone. That is precisely when it
is easiest to switch on for "performance" and never connect it to the artwork looking
subtly wrong six months later.

After attaching a custom domain, confirm the profile survived the edge:

```bash
curl -s https://yourdomain/media/derived/vh-2022-01-1280.jpg -o /tmp/edge.jpg
node -e "require('sharp')('/tmp/edge.jpg').metadata().then(m=>console.log('ICC present:', !!m.icc))"
```

### Two things to check on the first deploy

1. **Cache-Control ordering.** Cloudflare applies every matching `_headers` rule, so
   `/_astro/*` and `/media/derived/*` are declared *after* `/*` in order to win. This is
   the same trap that silently killed the immutable header under Caddy. `smoke.sh`
   checks it — run it against the deployed URL, not just locally.
2. **`/` → `/en/`.** Handled by `_redirects` as a 302. Astro also emits a meta-refresh
   `index.html` as a fallback for hosts without redirect support.

### Not needed

No `@astrojs/cloudflare` adapter — that is for SSR. This is `output: 'static'`, so Pages
just serves files. Workers, KV and D1 are all unnecessary.

**Cost:** free tier is ample. Unlimited bandwidth/requests; the limit is 500 builds per
month, and this is a site that changes when the artist adds a showing.

### If you prefer R2 + a Worker

Also fine, and cheaper at very large media volumes — but you re-implement the headers
and redirects by hand, and the CSP then has a second copy that can drift. Pages is the
better default precisely because `_headers` is generated.

## Verify

```bash
npm run verify     # check → plate lint → colour assert → build → semantics lint → links → CSP
npm run smoke      # 21 runtime checks; pass a URL to test a real deployment
```

Individually:

```bash
npm run seed:media    # placeholder sources at the exact declared dimensions
npm run build:media   # AVIF/WebP/JPEG derivatives, explicit sRGB profile
npm run test:colour   # fails the build if any derivative lost its profile
npm run lint:plates   # fails if any CSS rule can crop/filter/reproportion artwork
npm run lint:semantics # fails on missing h1/main/nav, canonical, hreflang, alt, dimensions
```

Measured on the current build: **0 JS files** (the one 20-line progressive-enhancement
script is inlined), CSS 2.7 KB gz, a work record 3.4 KB gz.

### The guards are negative-tested

Both artwork guards were verified by deliberately breaking them, not just by passing:

- `lint:plates` exits 1 on `object-fit: cover`, `filter: grayscale(1)`, and on a
  crop applied to a thumbnail *outside* a plate.
- `test:colour` exits 1 when a derivative is re-encoded without its ICC profile —
  which is exactly what sharp does by default, and what `next/image`, Cloudflare
  Polish and imgix `auto=compress` do silently.

## Blocking: Phase 0

**Everything in `src/content/` and `src/lib/site.ts` is PLACEHOLDER.** No real artist
material exists yet. Before the direction is fully committed, a one-week asset audit must
measure:

- Works count; showings per work
- **% of showings that can carry a room dimension** ← the abort threshold
- % of images with a recoverable photographer
- Aspect-ratio spread; any out-of-sRGB work (ask the artist, do not infer from files)
- Total video runtime; whether ≤60 s funding cuts exist

**Abort threshold, agreed in advance:** if fewer than **40%** of showings can carry a
room dimension, the ledger and scale rule are cut from v1 and the register falls back to
typographic apparatus + colorimetric contract + existence status, which need no spatial
data. That is a pre-agreed decision, not a failure.

## Decisions still needed

1. Artist material — CV, asset inventory, file access.
2. Is the technical record public? (Recommended; it is what gets her invited.)
3. Sanity (recommended) or Payload (if self-hosting is non-negotiable)?
4. **Danish documentation terminology** — `iteration / opstilling / visning`,
   `installationsview`, `værk` vs `dokumentation`. Must come from the artist and the
   Danish institutional register. Research surfaced a real idiom trap here; the current
   `/da/vaerker/…/standpunkt/` segments are defensible defaults, not confirmed choices.
5. Does she license images? Determines whether `ImageObject` + `acquireLicensePage` is
   the highest-ROI markup on the site or dead weight.

## Conventions worth not breaking

- **"Courtesy of" is never used.** CAA has no such construction; its presence is the
  reliable tell that a site was not built by anyone who publishes. Artwork copyright and
  photograph copyright are separate fields, always.
- **`alt=""` only from an explicit `decorative: true`.** All seven reference sites ship
  machine or empty alt on artwork; Johan Bech Jespersen's on all 25 works. Alt text is
  part of the catalogue record.
- **Work titles are never translated.** They are proper names (Original + Gloss). So are
  exhibition titles, venue names and quoted press.
- **Existence status carries a source** when terminal. Without one, a
  dismantled-and-stored work gets quietly recorded as destroyed and the archive becomes
  a mood.
- **No canvas, no WebGL.** Nothing in this direction needs it, so there is no
  context-loss path to handle — the failure mode is designed out.
- **No `prefers-reduced-data` branch.** It has 0% support; Chrome's only trigger was
  removed in M100. The savings ship unconditionally instead.
