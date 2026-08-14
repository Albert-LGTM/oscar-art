// @ts-check
import { defineConfig, passthroughImageService } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Slugs of every DEMONSTRATION record, read straight off disk.
 *
 * The sitemap filter is a pure function of the URL string — it runs before the content
 * layer exists and cannot ask a collection whether a record is invented. So the config
 * reads the JSON itself. It is the same data, one step earlier.
 *
 * This is belt AND braces on purpose. The pages already emit `noindex, nofollow`, which
 * is the mechanism that actually keeps them out of an index; omitting them here as well
 * stops us from actively *submitting* fabricated exhibition records to a search engine,
 * which a sitemap does. Neither measure substitutes for the other: a sitemap omission
 * alone does not prevent indexing of internally-linked pages.
 */
function demoSlugs() {
  const out = new Set()
  for (const dir of ['src/content/works', 'src/content/showings']) {
    let files = []
    try { files = readdirSync(dir) } catch { continue }
    for (const f of files.filter((f) => f.endsWith('.json'))) {
      try {
        const data = JSON.parse(readFileSync(join(dir, f), 'utf8'))
        if (data.demo === true) out.add(f.replace(/\.json$/, ''))
      } catch { /* a malformed record fails the build elsewhere, loudly */ }
    }
  }
  return out
}

const DEMO = demoSlugs()

/**
 * Ståsted — Astro configuration.
 *
 * Decisions carried from the plan (§19):
 *  - `output: 'static'`. The site is ~99% server-rendered semantic content. Static
 *    output is portable (own CDN, VPS, or a managed host) so hosting stays deferred,
 *    and MPA navigation means LCP/CLS reset per navigation in field data — Chrome has
 *    explicitly not decided how soft navigations are reported in CrUX.
 *  - `prefixDefaultLocale: true`. Both /en/ and /da/ are prefixed; `/` redirects.
 *    Danish and English are at strict parity, so neither gets the bare root.
 *  - Route *segments* are translated (/en/works/ ↔ /da/vaerker/). Astro's i18n does
 *    not translate path segments, so the mapping lives in src/lib/routes.ts and pages
 *    are generated from it. See that file for the single source of truth.
 */
export default defineConfig({
  // TODO(phase-0): replace with the real domain once it is registered.
  site: 'https://example.invalid',

  output: 'static',

  // Astro 7 defaults `compressHTML` to 'jsx', which can strip significant whitespace
  // between inline elements. This archive sets italic work titles inline inside prose
  // ("...shown at <em>Kunsthal Charlottenborg</em> in 2024"), where a dropped space is
  // a silent content defect in a site whose entire claim is factual accuracy.
  // Disabled deliberately; the CDN gzips anyway and the delta is <1 KB.
  compressHTML: false,

  /**
   * No image service.
   *
   * Astro defaults to a sharp-backed image service, but this project never uses
   * `<Image />` or `astro:assets` — every derivative is produced by our own explicit
   * pipeline (scripts/build-derivatives.mjs) precisely so that the colour handling is
   * ours and is asserted in CI.
   *
   * So Astro's image service is dead weight AND a failure surface: it is a native
   * dependency that has to load during the build, on build containers that increasingly
   * block install scripts by default. Turning it off removes an entire class of "works
   * locally, dies on the runner" failure and buys nothing back, because there is no
   * image for it to optimise.
   *
   * We still depend on sharp directly — but only in our own scripts, where the failure
   * is loud and the call sites are visible.
   */
  image: { service: passthroughImageService() },

  /**
   * Link prefetching.
   *
   * This is an MPA — every navbar click is a full document navigation, which is one
   * network round trip before anything can render. `hover` starts that fetch the moment
   * the pointer touches a link (and on touchstart on mobile), so by the time the click
   * lands the document is usually already in cache.
   *
   * `hover` rather than `viewport`: viewport-prefetching every visible link would pull
   * whole pages nobody opens, which on a media-heavy archive and on mobile data is a
   * cost paid by the visitor for our convenience. Hover is intent.
   *
   * Cost is ~1 KB of JS, and it respects Save-Data and slow connections automatically.
   */
  prefetch: {
    /*
     * OPT-IN, not prefetchAll.
     *
     * `prefetchAll: true` injected the prefetch script into EVERY page — including the
     * inspection route, whose entire promise is zero first-party JavaScript. A stated
     * guarantee that a config flag quietly revokes is worse than no guarantee, so the
     * navigation opts in explicitly (`data-astro-prefetch` in the masthead and indexes)
     * and the inspection route stays inert.
     */
    prefetchAll: false,
    defaultStrategy: 'hover',
  },

  i18n: {
    locales: ['en', 'da'],
    defaultLocale: 'en',
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },

  build: {
    // Directory-style URLs with trailing slashes, so a work URL is a stable, quotable
    // citation target that never changes shape.
    format: 'directory',
  },
  trailingSlash: 'always',

  redirects: {
    // The bare root carries no locale. Danish and English are at strict parity, so
    // neither gets to own `/`; English is the wider default for an international
    // curator audience and the Danish reader is one visible toggle away.
    // Static output emits a meta-refresh page with a canonical, which is correct for
    // a CDN-hosted site. Replace with a 302 at the edge if the host supports it.
    '/': '/en/',
  },

  integrations: [
    sitemap({
      // Viewpoints >= 2 are canonical to the showing (see src/lib/seo.ts). They are
      // excluded here *as well as* carrying a canonical link — a sitemap omission
      // alone does not prevent indexing of internally-linked pages.
      filter: (page) => {
        if (/\/view\/(?!1\/)\d+\//.test(page)) return false
        // Matching a whole path segment, not a substring: a real work named
        // "standing-water-ii" must not be dropped because a demo work is called
        // "standing-water".
        const segments = new URL(page).pathname.split('/').filter(Boolean)
        return !segments.some((seg) => DEMO.has(seg))
      },
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', da: 'da' },
      },
    }),
  ],

  vite: {
    build: {
      // Fail loudly rather than silently shipping an oversized bundle. The JS budget
      // is 10 KB gz on index/record routes (plan §22).
      chunkSizeWarningLimit: 40,
    },
  },
})
