import { LOCALES, type Locale } from './i18n'

/**
 * URL grammar — the single source of truth for route segments.
 *
 * Path prefixes with TRANSLATED slugs (/en/works/ ↔ /da/vaerker/), following the Danish
 * institutional convention (Den Frie, Kunsthal Charlottenborg, Louisiana, SMK all do
 * this). Reciprocal hreflang is generated from this map, and so is the language toggle,
 * which lands on the EQUIVALENT RECORD — never the homepage. Bouncing a curator to the
 * homepage because they clicked "DA" is the single most common bilingual defect.
 *
 * Every URL fully determines the page. Nothing that changes rendering lives in
 * localStorage. The consequence is that sharing, citation, print, OG cards,
 * back/forward and web-archive capture are all correct by construction.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TERMINOLOGY IS NOT SETTLED. Plan §32, decision 4.
 * The Danish segments below are defensible defaults, not confirmed choices. Danish
 * documentation vocabulary (iteration / opstilling / visning, installationsview,
 * værk vs. dokumentation) must come from the artist and the Danish institutional
 * register — it cannot be invented, and research surfaced a real idiom trap here.
 * Changing a segment later means a permanent redirect, never a silent rename:
 * see `redirects` in the content model. Settle this before launch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Every top-level door and utility route, keyed by a stable internal id. The id never
 *  changes; the rendered segment may. */
export const SEGMENTS = {
  works: { en: 'works', da: 'vaerker' },
  exhibitions: { en: 'exhibitions', da: 'udstillinger' },
  venues: { en: 'venues', da: 'steder' },
  chronology: { en: 'chronology', da: 'kronologi' },
  texts: { en: 'texts', da: 'tekster' },
  press: { en: 'press', da: 'presse' },
  about: { en: 'about', da: 'om' },
  archive: { en: 'archive', da: 'arkivet' },
  // Nested segment, only ever appearing inside a showing route.
  // TODO(terminology): confirm with the artist. "standpunkt" is chosen over a literal
  // "visning" because it names the camera POSITION rather than the act of viewing,
  // which is what the field actually records.
  view: { en: 'view', da: 'standpunkt' },
} as const satisfies Record<string, Record<Locale, string>>

export type SegmentId = keyof typeof SEGMENTS

/** The five doors, in the order they appear in navigation. Utility routes (press,
 *  about, archive) are deliberately not doors — they are reached from the footer and
 *  from context, because a door implies a way through the work. */
export const DOORS = ['works', 'exhibitions', 'venues', 'chronology', 'texts'] as const
export type DoorId = (typeof DOORS)[number]

export function segment(id: SegmentId, locale: Locale): string {
  return SEGMENTS[id][locale]
}

/** Reverse lookup: given a rendered segment in any locale, recover the internal id.
 *  Used when resolving an inbound URL to its equivalent in the other locale. */
const SEGMENT_LOOKUP: ReadonlyMap<string, SegmentId> = new Map(
  (Object.keys(SEGMENTS) as SegmentId[]).flatMap((id) =>
    LOCALES.map((l) => [SEGMENTS[id][l], id] as const),
  ),
)

export function segmentId(rendered: string): SegmentId | null {
  return SEGMENT_LOOKUP.get(rendered) ?? null
}

// ---------------------------------------------------------------------------
// URL builders. Every route in the site is constructed through one of these, so
// trailing-slash and prefix behaviour cannot drift between call sites.
// ---------------------------------------------------------------------------

function join(...parts: (string | number)[]): string {
  return `/${parts.filter((p) => p !== '' && p !== undefined).join('/')}/`
}

export const routes = {
  home: (locale: Locale) => join(locale),

  door: (id: DoorId, locale: Locale) => join(locale, segment(id, locale)),

  /** Utility routes. Separate from doors so navigation cannot accidentally list them. */
  press: (locale: Locale) => join(locale, segment('press', locale)),
  about: (locale: Locale) => join(locale, segment('about', locale)),
  archive: (locale: Locale) => join(locale, segment('archive', locale)),

  /** A work record — the identity spine. */
  work: (slug: string, locale: Locale) => join(locale, segment('works', locale), slug),

  /**
   * A showing record — work × venue × exhibition × dates. This is the atomic unit of
   * the archive and the route where photographs, plan, press and technical data live.
   * The slug is `[year]-[venue]`, which is human-readable, stable, and sortable.
   */
  showing: (workSlug: string, showingSlug: string, locale: Locale) =>
    join(locale, segment('works', locale), workSlug, showingSlug),

  /**
   * One viewpoint of one showing — the citable unit. The operational test the whole
   * URL grammar exists to satisfy: a curator must be able to send a colleague a link
   * to ONE specific installation view of ONE work at ONE venue, and cite it in a
   * footnote. Viewpoints >= 2 carry canonical -> showing (see seo.ts).
   */
  viewpoint: (workSlug: string, showingSlug: string, n: number, locale: Locale) =>
    join(locale, segment('works', locale), workSlug, showingSlug, segment('view', locale), n),

  exhibition: (slug: string, locale: Locale) =>
    join(locale, segment('exhibitions', locale), slug),

  venue: (slug: string, locale: Locale) => join(locale, segment('venues', locale), slug),

  text: (slug: string, locale: Locale) => join(locale, segment('texts', locale), slug),

  /**
   * The neutral inspection route. Locale-independent by design: it contains no prose,
   * only the photograph at 100% on a neutral field plus its measured facts. Zero
   * first-party JavaScript — the guarantee is architectural, not a promise.
   */
  inspect: (assetId: string) => join('inspect', assetId),
} as const

// ---------------------------------------------------------------------------
// Language toggle
// ---------------------------------------------------------------------------

/**
 * Translate a rendered pathname into the other locale, preserving the record.
 *
 * Content slugs are Shared (one slug across both locales) so that a work has exactly
 * one identity and one citation target regardless of interface language. Only the
 * structural segments are translated. This keeps `/en/works/vertical-hold/` and
 * `/da/vaerker/vertical-hold/` pointing at the same work, which is what makes the
 * toggle land on the equivalent record rather than the homepage.
 *
 * Query strings are preserved: a curator who filtered to one decade and switched
 * language keeps the filter. Losing it is the kind of small betrayal that teaches
 * people not to trust the control.
 */
export function translatePath(pathname: string, to: Locale, search = ''): string {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return routes.home(to) + search

  const [first, ...rest] = parts

  // A locale-independent route (e.g. /inspect/…) has no locale prefix to swap.
  if (!(LOCALES as readonly string[]).includes(first)) return pathname + search

  const translated = rest.map((part) => {
    const id = segmentId(part)
    return id ? segment(id, to) : part // content slugs pass through unchanged
  })

  return join(to, ...translated) + search
}
