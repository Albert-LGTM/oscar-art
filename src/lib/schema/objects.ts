import { z } from 'astro/zod'
import { translated, originalWithGloss } from '../i18n'
import {
  IMAGE_ROLES, VIDEO_ROLES, AUDIO_ROLES, DOCUMENT_ROLES,
  PHOTO_CREDIT_KIND, PHOTOGRAPHER_UNKNOWN,
  LIGHT_CONDITION, SOUND_CONFIGURATION,
} from './vocab'

/** Reusable objects shared across entities. */

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * A partial ISO date, accepted as either a string or a YAML date.
 *
 * YAML silently parses an unquoted `2024-11-02` into a Date object, so a markdown
 * frontmatter date fails validation unless the author remembers to quote it. Requiring
 * an artist to know YAML quoting rules in order to publish an essay is exactly the kind
 * of developer dependency this project exists to remove — so the schema absorbs both
 * forms and normalises to a string.
 *
 * Partial dates are allowed on purpose: "2019-09" is honest when the day is genuinely
 * not known, and an archive that renders a fabricated 01 to satisfy a validator is
 * lying in a way that looks like rigour.
 */
export const isoDate = () =>
  z
    .union([z.string(), z.date()])
    .transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v.trim()))
    .pipe(
      z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'Use YYYY, YYYY-MM or YYYY-MM-DD'),
    )

/**
 * A run of dates. `end` is optional because a showing may be currently open or
 * permanent — and because a partially-remembered date is better than a fabricated one.
 *
 * `precision` exists so the archive can be honest about what it actually knows. An
 * archive that renders "01.01.2009" when the real knowledge is "sometime in 2009" is
 * lying in a way that looks like rigour, which is worse than admitting the gap.
 */
export const dateRange = () =>
  z.object({
    start: isoDate(),
    end: isoDate().optional(),
    precision: z.enum(['day', 'month', 'year']).default('day'),
  })

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

/**
 * Height × width × depth, in that order, centimetres primary.
 *
 * The AAE caption standard puts inches first, but that is a US convention: Danish
 * institutions, Statens Kunstfond and every European funder work in cm. Inches are
 * rendered as a parenthetical only when the interface language is English.
 *
 * `variable: true` is a Getty CDWA controlled qualifier value, not an evasion — it sits
 * alongside approximately / sight / maximum / largest. For installation work it is
 * usually the TRUTH, and the per-showing `asInstalled` dimensions carry the real
 * numbers for each realisation.
 */
export const dimensions = () =>
  z.object({
    variable: z.boolean().default(false),
    heightCm: z.number().positive().optional(),
    widthCm: z.number().positive().optional(),
    depthCm: z.number().positive().optional(),
    /** Free text for irreducible cases: "comprises 10 panels; overall 280 × 215 cm". */
    note: translated().optional(),
  }).refine(
    (d) => d.variable || d.heightCm !== undefined || d.note !== undefined,
    { message: 'Give a measurement, or mark the dimensions variable, or write a note.' },
  )

// ---------------------------------------------------------------------------
// Credit — three separate parties, always
// ---------------------------------------------------------------------------

/**
 * CAA: a caption "must distinguish clearly between a copyright in an artwork and in an
 * image or photograph of an artwork". Three parties are stored separately and rendered
 * as one consistent line. "Courtesy of" is not used.
 *
 * `photographer` accepts the PHOTOGRAPHER_UNKNOWN sentinel so that an artist can
 * publish a 2004 archive scan whose photographer is genuinely unrecoverable. Requiring
 * an ANSWER without requiring a NAME is the difference between a schema that documents
 * reality and one that blocks the artist from using her own site.
 */
export const credit = () =>
  z.object({
    /** Contributor id, a literal name, or the "unknown" sentinel. */
    photographer: z.string().min(1),
    photoCreditKind: z.enum(PHOTO_CREDIT_KIND).default('by'),
    /** Defaults to the artist at render time when omitted. */
    artworkCopyright: z.string().optional(),
    /** The party that supplied the image or the permission — a gallery, a venue, a
     *  commissioner. Rendered as a plain trailing clause, never as "Courtesy of". */
    courtesy: z.string().optional(),
    /** Per-image rights note, e.g. VISDA-mediated reuse terms. */
    usageNote: translated().optional(),
  })

export function photographerIsUnknown(value: string): boolean {
  return value === PHOTOGRAPHER_UNKNOWN
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

/**
 * File-level facts. All Shared, all machine-derived at ingest, all read-only in the CMS.
 *
 * `width`/`height` are REQUIRED because they are what prevent layout shift, and because
 * publishing pixel dimensions beside the work is part of the inspection guarantee.
 * `colourProfile` is RECORDED, never silently normalised — the whole image pipeline
 * exists to stop a CDN quietly converting P3 to sRGB where nobody would notice.
 */
export const fileMeta = () =>
  z.object({
    src: z.string().min(1),
    originalFilename: z.string().optional(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    byteSize: z.number().int().positive().optional(),
    colourProfile: z.string().default('sRGB IEC61966-2.1'),
  })

/**
 * Where the subject sits, as fractions of width/height.
 *
 * USED ONLY FOR BROWSING THUMBNAILS. It is never applied to a plate, never to an
 * establishing view, and never to the inspection route. G. Colombel built exactly this
 * primitive and then fed it `1/1` for every asset of every project; the guard here is
 * that the Plate component's API cannot accept a focal point at all.
 */
export const focalPoint = () =>
  z.object({ x: z.number().min(0).max(1).default(0.5), y: z.number().min(0).max(1).default(0.5) })

/** Alt text: two tiers. */
export const altText = () =>
  z.object({
    /**
     * Artist-written description of what is IN THE ROOM. Optional, because requiring it
     * would block publication; warned on, because `alt=""` on an artwork — which is
     * what every one of the seven reference sites ships — is a catalogue failure, not a
     * styling detail.
     */
    described: translated().optional(),
    /** Set when the image genuinely carries no information beyond its caption. Forces a
     *  deliberate decision rather than letting an empty alt be the silent default. */
    decorative: z.boolean().default(false),
  })

export const imageAsset = () =>
  z.object({
    id: z.string().min(1),
    kind: z.literal('image'),
    role: z.enum(IMAGE_ROLES),
    /** Position within an ordered viewpoint set. Traversal order is entrance-then-
     *  clockwise, and it is never shuffled or randomised. */
    sequence: z.number().int().positive().optional(),
    file: fileMeta(),
    focal: focalPoint().optional(),
    caption: translated().optional(),
    alt: altText(),
    credit: credit(),
    /** Metres from the camera to the principal element, when surveyed. Feeds the scale
     *  rule; absent means the instrument simply does not render. */
    viewingDistanceM: z.number().positive().optional(),
  })

/**
 * Video. This block is what separates the site from every peer surveyed.
 *
 * Not one artist site in the survey states channel count, duration, aspect ratio, sound
 * configuration, loop behaviour or subtitle availability — so a curator cannot tell what
 * they are watching or what they would be borrowing.
 */
export const videoAsset = () =>
  z.object({
    id: z.string().min(1),
    kind: z.literal('video'),
    role: z.enum(VIDEO_ROLES),
    src: z.string().min(1),
    /** HLS manifest, when adaptive streaming is in use. Attached to a real <video>
     *  element via hls.js — never a bare .m3u8 src, because Firefox desktop has no
     *  native HLS and the circulating Chrome 142 support claim is unverified. */
    hls: z.string().optional(),
    /** Deliberately chosen frame, produced by OUR colour-managed pipeline. A vendor
     *  thumbnail endpoint decodes from the video colour space and re-encodes as an
     *  UNTAGGED JPEG, so posters must not come from one. */
    poster: fileMeta(),
    durationSeconds: z.number().positive(),
    channels: z.number().int().positive().default(1),
    aspectRatio: z.string().regex(/^\d+:\d+$/).default('16:9'),
    sound: z.enum(SOUND_CONFIGURATION).default('stereo'),
    /** True when the sound is constitutive of the work rather than incidental. Drives
     *  an explicit note beside the player, because installation sound is frequently
     *  work-defining and the site still must never start audio unexpectedly. */
    audioIsWorkDefining: z.boolean().default(false),
    loops: z.boolean().default(false),
    /**
     * Marks the ≤60-second condensed cut. Four independent Danish gatekeepers require
     * one — Statens Kunstfond, Charlottenborg Forårsudstilling, KE (mandatory alongside
     * the full version) and O—Overgaden. For a time-based practice this is the format
     * in which the work is actually judged in Denmark, so it is a first-class field
     * rather than an export-time afterthought.
     */
    isFundingCut: z.boolean().default(false),
    captionsFile: z.string().optional(),
    transcript: translated().optional(),
    caption: translated().optional(),
    credit: credit(),
  }).refine(
    (v) => !v.isFundingCut || v.durationSeconds <= 60,
    { message: 'A funding cut must be 60 seconds or shorter (Statens Kunstfond, KE, Charlottenborg).' },
  )

export const audioAsset = () =>
  z.object({
    id: z.string().min(1),
    kind: z.literal('audio'),
    role: z.enum(AUDIO_ROLES),
    src: z.string().min(1),
    durationSeconds: z.number().positive(),
    channels: z.number().int().positive().default(2),
    intendedListening: z.enum(['headphones', 'loudspeakers']).default('loudspeakers'),
    transcript: translated().optional(),
    captionsFile: z.string().optional(),
    caption: translated().optional(),
    credit: credit(),
  })

export const documentAsset = () =>
  z.object({
    id: z.string().min(1),
    kind: z.literal('document'),
    role: z.enum(DOCUMENT_ROLES),
    src: z.string().min(1),
    pageCount: z.number().int().positive().optional(),
    isDownloadable: z.boolean().default(true),
    caption: translated().optional(),
    credit: credit().optional(),
  })

export const anyAsset = () =>
  z.discriminatedUnion('kind', [imageAsset(), videoAsset(), audioAsset(), documentAsset()])

// ---------------------------------------------------------------------------
// Space, as installed — a public subset of the Guggenheim Iteration Report
// ---------------------------------------------------------------------------

/**
 * The highest-leverage differentiator available, and precisely what converts a
 * curator's interest into a shortlist entry. No artist website offers it; every
 * institution expects it (Electronic Arts Intermix specifies it as a document, not a
 * conversation, and wants it "well in advance").
 *
 * Every field is optional. The instrument renders what exists and is absent otherwise —
 * an empty field never renders as a placeholder, because a page advertising what the
 * artist failed to keep is worse than a page that simply does not make the claim.
 */
export const spaceAsInstalled = () =>
  z.object({
    roomWidthM: z.number().positive().optional(),
    roomDepthM: z.number().positive().optional(),
    ceilingHeightM: z.number().positive().optional(),
    floorAreaM2: z.number().positive().optional(),
    dedicatedSpace: z.boolean().optional(),
    wallSurface: translated().optional(),
    floorSurface: translated().optional(),
    light: z.enum(LIGHT_CONDITION).optional(),
    soundIsolation: z.boolean().optional(),
    /** Ordered wall polygon in metres, origin at the room's north-west corner. Feeds the
     *  inline-SVG plan and the iteration ledger. Absent means no plan is drawn. */
    plan: z.object({
      vertices: z.array(z.tuple([z.number(), z.number()])).min(3),
      doorAt: z.tuple([z.number(), z.number()]).optional(),
      workFootprint: z.array(z.tuple([z.number(), z.number()])).min(3).optional(),
      cameras: z.array(z.object({
        sequence: z.number().int().positive(),
        at: z.tuple([z.number(), z.number()]),
        bearingDeg: z.number().min(0).max(360).optional(),
      })).optional(),
    }).optional(),
  })

/** Technical requirements — the literal question a curator with a floor plan is asking. */
export const technicalRecord = () =>
  z.object({
    minimumFloorAreaM2: z.number().positive().optional(),
    minimumCeilingHeightM: z.number().positive().optional(),
    light: z.enum(LIGHT_CONDITION).optional(),
    sound: z.enum(SOUND_CONFIGURATION).optional(),
    soundIsolationRequired: z.boolean().optional(),
    powerDrawW: z.number().positive().optional(),
    dedicatedCircuits: z.number().int().positive().optional(),
    equipmentSuppliedByArtist: z.array(translated()).default([]),
    equipmentRequiredFromVenue: z.array(translated()).default([]),
    installCrewSize: z.number().int().positive().optional(),
    installDays: z.number().positive().optional(),
    notes: translated().optional(),
    /**
     * Public by default — it is what gets the artist invited, and no peer offers it.
     * The tier exists because a gallery may object, and that is the artist's call
     * rather than the schema's. Plan §32, decision 2.
     */
    visibility: z.enum(['public', 'on-request']).default('public'),
  })

export { originalWithGloss, translated }
