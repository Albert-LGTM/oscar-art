/**
 * Controlled vocabularies.
 *
 * These are not taxonomy for its own sake. Every vocabulary here drives rendering,
 * sequence or a machine-readable output, and each is traceable to an institutional
 * source rather than invented:
 *
 *  - Image roles      → Inside Installations (EU 2004–07) documentation strand B3,
 *                        plus the Guggenheim Iteration Report's "further documentation"
 *                        checklist, plus Statens Kunstfond's requirement that a caption
 *                        state whether an image shows research or the work itself.
 *  - Video roles      → Inside Installations' four documentation purposes.
 *  - Existence status → S.M.A.K. (Barrio), IVAM (Zorio) and Tate conservation practice.
 *  - Dimensions       → Getty CDWA, where "variable" is a controlled qualifier value
 *                        alongside approximately / sight / maximum / largest.
 *  - Credit vocabulary→ CAA Publications Style Guide (Sept 2021).
 */

// ---------------------------------------------------------------------------
// Image roles — drive sequence, layout, and the alt-text scaffold
// ---------------------------------------------------------------------------

/**
 * Order matters: this array IS the default display order of a showing's documentation.
 * Sequence is determined by role, never by aesthetics and never shuffled. The fixed-
 * perspective problem that the conservation literature identifies is solved by ORDERED
 * TRAVERSAL, not by variety — so a viewer moving through viewpoints is understood to be
 * moving through the room rather than flicking through pictures.
 */
export const IMAGE_ROLES = [
  'establishing',   // wide view of the full space, lit as a visitor would see it
  'viewpoint',      // an alternate documented position — part of an ordered N-of-M set
  'scale',          // a person in frame; the only reliable scale cue a photograph has
  'detail',         // material qualities the establishing view cannot carry
  'plan',           // floor plan, elevation, section — holds what photographs cannot
  'component',      // a single constituent element, often shot out of the room
  'install',        // process: the work being built
  'deinstall',      // de-installation, or the residual trace after removal
  'research',       // sketch, study, source material — NOT the work
  'portrait',       // the artist; never mixed into a work's documentation set
] as const

export type ImageRole = (typeof IMAGE_ROLES)[number]

/** Roles that depict the work as installed. Only these may open a showing record, and
 *  only these are offered as the home frontispiece. A research sketch or a portrait
 *  appearing as the 5-second payload would misrepresent the practice. */
export const WORK_DEPICTING_ROLES: readonly ImageRole[] = [
  'establishing',
  'viewpoint',
  'scale',
  'detail',
]

/** Statens Kunstfond requires captions to state whether an image shows research or the
 *  work itself. These roles must render an explicit qualifier in the caption. */
export const NON_WORK_ROLES: readonly ImageRole[] = ['research', 'install', 'deinstall', 'portrait']

// ---------------------------------------------------------------------------
// Video roles — four declared purposes, never a generic "video"
// ---------------------------------------------------------------------------

/**
 * A curator must never be unsure whether they are watching THE WORK or a recording of
 * a room containing the work. Every peer site surveyed — including Bill Viola's —
 * fails this. The label is rendered beside the player, carried into the credit line,
 * and emitted in structured data.
 */
export const VIDEO_ROLES = [
  'work',        // this IS the artwork (single-channel video work)
  'walkthrough', // spatial comprehension: moving through the installed room
  'excerpt',     // short browsing loop, explicitly labelled as partial
  'install',     // process documentation
] as const

export type VideoRole = (typeof VIDEO_ROLES)[number]

export const AUDIO_ROLES = ['work', 'excerpt', 'field-recording', 'interview', 'described-walkthrough'] as const
export type AudioRole = (typeof AUDIO_ROLES)[number]

export const DOCUMENT_ROLES = [
  'floor-plan', 'elevation', 'wiring-diagram', 'installation-instructions',
  'technical-rider', 'press-release', 'catalogue-text', 'certificate', 'press-clipping',
] as const
export type DocumentRole = (typeof DOCUMENT_ROLES)[number]

// ---------------------------------------------------------------------------
// Existence status — the site's conceptual spine, as a required field
// ---------------------------------------------------------------------------

/**
 * Most installations no longer exist. Institutions state this plainly; artist websites
 * never do. Making it a required controlled field re-frames every image on the page
 * from "portfolio shot" into "surviving trace" — which is both intellectually honest
 * and the most affecting thing the design does, at a cost of roughly 40 bytes of markup.
 *
 * `destroyed` and `documentation-only` render a dagger (†) after the title in every
 * index and running head — the scholarly siglum for lost. The dagger is NEVER the sole
 * indicator: it is wrapped in <abbr> and accompanied by the spelled-out status in the
 * record's apparatus, so it survives forced-colors, screen readers and monochrome print.
 *
 * INTEGRITY NOTE: the design must never reward a terminal status. `destroyed` requires
 * a source field (see work.ts) precisely because a dismantled-and-stored work quietly
 * recorded as destroyed would turn the archive into a mood.
 */
export const EXISTENCE_STATUS = [
  // The archive must be able to say "we have not established this". Every other value
  // asserts a fact about the work's survival; forcing a guess in order to satisfy an
  // enum is how a catalogue record becomes fiction.
  'not-recorded',
  'extant',              // still exists, installed or in storage as a complete work
  'de-installed',        // taken down; components retained; re-stageable
  'restageable',         // exists as instructions/certificate; materials re-acquired per showing
  'documentation-only',  // components gone; only the record survives
  'destroyed',           // deliberately or accidentally destroyed
] as const

export type ExistenceStatus = (typeof EXISTENCE_STATUS)[number]

/** Statuses that render the dagger. */
export const LOST_STATUSES: readonly ExistenceStatus[] = ['documentation-only', 'destroyed']

// ---------------------------------------------------------------------------
// Publication state — a SEPARATE axis from existence status, never merged
// ---------------------------------------------------------------------------

/** Whether the record is visible. Orthogonal to whether the work still exists: a
 *  destroyed work is usually public; an extant work may be an unpublished draft. */
export const PUBLICATION_STATE = ['draft', 'public', 'private', 'archived'] as const
export type PublicationState = (typeof PUBLICATION_STATE)[number]

// ---------------------------------------------------------------------------
// Credit vocabulary — CAA Publications Style Guide
// ---------------------------------------------------------------------------

/**
 * The guide is emphatic that captions "must distinguish clearly between a copyright in
 * an artwork and in an image or photograph of an artwork". Almost every artist site
 * collapses these into one "Courtesy the artist" line — which is precisely the tell
 * that the site was not built by anyone who publishes.
 *
 * "Courtesy of" is NOT USED. It is not in the CAA vocabulary; it signals an
 * intermediary who supplied the image or permission, and it is routinely misapplied as
 * a generic credit.
 */
export const PHOTO_CREDIT_KIND = [
  'copyright',   // photograph © Name
  'by',          // photograph by Name
  'provided-by', // photograph provided by Name
] as const
export type PhotoCreditKind = (typeof PHOTO_CREDIT_KIND)[number]

export const PHOTO_CREDIT_PREFIX: Record<PhotoCreditKind, { en: string; da: string }> = {
  copyright: { en: 'photograph ©', da: 'fotografi ©' },
  by: { en: 'photograph by', da: 'fotografi af' },
  'provided-by': { en: 'photograph provided by', da: 'fotografi stillet til rådighed af' },
}

/**
 * Pre-2010 archive material genuinely has no recoverable photographer. This sentinel
 * exists so that validation can require an ANSWER without requiring a NAME — the
 * alternative is an artist who cannot publish a 2004 installation shot, which breaks
 * the self-service guarantee outright.
 */
export const PHOTOGRAPHER_UNKNOWN = 'unknown' as const

// ---------------------------------------------------------------------------
// Contributor roles — from the Guggenheim Iteration Report's checklist
// ---------------------------------------------------------------------------

export const CONTRIBUTOR_ROLES = [
  'photographer', 'curator', 'registrar', 'art-handler', 'exhibition-designer',
  'media-technician', 'artist-assistant', 'conservator', 'fabricator', 'consultant',
  'external-company', 'composer', 'sound-designer', 'performer', 'writer', 'translator',
] as const
export type ContributorRole = (typeof CONTRIBUTOR_ROLES)[number]

// ---------------------------------------------------------------------------
// Spatial and technical vocabularies — the curator's actual questions
// ---------------------------------------------------------------------------

/** "Can my room take this?" is the first question a curator asks, and answering it in
 *  the interface is worth more than any transition effect. */
export const LIGHT_CONDITION = ['blackout', 'low', 'ambient', 'daylight', 'variable'] as const
export type LightCondition = (typeof LIGHT_CONDITION)[number]

export const SOUND_CONFIGURATION = ['silent', 'mono', 'stereo', 'multichannel', 'headphones'] as const
export type SoundConfiguration = (typeof SOUND_CONFIGURATION)[number]

/** How a showing relates to the work's specification. Three different verbs with three
 *  different truth-claims — the Getty uses "reinvention" for Kaprow's Fluids precisely
 *  because "reconstruction" and "reenactment" would both be false. */
export const SHOWING_KIND = ['first-realisation', 'restaging', 'reconstruction', 'reinvention', 'adaptation'] as const
export type ShowingKind = (typeof SHOWING_KIND)[number]

export const EXHIBITION_TYPE = ['solo', 'group', 'duo', 'biennial', 'commission', 'permanent', 'screening', 'performance'] as const
export type ExhibitionType = (typeof EXHIBITION_TYPE)[number]

// ---------------------------------------------------------------------------
// Human-readable labels, both locales
// ---------------------------------------------------------------------------

type L = { en: string; da: string }

export const IMAGE_ROLE_LABEL: Record<ImageRole, L> = {
  establishing: { en: 'Installation view', da: 'Installationsview' },
  viewpoint: { en: 'Installation view', da: 'Installationsview' },
  scale: { en: 'Installation view with visitor', da: 'Installationsview med besøgende' },
  detail: { en: 'Detail', da: 'Detalje' },
  plan: { en: 'Floor plan', da: 'Plantegning' },
  component: { en: 'Component', da: 'Element' },
  install: { en: 'Installation in progress', da: 'Under opbygning' },
  deinstall: { en: 'De-installation', da: 'Nedtagning' },
  research: { en: 'Research material', da: 'Researchmateriale' },
  portrait: { en: 'Portrait', da: 'Portræt' },
}

export const VIDEO_ROLE_LABEL: Record<VideoRole, L> = {
  work: { en: 'The work', da: 'Værket' },
  walkthrough: { en: 'Walkthrough', da: 'Gennemgang' },
  excerpt: { en: 'Excerpt', da: 'Uddrag' },
  install: { en: 'Installation process', da: 'Opbygning' },
}

export const EXISTENCE_STATUS_LABEL: Record<ExistenceStatus, L> = {
  'not-recorded': { en: 'Not yet recorded', da: 'Endnu ikke registreret' },
  extant: { en: 'Extant', da: 'Bevaret' },
  'de-installed': { en: 'De-installed; components retained', da: 'Nedtaget; elementer bevaret' },
  restageable: { en: 'Re-stageable from instructions', da: 'Kan genopføres efter anvisning' },
  'documentation-only': { en: 'Exists only as documentation', da: 'Eksisterer kun som dokumentation' },
  destroyed: { en: 'Destroyed', da: 'Destrueret' },
}

export const LIGHT_CONDITION_LABEL: Record<LightCondition, L> = {
  blackout: { en: 'Blackout required', da: 'Kræver fuldt mørklagt rum' },
  low: { en: 'Low light', da: 'Dæmpet lys' },
  ambient: { en: 'Ambient gallery light', da: 'Almindeligt udstillingslys' },
  daylight: { en: 'Daylight', da: 'Dagslys' },
  variable: { en: 'Variable', da: 'Varierende' },
}

export const SHOWING_KIND_LABEL: Record<ShowingKind, L> = {
  'first-realisation': { en: 'First realisation', da: 'Første opførelse' },
  restaging: { en: 'Re-staging', da: 'Genopførelse' },
  reconstruction: { en: 'Reconstruction', da: 'Rekonstruktion' },
  reinvention: { en: 'Reinvention', da: 'Genopfindelse' },
  adaptation: { en: 'Adapted for this space', da: 'Tilpasset dette rum' },
}
