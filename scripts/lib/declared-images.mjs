import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Every image the content model declares, from EVERY place it can be declared.
 *
 * Extracted because three separate scripts (seed-media, build-derivatives, build-social)
 * each grew their own copy of this walk, and each copy independently assumed that
 * documentation lives only on showings. When work-level documentation was added — for
 * works photographed before their showing context is established — all three broke, and
 * they broke at different times and with different symptoms:
 *
 *   seed-media      silently produced nothing
 *   build-derivatives  "No source images", failing the container build
 *   build-social       failing one step later, after the first was fixed
 *
 * One source of truth, so the next place documentation can live has to be taught to one
 * function rather than found three times by breakage.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const SOURCES = [
  join(root, 'src/content/showings'),
  join(root, 'src/content/works'),
]

/**
 * @returns {Promise<Array<{id: string, src: string, width: number, height: number, role: string}>>}
 */
export async function declaredImages() {
  const out = []

  for (const dir of SOURCES) {
    const files = await readdir(dir).catch(() => [])
    for (const f of files.filter((f) => f.endsWith('.json'))) {
      const data = JSON.parse(await readFile(join(dir, f), 'utf8'))
      for (const a of data.assets ?? []) {
        if (a.kind === 'image') {
          out.push({ id: a.id, src: a.file.src, width: a.file.width, height: a.file.height, role: a.role })
        }
        // A video's poster is a still image and goes through the same colour-managed
        // pipeline — never a vendor thumbnail endpoint, which re-encodes untagged.
        if (a.kind === 'video' && a.poster) {
          out.push({ id: `${a.id}-poster`, src: a.poster.src, width: a.poster.width, height: a.poster.height, role: 'poster' })
        }
      }
      // A work's key image, used in indexes.
      if (data.keyImage?.file) {
        out.push({
          id: data.keyImage.id, src: data.keyImage.file.src,
          width: data.keyImage.file.width, height: data.keyImage.file.height,
          role: data.keyImage.role,
        })
      }
    }
  }

  // Deduplicate by src: the same file may legitimately be declared once as a work's key
  // image and once as documentation.
  const seen = new Set()
  return out.filter((i) => (seen.has(i.src) ? false : (seen.add(i.src), true)))
}
