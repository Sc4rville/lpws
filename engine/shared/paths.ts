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

/**
 * Marque d'un client depuis l'URL de sa page : "https://www.atlassian.com/software/jira"
 * → "atlassian". C'est ce nom qui range la donnée, parce qu'un dossier doit se lire sans
 * décodeur — jamais un slug d'URL ni un nom de lot ("corpus", "test").
 */
export function marque(url: string): string {
  const hote = new URL(url).hostname.replace(/^www\./, "")
  // une page servie en local (IP, localhost) n'a pas de marque dans son adresse : « 127.0.0.1 »
  // donnait le client « 0 ». Le vrai nom arrive avec l'analyse de la page.
  if (/^(localhost|.+\.localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i.test(hote)) return "local"
  // on retire le TLD (et le TLD composé type .co.uk) : "atlassian.com" → "atlassian"
  const parts = hote.split(".")
  const garde = parts.length > 2 && parts.at(-2)!.length <= 3 ? parts.slice(0, -2) : parts.slice(0, -1)
  return slugify(garde.at(-1) ?? hote)
}

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

/** Dossier d'une variante, voisin de baseline/ (créé si absent). */
export async function variantDir(baseline: string, nom: string): Promise<string> {
  // baseline = clients/<client>/<campagne>/baseline → ../variants/<nom>
  const dir = join(baseline, "..", "variants", slugify(nom))
  await mkdir(dir, { recursive: true })
  return dir
}
