/**
 * json.ts — lire et écrire l'état sur disque, validé.
 *
 * Toute la donnée de LPWS est du JSON sous clients/. Ce qui entre dans la machine passe un
 * schéma zod ; un fichier hors contrat produit un message qui dit quel champ et pourquoi.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import type { z } from "zod"

/** Le JSON du fichier, ou `defaut` s'il est absent ou illisible. */
export async function lireJson<T>(f: string, defaut: T): Promise<T> {
  try { return JSON.parse(await readFile(f, "utf8")) as T } catch { return defaut }
}

/** Écrit `v` en JSON indenté ; crée le dossier parent si besoin. */
export async function ecrireJson(f: string, v: unknown): Promise<void> {
  await mkdir(dirname(f), { recursive: true })
  await writeFile(f, JSON.stringify(v, null, 2))
}

/** Les écarts au schéma, une ligne par champ. */
export function ecarts(e: z.ZodError): string {
  return e.issues.map((i) => `  · ${i.path.join(".") || "(racine)"} : ${i.message}`).join("\n")
}

/** Première cause d'un refus, sur une ligne (pour les journaux d'essais). */
export function premierEcart(e: z.ZodError): string {
  const i = e.issues[0]
  return i ? `${i.path.join(".")} ${i.message}` : "?"
}

/** Le fichier lu et validé ; sinon une erreur qui nomme le fichier et les champs fautifs. */
export async function lireValide<S extends z.ZodTypeAny>(schema: S, f: string): Promise<z.infer<S>> {
  let brut: unknown
  try { brut = JSON.parse(await readFile(f, "utf8")) } catch (e) { throw new Error(`${f} illisible : ${(e as Error).message}`) }
  const r = schema.safeParse(brut)
  if (!r.success) throw new Error(`${f} hors contrat :\n${ecarts(r.error)}`)
  return r.data
}

/** Comme `lireValide`, mais un cache absent ou d'un ancien format vaut `null` : on recalcule. */
export async function lireCache<S extends z.ZodTypeAny>(schema: S, f: string): Promise<z.infer<S> | null> {
  const brut = await lireJson<unknown>(f, undefined)
  if (brut === undefined) return null
  const r = schema.safeParse(brut)
  return r.success ? r.data : null
}
