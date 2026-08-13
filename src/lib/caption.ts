import type { Locale } from './i18n'
import { resolveTranslated, title as titleOf, type OriginalWithGloss, type Translated } from './i18n'
import { formatDimensions, formatDateRange, formatDuration } from './format'
import { site } from './site'
import {
  IMAGE_ROLE_LABEL, PHOTO_CREDIT_PREFIX, PHOTOGRAPHER_UNKNOWN, NON_WORK_ROLES,
  type ImageRole, type PhotoCreditKind,
} from './schema/vocab'

/**
 * Caption construction, following the CAA Publications Style Guide (Sept 2021) — the
 * order art historians, editors and press are actually trained on:
 *
 *   Artist, Title (italic), Date, medium (on support), dimensions, [image type],
 *   [venue, city] (artwork © …; photograph © / by / provided by …)
 *
 * Worked example from the guide:
 *   Deborah Jack, SHORE, 2004, nylon screens, video projection, rock salt, reflecting
 *   pool, dimensions variable, installation view, Big Orbit Gallery, Buffalo, NY
 *   (artwork © Deborah Jack; photograph provided by the artist)
 *
 * Two rules the guide is emphatic about, and which almost every artist site breaks:
 *  - A caption "must distinguish clearly between a copyright in an artwork and in an
 *    image or photograph of an artwork". These are separate parties, always.
 *  - "Courtesy of" is NOT USED. Its presence is the reliable tell that a site was not
 *    built by anyone who publishes.
 *
 * The caption is returned as STRUCTURED PARTS rather than a string so that the title
 * can render inside <cite> with a correct `lang` attribute, while `toPlainText` gives
 * the exact same content as a copy-to-clipboard citation. One source, two renderings —
 * so what a curator pastes into a proposal cannot drift from what they read.
 */

export type CaptionPart =
  | { kind: 'text'; value: string }
  | { kind: 'title'; value: string; lang: Locale }
  | { kind: 'rights'; value: string }

export interface CaptionInput {
  title: OriginalWithGloss
  year: number
  yearEnd?: number | 'ongoing'
  materials?: Translated
  aiUse?: Translated
  dimensions?: { variable: boolean; heightCm?: number; widthCm?: number; depthCm?: number }
  durationSeconds?: number
  role?: ImageRole
  venueName?: string
  city?: string
  dates?: { start: string; end?: string; precision?: 'day' | 'month' | 'year' }
  credit?: {
    photographer: string
    photoCreditKind: PhotoCreditKind
    artworkCopyright?: string
    courtesy?: string
  }
  /** Resolves a contributor id to a display name. Ids that do not resolve fall through
   *  as-is, so a literal name typed into the field still renders correctly. */
  resolveName?: (id: string) => string
}

const UNKNOWN_LABEL = { en: 'photographer unknown', da: 'fotograf ukendt' }

export function buildCaption(input: CaptionInput, locale: Locale): CaptionPart[] {
  const parts: CaptionPart[] = []
  const push = (value: string) => parts.push({ kind: 'text', value })

  // Artist, Title, Date
  push(site.artistName)
  parts.push({ kind: 'title', value: titleOf(input.title), lang: input.title.lang })
  push(input.yearEnd === 'ongoing' ? `${input.year}–${locale === 'da' ? 'igangværende' : 'ongoing'}`
    : input.yearEnd ? `${input.year}–${input.yearEnd}` : String(input.year))

  // Medium and materials. AI use is appended INSIDE the materials clause because that
  // is where Statens Kunstfond requires it to appear, not as a separate disclosure.
  const materials = resolveTranslated(input.materials, locale).value
  if (materials) {
    const ai = resolveTranslated(input.aiUse, locale).value
    push(ai ? `${materials}, ${ai}` : materials)
  }

  if (input.dimensions) {
    const d = formatDimensions(input.dimensions, locale)
    if (d) push(d)
  }

  if (input.durationSeconds) push(formatDuration(input.durationSeconds, locale))

  // Image type. Statens Kunstfond requires captions to state whether an image shows
  // research or the work itself, so non-work roles are always made explicit.
  if (input.role) {
    const label = IMAGE_ROLE_LABEL[input.role][locale]
    if (NON_WORK_ROLES.includes(input.role)) {
      push(locale === 'da' ? `${label} — ikke værket selv` : `${label} — not the work itself`)
    } else {
      push(label.toLowerCase())
    }
  }

  if (input.venueName) push(input.city ? `${input.venueName}, ${input.city}` : input.venueName)
  if (input.dates) push(formatDateRange(input.dates, locale))

  // Rights, in parentheses, artwork copyright first. Never "Courtesy of".
  if (input.credit) {
    const resolve = input.resolveName ?? ((id: string) => id)
    const artwork = input.credit.artworkCopyright ?? site.artistName
    const rights = [`${locale === 'da' ? 'værk ©' : 'artwork ©'} ${artwork}`]

    if (input.credit.photographer === PHOTOGRAPHER_UNKNOWN) {
      rights.push(UNKNOWN_LABEL[locale])
    } else {
      const prefix = PHOTO_CREDIT_PREFIX[input.credit.photoCreditKind][locale]
      rights.push(`${prefix} ${resolve(input.credit.photographer)}`)
    }

    // The supplying party is named as a plain trailing clause. CAA has no "courtesy of"
    // construction, so the relationship is stated rather than dressed up.
    if (input.credit.courtesy) {
      rights.push(`${locale === 'da' ? 'stillet til rådighed af' : 'provided by'} ${input.credit.courtesy}`)
    }
    parts.push({ kind: 'rights', value: rights.join('; ') })
  }

  return parts
}

/** The copy-to-clipboard form. Byte-identical in content to what is rendered. */
export function toPlainText(parts: CaptionPart[]): string {
  const body: string[] = []
  let rights: string | null = null
  for (const p of parts) {
    if (p.kind === 'rights') rights = p.value
    else body.push(p.value)
  }
  return rights ? `${body.join(', ')} (${rights})` : body.join(', ')
}
