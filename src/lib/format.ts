import type { Locale } from './i18n'

/**
 * Formatting of Shared values.
 *
 * Storage is locale-independent; presentation is not. Danish uses a decimal comma,
 * DD.MM.YYYY dates, and an en-dash range without spaces. Getting this wrong is the kind
 * of detail that tells a Danish reader the site was translated rather than authored.
 */

const DA_MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december']
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

type Precision = 'day' | 'month' | 'year'

/** Parse a partial ISO date without letting the runtime apply a timezone offset —
 *  `new Date('2019-09')` is UTC-midnight and can render as August in a western zone. */
function parts(iso: string): { y: number; m?: number; d?: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y: y!, m, d }
}

export function formatDate(iso: string, locale: Locale, precision: Precision = 'day'): string {
  const { y, m, d } = parts(iso)
  const months = locale === 'da' ? DA_MONTHS : EN_MONTHS

  if (precision === 'year' || m === undefined) return String(y)
  if (precision === 'month' || d === undefined) {
    return locale === 'da' ? `${months[m - 1]} ${y}` : `${months[m - 1]} ${y}`
  }
  return locale === 'da'
    ? `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
    : `${d} ${months[m - 1]} ${y}`
}

/** A run of dates. Collapses to a single date when there is no end, and to a bare year
 *  pair when the precision is coarse. */
export function formatDateRange(
  range: { start: string; end?: string; precision?: Precision },
  locale: Locale,
): string {
  const p = range.precision ?? 'day'
  const start = formatDate(range.start, locale, p)
  if (!range.end) return start
  const end = formatDate(range.end, locale, p)
  if (start === end) return start
  return `${start} – ${end}`
}

/** Year, or an open-ended run. CAA renders in-progress works as "2004–ongoing". */
export function formatYear(year: number, yearEnd: number | 'ongoing' | undefined, locale: Locale): string {
  if (yearEnd === undefined) return String(year)
  if (yearEnd === 'ongoing') return locale === 'da' ? `${year}–igangværende` : `${year}–ongoing`
  return `${year}–${yearEnd}`
}

/** Danish uses a decimal comma. */
export function formatNumber(n: number, locale: Locale, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(locale === 'da' ? 'da-DK' : 'en-GB', { maximumFractionDigits }).format(n)
}

/**
 * Dimensions, height × width × depth in that order, centimetres primary.
 *
 * The AAE caption standard puts inches first, but that is a US convention — Danish
 * institutions and every European funder work in cm. Inches appear only as an English
 * parenthetical, and only when the numbers are exact.
 */
export function formatDimensions(
  d: { variable: boolean; heightCm?: number; widthCm?: number; depthCm?: number },
  locale: Locale,
): string | null {
  const axes = [d.heightCm, d.widthCm, d.depthCm].filter((v): v is number => v !== undefined)
  if (axes.length === 0) {
    return d.variable ? (locale === 'da' ? 'Mål varierer' : 'Dimensions variable') : null
  }
  const cm = axes.map((v) => formatNumber(v, locale)).join(' × ') + ' cm'
  if (locale === 'da') return cm
  const inches = axes.map((v) => formatNumber(v / 2.54, locale, 0)).join(' × ')
  return `${cm} (${inches} in)`
}

export function formatDuration(seconds: number, locale: Locale): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  const clock = `${m}:${String(s).padStart(2, '0')}`
  return locale === 'da' ? `${clock} min.` : `${clock} min.`
}

export function formatArea(m2: number, locale: Locale): string {
  return `${formatNumber(m2, locale)} m²`
}

export function formatLength(m: number, locale: Locale): string {
  return `${formatNumber(m, locale)} m`
}
