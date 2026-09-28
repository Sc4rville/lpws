/** config.ts : les chemins et l'adresse publique du tag, communs à tout le serveur de l'interface. */
import { join, resolve } from "node:path"
import { CLIENTS_ROOT } from "../../engine/shared/paths.ts"

export const ROOT = resolve(import.meta.dirname, "..", "..")
export const DIST = join(ROOT, "ui", "dist")
export const TSX = join(ROOT, "node_modules", ".bin", "tsx")
/** l'adresse publique des fichiers du tag : celle que le buyer colle dans GTM */
export const BASE_TAGS = process.env.LPWS_BASE ?? "https://lpws.vercel.app"
const NOM = /^[\w-][\w.-]*$/
/** Le dossier d'une campagne ; un nom qui sortirait de clients/ lève. */
export const dossier = (c: string, camp: string) => {
  if (!NOM.test(c) || !NOM.test(camp)) throw Object.assign(new Error("client inconnu"), { code: 404 })
  return join(ROOT, CLIENTS_ROOT, c, camp)
}
