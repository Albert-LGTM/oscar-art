import { defineCollection, z, reference } from 'astro:content'
import { glob } from 'astro/loaders'
import { translated, originalWithGloss } from './lib/i18n'
import {
  dateRange, dimensions, anyAsset, imageAsset,
  spaceAsInstalled, technicalRecord, isoDate,
} from './lib/schema/objects'
import {
  EXISTENCE_STATUS, PUBLICATION_STATE, CONTRIBUTOR_ROLES,
  EXHIBITION_TYPE, SHOWING_KIND,
} from './lib/schema/vocab'

/**
 * Content model.
 *
 * The spine is WORK 1—n SHOWING. This is the profession's own structure — the
 * Identity Report / Iteration Report pair developed at the Guggenheim and adopted by
 * the Met, Whitney, Hirshhorn and SAAM — and no artist website in the survey
 * implements it. A work record is identity; a showing record is where photographs,
 * plan, press and technical data actually live.
 *
 * The frontend consumes THIS shape, not a CMS response shape. Sanity (plan §18) plugs
 * in behind the same interface via a loader swap, so the CMS stays replaceable and the
 * archive can outlive it. Until then, git-managed JSON is a legitimate production
 * choice on its own terms for an archive of this size: versioned, diffable, portable,
 * and with no upgrade treadmill.
 */

const asset = anyAsset()

// ---------------------------------------------------------------------------
// Work — the identity spine
// ---------------------------------------------------------------------------

const works = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/works' }),
  schema: z.object({
    title: originalWithGloss(),
    /** Year of the work's conception/first realisation. NOT the upload date — Johan
     *  Bech Jespersen's site stamps every work with its WordPress publish date, so the
     *  wrong year is the machine-readable one and "Archives" tells a curator when the
     *  website was built. */
    year: z.number().int().min(1900).max(2100),
    /** For ongoing works: renders as "2019–ongoing" (CAA convention). */
    yearEnd: z.union([z.number().int(), z.literal('ongoing')]).optional(),

    /** Materials list. Translated, because material names are prose in a caption. */
    materials: translated(),
    /**
     * Statens Kunstfond requires disclosure of AI use INSIDE the materials line.
     * Retrofitting this across an archive later is painful; it costs nothing now.
     */
    aiUse: translated().optional(),

    dimensions: dimensions(),
    durationSeconds: z.number().positive().optional(),
    edition: translated().optional(),

    existenceStatus: z.enum(EXISTENCE_STATUS),
    /** Required when the status is terminal. The design must never reward a terminal
     *  cap: without a source, a dismantled-and-stored work can be quietly recorded as
     *  destroyed and the archive becomes a mood. */
    existenceSource: z.string().optional(),
    /** ≤140 characters, artist-written, in the artist's own voice. The highest
     *  emotional-impact-per-byte element in the whole design. */
    existenceNote: translated().optional(),

    /** 80–150 words. The field's own instrument (Inside Installations, step 2): "a
     *  reasoned, clear summary of the values, meaning and importance". It is exactly
     *  what a curator reads in the 30-second window. */
    statementOfSignificance: translated().optional(),
    /** The full curatorial text. */
    text: translated().optional(),

    /** What is fixed and what adapts to the space — what converts the site into a
     *  working instrument for a curator weighing a re-staging. */
    variability: translated().optional(),
    components: z.array(translated()).default([]),

    technical: technicalRecord().optional(),

    tags: z.array(reference('tags')).default([]),
    /** Typed edges only. An untyped "see also" can only be rendered as a thumbnail row;
     *  a typed one can be rendered as a sentence and reasoned about. */
    related: z.array(z.object({
      work: reference('works'),
      relation: z.enum(['version-of', 'remade-as', 'part-of', 'precedes', 'follows', 'component-of', 'responds-to']),
    })).default([]),

    /** The work's key image, used in indexes. Always rendered at native aspect. */
    keyImage: imageAsset().optional(),

    state: z.enum(PUBLICATION_STATE).default('draft'),
    featured: z.boolean().default(false),
    featuredRank: z.number().int().positive().optional(),

    seo: z.object({
      title: z.string().max(60).optional(),
      description: z.string().max(155).optional(),
    }).optional(),

    lastReviewedOn: isoDate().optional(),
  }).refine(
    (w) => !['destroyed', 'documentation-only'].includes(w.existenceStatus) || !!w.existenceSource,
    { message: 'A terminal existence status needs a source. Who confirmed it, and when?' },
  ),
})

// ---------------------------------------------------------------------------
// Showing — the atomic unit (work × venue × exhibition × dates)
// ---------------------------------------------------------------------------

const showings = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/showings' }),
  schema: z.object({
    work: reference('works'),
    venue: reference('venues'),
    exhibition: reference('exhibitions').optional(),

    /** URL segment: [year]-[venue]. Human-readable, stable, sortable. */
    slug: z.string().regex(/^\d{4}-[a-z0-9-]+$/, 'Use [year]-[venue-slug], e.g. 2024-charlottenborg'),
    dates: dateRange(),

    /** Three verbs with three different truth-claims. The Getty uses "reinvention" for
     *  Kaprow's Fluids precisely because "reconstruction" would be false. */
    kind: z.enum(SHOWING_KIND).default('first-realisation'),

    /** Realised dimensions for THIS room. The work-level dimensions may legitimately be
     *  "variable"; these are the real numbers, per realisation. */
    asInstalledDimensions: dimensions().optional(),
    space: spaceAsInstalled().optional(),

    /** Ordered documentation. Sequence follows role, then the entrance-then-clockwise
     *  traversal order — never shuffled, never randomised. */
    assets: z.array(asset).default([]),

    /** Press attaches to THE SHOWING, not to the artist in general. A review of the
     *  Malmö showing belongs on the Malmö record as well as in the press index; a flat
     *  reverse-chronological press list is strictly weaker and is what everyone ships. */
    press: z.array(reference('press')).default([]),

    contributors: z.array(z.object({
      contributor: reference('contributors'),
      role: z.enum(CONTRIBUTOR_ROLES),
    })).default([]),

    note: translated().optional(),
    /** What this documentation cannot carry — stated rather than simulated. The
     *  conservation literature is explicit that photographs lose light, scale, sound and
     *  duration; naming the loss is more honest than compensating for it with an effect. */
    notRecorded: translated().optional(),

    state: z.enum(PUBLICATION_STATE).default('draft'),
    lastReviewedOn: isoDate().optional(),
  }),
})

// ---------------------------------------------------------------------------
// Exhibition, Venue
// ---------------------------------------------------------------------------

const exhibitions = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/exhibitions' }),
  schema: z.object({
    title: originalWithGloss(),
    type: z.enum(EXHIBITION_TYPE),
    venue: reference('venues'),
    dates: dateRange(),
    curators: z.array(reference('contributors')).default([]),
    text: translated().optional(),
    assets: z.array(asset).default([]),
    press: z.array(reference('press')).default([]),
    externalUrl: z.url().optional(),
    state: z.enum(PUBLICATION_STATE).default('draft'),
  }),
})

const venues = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/venues' }),
  schema: z.object({
    /** Venue names are proper names: Original + Gloss, never translated. */
    name: originalWithGloss(),
    city: z.string().min(1),
    country: z.string().length(2, 'ISO 3166-1 alpha-2'),
    kind: z.enum(['museum', 'kunsthal', 'gallery', 'artist-run', 'public-space', 'biennial', 'institution', 'other']),
    coordinates: z.tuple([z.number(), z.number()]).optional(),
    website: z.url().optional(),
    /** Primary content when works are outdoor, public or permanent. */
    visitingInfo: translated().optional(),
    state: z.enum(PUBLICATION_STATE).default('public'),
  }),
})

// ---------------------------------------------------------------------------
// Contributor, Press, Text, CV, Tag
// ---------------------------------------------------------------------------

const contributors = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/contributors' }),
  schema: z.object({
    /** Personal names are Shared — never translated, never glossed. */
    name: z.string().min(1),
    roles: z.array(z.enum(CONTRIBUTOR_ROLES)).default([]),
    website: z.url().optional(),
    /** Authority identifiers. Verified absent from every artist archive surveyed, while
     *  the Whitney publishes exactly these. Near-zero cost, museum-grade signal. */
    sameAs: z.array(z.url()).default([]),
  }),
})

const press = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/press' }),
  schema: z.object({
    /** Quoted material is Original + Gloss: never machine-translate a review. */
    title: originalWithGloss(),
    publication: z.string().min(1),
    author: z.string().optional(),
    date: isoDate(),
    url: z.url().optional(),
    /** Verified date for the link. Feeds the staleness warning — a dead press link on
     *  an archive of record is worse than no link. */
    urlCheckedOn: isoDate().optional(),
    excerpt: originalWithGloss().optional(),
    language: z.enum(['en', 'da', 'other']).default('en'),
    state: z.enum(PUBLICATION_STATE).default('public'),
  }),
})

const texts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/texts' }),
  schema: z.object({
    title: originalWithGloss(),
    author: z.string().optional(),
    date: isoDate(),
    kind: z.enum(['essay', 'interview', 'artist-text', 'catalogue-text', 'review']),
    language: z.enum(['en', 'da']),
    /** Set when this text has a parallel version in the other language. */
    counterpart: z.string().optional(),
    relatedWorks: z.array(reference('works')).default([]),
    state: z.enum(PUBLICATION_STATE).default('draft'),
  }),
})

/**
 * CV entries — ONLY for lines that cannot be derived.
 *
 * Every exhibition line in the CV is generated from Showings + Exhibitions and must
 * never be typed twice. This collection holds education, awards, residencies,
 * collections, teaching — the lines with no showing behind them. Bill Viola's site is
 * the "unmaintained CV" end-state; a derived CV cannot drift from the archive.
 */
const cv = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/cv' }),
  schema: z.object({
    section: z.enum(['education', 'awards', 'grants', 'residencies', 'collections', 'commissions', 'teaching', 'publications']),
    year: z.number().int(),
    yearEnd: z.number().int().optional(),
    title: translated(),
    organisation: z.string().optional(),
    city: z.string().optional(),
    country: z.string().length(2).optional(),
    /** Statens Kunstfond and Ny Carlsbergfondet both cap the CV at ONE page, while
     *  Artquest/O—Overgaden expect two. The same data must render at three lengths, so
     *  the short list is a curated flag rather than a separate document. */
    includeInShortCv: z.boolean().default(false),
  }),
})

/**
 * Categories in the ARTIST'S OWN VOCABULARY.
 *
 * The Felix Gonzalez-Torres Foundation's 19 categories work only because they are
 * Gonzalez-Torres's own words. Generic buckets ("Projects", "Installations") are worse
 * than none. The type ships now; instances stay empty until the CV arrives — this is a
 * launch-blocking content task, not a design decision. Plan §32.
 */
const tags = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/tags' }),
  schema: z.object({
    label: originalWithGloss(),
    description: translated().optional(),
  }),
})

export const collections = { works, showings, exhibitions, venues, contributors, press, texts, cv, tags }
