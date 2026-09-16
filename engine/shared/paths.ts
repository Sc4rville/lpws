/**
 * paths.ts — résolution des chemins de sortie.
 *
 * Toute la donnée produite vit sous `clients/<client>/<campagne>/` :
 *   baseline/   ← le clone fidèle de la LP actuelle (famille clone)
 *   variants/   ← les variantes générées (famille à venir)
 *
 * Une seule fonction fabrique ces chemins → aucune famille n'invente sa propre arborescence.
 */
import { mkdir } from "node:fs/promises"
import { join } from "node:path"

export const CLIENTS_ROOT = "clients"

/** slug sûr pour dossiers : "Acme SaaS!" → "acme-saas" ; "www.acme.io" → "acme-io" */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/^www\./, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Dossier baseline d'une campagne (créé si absent). */
export async function baselineDir(client: string, campaign: string): Promise<string> {
  const dir = join(CLIENTS_ROOT, slugify(client), slugify(campaign), "baseline")
  await mkdir(join(dir, "assets"), { recursive: true })
  return dir
}
