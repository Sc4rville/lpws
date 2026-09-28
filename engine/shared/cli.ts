/**
 * cli.ts — la ligne de commande commune à toutes les familles.
 *
 * Chaque module s'importe (par l'interface, par un autre module) ET se lance seul
 * (`npm run <famille>`). `estLance(import.meta.url)` dit lequel des deux : il compare le fichier
 * lancé au module, au lieu d'un `endsWith("run.ts")` que plusieurs fichiers satisfont.
 */
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export function estLance(moduleUrl: string): boolean {
  return !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(moduleUrl)
}

export type Args = {
  /** les arguments positionnels, dans l'ordre */
  libres: string[]
  /** la valeur de `--nom <valeur>` */
  option(nom: string): string | undefined
  /** `--nom` présent */
  drapeau(nom: string): boolean
}

/** `drapeaux` : les options SANS valeur. Toute autre `--option` prend l'argument qui la suit. */
export function lireArgs(drapeaux: string[] = [], argv = process.argv.slice(2)): Args {
  const libres: string[] = []
  const valeurs = new Map<string, string>()
  const presents = new Set<string>()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) { libres.push(a); continue }
    presents.add(a)
    if (!drapeaux.includes(a) && i + 1 < argv.length && !argv[i + 1].startsWith("--")) valeurs.set(a, argv[++i])
  }
  return { libres, option: (n) => valeurs.get(n), drapeau: (n) => presents.has(n) }
}
