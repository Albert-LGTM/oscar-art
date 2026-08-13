import { z } from 'astro/zod'

/**
 * Localisation — three field classes, applied per field.
 *
 * This is the single most consequential decision in the content model, and the place
 * bilingual artist sites most reliably go wrong. Two failure modes are being designed
 * out here:
 *
 *  1. DOCUMENT-level i18n (one document per language). It duplicates every number —
 *     dimensions, years, power draw, photographer names — and doubles the artist's
 *     work for no gain. Sanity's document-level i18n plugin is the default advice and
 *     is exactly what must not be used here.
 *
 *  2. TRANSLATING THINGS THAT ARE NOT TRANSLATABLE. A work's title is a proper name.
 *     "DEAD LABOUR" does not become "DØDT ARBEJDE" because the interface language
 *     changed. Neither do exhibition titles, venue names, or quoted press. Rendering a
 *     machine-translated work title destroys the citation and tells a curator the site
 *     was not built by anyone who publishes.
 */

export const LOCALES = ['en', 'da'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** The other locale. Used by the language toggle, which must land on the equivalent
 *  record — never the homepage. */
export function otherLocale(locale: Locale): Locale {
  return locale === 'en' ? 'da' : 'en'
}

// ---------------------------------------------------------------------------
// Class T — Translated. Full parallel authoring expected.
// ---------------------------------------------------------------------------

/**
 * Statements, curatorial texts, descriptive captions, alt text.
 *
 * Both locales are optional at the schema level because DRAFTS MUST ALWAYS SAVE — an
 * artist writing the Danish text on Tuesday and the English on Friday must not be
 * blocked on Tuesday. Publication-time validation (see validation.ts) warns on a
 * missing translation; it does not block, because a work documented in one language
 * is strictly better than a work missing from the archive.
 */
export const translated = () =>
  z.object({
    en: z.string().optional(),
    da: z.string().optional(),
  })

export type Translated = z.infer<ReturnType<typeof translated>>

/** How a translated field resolved. The marker is rendered; silence is not an option.
 *  A page-level toggle that hides untranslated content silently amputates the archive,
 *  and the visitor sees an emptier site in one language with no explanation. */
export type Resolution<T> =
  | { value: T; status: 'present'; lang: Locale }
  | { value: T; status: 'fallback'; lang: Locale; requested: Locale }
  | { value: null; status: 'absent'; lang: null; requested: Locale }

export function resolveTranslated(
  field: Translated | undefined,
  locale: Locale,
): Resolution<string> {
  const requested = locale
  const wanted = field?.[locale]
  if (wanted && wanted.trim()) return { value: wanted, status: 'present', lang: locale }

  const fallbackLang = otherLocale(locale)
  const fallback = field?.[fallbackLang]
  if (fallback && fallback.trim()) {
    return { value: fallback, status: 'fallback', lang: fallbackLang, requested }
  }
  return { value: null, status: 'absent', lang: null, requested }
}

// ---------------------------------------------------------------------------
// Class O — Original + Gloss. NEVER translated.
// ---------------------------------------------------------------------------

/**
 * Work titles, exhibition titles, venue names, quoted press.
 *
 * The original is authoritative and is always what renders as the title. `gloss` is an
 * optional parenthetical aid for readers of the other language — it is supplementary
 * information, never a replacement, and it is never substituted for the original in a
 * heading, a citation string, a caption, or structured data.
 *
 * `lang` is required so the rendered element can carry a correct `lang` attribute.
 * Without it a screen reader reads a Danish title with an English voice, which for a
 * proper name is both wrong and unintelligible.
 */
export const originalWithGloss = () =>
  z.object({
    original: z.string().min(1),
    lang: z.enum(LOCALES),
    gloss: z.object({ en: z.string().optional(), da: z.string().optional() }).optional(),
  })

export type OriginalWithGloss = z.infer<ReturnType<typeof originalWithGloss>>

/** The authoritative string. This is what goes in <h1>, captions, CAA citation strings,
 *  JSON-LD `name`, OG titles and the sitemap. There is no locale parameter, by design. */
export function title(field: OriginalWithGloss): string {
  return field.original
}

/** The optional parenthetical aid, only when it differs from the original and only in
 *  the locale being read. Returns null when there is nothing useful to add. */
export function gloss(field: OriginalWithGloss, locale: Locale): string | null {
  if (field.lang === locale) return null
  const g = field.gloss?.[locale]
  return g && g.trim() && g !== field.original ? g : null
}

// ---------------------------------------------------------------------------
// Class S — Shared. One value, no locale dimension at all.
// ---------------------------------------------------------------------------

/**
 * Dimensions, years, dates, power draw, channel counts, photographer names, ISO codes.
 *
 * Deliberately NOT a helper type — a shared field is just `z.number()` or `z.string()`.
 * Naming the class here exists so that a future contributor asking "should this be
 * localised?" finds the answer written down rather than guessing. If a field is a
 * measurement, a date, a proper name of a person, or a machine value, it is Shared.
 *
 * The one nuance: FORMATTING of shared values is locale-dependent even though storage
 * is not. Danish uses a decimal comma and DD.MM.YYYY. See format.ts.
 */
export const SHARED_FIELD_NOTE =
  'Shared: stored once, formatted per locale. See src/lib/format.ts.'
