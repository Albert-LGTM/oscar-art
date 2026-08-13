// @ts-check
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

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
      filter: (page) => !/\/view\/(?!1\/)\d+\//.test(page),
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
