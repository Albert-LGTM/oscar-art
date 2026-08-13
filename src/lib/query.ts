import { getCollection, getEntry, type CollectionEntry } from 'astro:content'
import { LOST_STATUSES, type ExistenceStatus } from './schema/vocab'

/**
 * The internal content API.
 *
 * Pages consume THIS shape, never a CMS response shape. When Sanity replaces the
 * git-managed JSON (plan §18), only this module changes — which is what makes the
 * claim "the CMS is replaceable" true rather than aspirational, and what lets the
 * archive outlive the vendor.
 *
 * Everything derivable is derived here and nowhere else. The CV, venue index,
 * per-showing press, chronology, door counts and "currently on view" are all
 * projections of Work + Showing. Nothing in the archive is authored twice, so nothing
 * can drift — which is the failure that makes Bill Viola's site an unmaintained CV and
 * leaves Johan Bech Jespersen's CV and archive as two chronologies that disagree.
 */

export type Work = CollectionEntry<'works'>
export type Showing = CollectionEntry<'showings'>
export type Venue = CollectionEntry<'venues'>
export type Exhibition = CollectionEntry<'exhibitions'>

/** Only published records reach the public site. `draft` and `private` never render;
 *  `archived` is reachable by direct URL but excluded from indexes. */
const isPublic = <T extends { data: { state?: string } }>(e: T) => e.data.state === 'public'
const isListable = isPublic

export interface ShowingRecord {
  entry: Showing
  venue: Venue
  exhibition?: Exhibition
  /** Sortable start date, for the ledger's shared axis and the chronology. */
  startYear: number
}

export interface WorkRecord {
  entry: Work
  showings: ShowingRecord[]
  /** Renders the dagger. Derived, never stored twice. */
  isLost: boolean
}

async function hydrateShowing(entry: Showing): Promise<ShowingRecord | null> {
  const venue = await getEntry(entry.data.venue)
  if (!venue) return null
  const exhibition = entry.data.exhibition ? await getEntry(entry.data.exhibition) : undefined
  return {
    entry,
    venue,
    exhibition: exhibition ?? undefined,
    startYear: Number(entry.data.dates.start.slice(0, 4)),
  }
}

/** All showings of one work, oldest first. Order is chronological and never shuffled:
 *  the ledger's whole argument is that the work is constant and the room is not, which
 *  is only legible in sequence. */
export async function showingsForWork(workId: string): Promise<ShowingRecord[]> {
  const all = await getCollection('showings', (s) => isPublic(s) && s.data.work.id === workId)
  const hydrated = await Promise.all(all.map(hydrateShowing))
  return hydrated
    .filter((s): s is ShowingRecord => s !== null)
    .sort((a, b) => a.entry.data.dates.start.localeCompare(b.entry.data.dates.start))
}

export async function getWorkRecord(work: Work): Promise<WorkRecord> {
  return {
    entry: work,
    showings: await showingsForWork(work.id),
    isLost: LOST_STATUSES.includes(work.data.existenceStatus as ExistenceStatus),
  }
}

/**
 * All public works.
 *
 * Default order is REVERSE CHRONOLOGICAL, not a hand-set sequence. A curated order is
 * legitimate — a portfolio is an argument, not a log — but it must be declared rather
 * than implied, and unrestricted drag-ordering across a growing archive is a rot
 * vector: every new work demands a re-sort, so it stops happening and the order becomes
 * a fossil. Featured works carry an explicit rank and are surfaced separately, on the
 * home composition, where the authorship is visible as authorship.
 */
export async function getWorkRecords(): Promise<WorkRecord[]> {
  const works = await getCollection('works', isListable)
  const records = await Promise.all(works.map(getWorkRecord))
  return records.sort((a, b) => b.entry.data.year - a.entry.data.year)
}

export async function getFeatured(): Promise<WorkRecord[]> {
  const all = await getWorkRecords()
  return all
    .filter((r) => r.entry.data.featured)
    .sort((a, b) => (a.entry.data.featuredRank ?? 99) - (b.entry.data.featuredRank ?? 99))
}

/**
 * Currently on view.
 *
 * AUTO-EMPTIES AND AUTO-HIDES. Doug Aitken's site surfaces CMS publish dates where work
 * years belong; Tillmans' installation-view archive silently stops around 2018. A
 * module that renders a past date is a staleness tell a visitor reads as neglect within
 * seconds — so this returns nothing rather than something stale, and the caller renders
 * nothing rather than an empty heading.
 */
export async function getOnView(today = new Date()): Promise<ShowingRecord[]> {
  const iso = today.toISOString().slice(0, 10)
  const all = await getCollection('showings', isPublic)
  const hydrated = await Promise.all(all.map(hydrateShowing))
  return hydrated
    .filter((s): s is ShowingRecord => s !== null)
    .filter((s) => {
      const { start, end } = s.entry.data.dates
      return start <= iso && (!end || end >= iso)
    })
}

/** Every showing, newest first — the chronology door, and the CV's exhibition lines. */
export async function getAllShowings(): Promise<ShowingRecord[]> {
  const all = await getCollection('showings', isPublic)
  const hydrated = await Promise.all(all.map(hydrateShowing))
  return hydrated
    .filter((s): s is ShowingRecord => s !== null)
    .sort((a, b) => b.entry.data.dates.start.localeCompare(a.entry.data.dates.start))
}

/** Showings at one venue. The venue door is a route no artist site offers and every
 *  institution recognises. */
export async function showingsAtVenue(venueId: string): Promise<ShowingRecord[]> {
  return (await getAllShowings()).filter((s) => s.venue.id === venueId)
}

/** Counts for the door labels. Derived, so a door can never advertise content that
 *  is not there — the Jeppe Hein failure, where nav links to a /works that 404s. */
export async function doorCounts() {
  const [works, showings, venues, exhibitions, texts] = await Promise.all([
    getCollection('works', isListable),
    getCollection('showings', isPublic),
    getCollection('venues', isListable),
    getCollection('exhibitions', isListable),
    getCollection('texts', isListable).catch(() => []),
  ])
  return {
    works: works.length,
    exhibitions: exhibitions.length,
    venues: venues.length,
    chronology: showings.length,
    texts: texts.length,
  }
}

/** Resolve a contributor id to a display name for caption rendering. Unresolved ids
 *  fall through unchanged, so a literal name typed into the field still renders. */
export async function nameResolver(): Promise<(id: string) => string> {
  const contributors = await getCollection('contributors')
  const map = new Map(contributors.map((c) => [c.id, c.data.name]))
  return (id: string) => map.get(id) ?? id
}
