import type { Locale } from './i18n'

/**
 * Global site identity.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * The artist's NAME is real. Everything attached to it below — contact details, the
 * works, the venues, the exhibition history — is still placeholder and must be
 * replaced in Phase 0. Nothing here asserts a fact about a real person's career.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const PLACEHOLDER = true

export const site = {
  /** The name that appears in captions, JSON-LD and the copyright line. */
  artistName: 'Oscar de Palo',
  /** Where the practice is based. */
  location: 'København, DK',

  /** Contact must be a NAMED HUMAN with a direct address. Curators told researchers
   *  they want "multiple modes of contact (phone and email, not just a comment form)",
   *  and Louisiana's press page names a person with a mobile number. A bare form is
   *  below the institutional norm the artist is measured against. */
  contact: {
    name: 'Oscar de Palo',
    email: 'placeholder@example.invalid',
    phone: undefined as string | undefined,
  },

  /** Set once VISDA membership is confirmed — it determines the entire press-usage
   *  paragraph. In Denmark only VISDA can issue image licences with aftalelicens
   *  effect, so press will hesitate without a clear statement. Plan §32, decision 5. */
  visdaMember: undefined as boolean | undefined,

  /** Authority identifiers, when they exist. Verified absent from every artist archive
   *  surveyed, while the Whitney publishes exactly these. */
  sameAs: [] as string[],

  /** Rendered in the archive apparatus. */
  archiveEstablished: 2026,
} as const

/** Interface strings. Deliberately few — the site's register is the content's, and an
 *  archive that needs a lot of interface copy is explaining itself too much. */
export const ui = {
  siteRole: { en: 'Archive of record', da: 'Arkiv' },
  skipToContent: { en: 'Skip to content', da: 'Gå til indhold' },
  doors: {
    works: { en: 'Works', da: 'Værker' },
    exhibitions: { en: 'Exhibitions', da: 'Udstillinger' },
    venues: { en: 'Venues', da: 'Steder' },
    chronology: { en: 'Chronology', da: 'Kronologi' },
    texts: { en: 'Texts', da: 'Tekster' },
  },
  press: { en: 'Press', da: 'Presse' },
  about: { en: 'About', da: 'Om' },
  archive: { en: 'About this archive', da: 'Om dette arkiv' },

  showings: { en: 'Showings', da: 'Opførelser' },
  showingsCount: {
    en: (n: number) => (n === 1 ? '1 showing' : `${n} showings`),
    da: (n: number) => (n === 1 ? '1 opførelse' : `${n} opførelser`),
  },
  statement: { en: 'On this work', da: 'Om værket' },
  specification: { en: 'Specification', da: 'Specifikation' },
  technical: { en: 'Technical record', da: 'Teknisk ark' },
  asInstalled: { en: 'As installed', da: 'Som opstillet' },
  credits: { en: 'Credits', da: 'Medvirkende' },
  notRecorded: { en: 'Not recorded', da: 'Ikke dokumenteret' },
  viewpoint: {
    en: (n: number, of: number) => `Viewpoint ${n} of ${of}`,
    da: (n: number, of: number) => `Standpunkt ${n} af ${of}`,
  },
  inspect: { en: 'Inspect at full size', da: 'Se i fuld størrelse' },
  copyCitation: { en: 'Copy citation', da: 'Kopiér henvisning' },

  /** Shown wherever a translated field fell back to the other language. Silence is not
   *  an option: a page-level toggle that hides untranslated content silently amputates
   *  the archive, and the visitor sees an emptier site with no explanation. */
  fallbackNotice: {
    en: 'Not yet translated — shown in Danish',
    da: 'Endnu ikke oversat — vises på engelsk',
  },

  /** The dagger's expansion. Never the sole indicator of existence status. */
  daggerMeaning: { en: 'no longer extant', da: 'ikke længere bevaret' },

  langToggle: { en: 'Dansk', da: 'English' },
} as const

export function t<T extends { en: string; da: string }>(entry: T, locale: Locale): string {
  return entry[locale]
}
