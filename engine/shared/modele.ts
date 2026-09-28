/**
 * modele.ts — le seul endroit qui parle au modèle.
 *
 * Le modèle tourne sur les crédits du plan (`claude -p`, compte connecté), pas sur l'API au
 * jeton. Sa réponse n'est jamais crue sur parole : on en extrait le JSON, il passe le schéma, et
 * une réponse hors format est réessayée puis déclarée absente (`null`). Jamais une supposition.
 */
import { spawn } from "node:child_process"
import type { z } from "zod"
import { step } from "./log.ts"
import { premierEcart } from "./json.ts"

/** Le texte brut répondu par `claude -p`. Modèle : LPWS_MODELE, sinon sonnet. */
export function demander(prompt: string): Promise<string> {
  return new Promise((ok, ko) => {
    const p = spawn("claude", ["-p", "--output-format", "json", "--model", process.env.LPWS_MODELE ?? "sonnet"], { stdio: ["pipe", "pipe", "pipe"] })
    let out = "", err = ""
    p.stdout.on("data", (d) => out += d)
    p.stderr.on("data", (d) => err += d)
    p.on("error", (e) => ko(e))
    p.on("close", (code) => {
      if (code !== 0) return ko(new Error(`claude -p a quitté avec ${code} : ${err.slice(0, 200)}`))
      try { ok(String((JSON.parse(out) as { result?: string }).result ?? "")) } catch { ok(out) }
    })
    p.stdin.write(prompt); p.stdin.end()
  })
}

/** Le JSON contenu dans une réponse, du premier ouvrant au dernier fermant. */
export function extraireJson(t: string, forme: "objet" | "liste"): string {
  const [o, f] = forme === "objet" ? ["{", "}"] : ["[", "]"]
  const i = t.indexOf(o), j = t.lastIndexOf(f)
  return i >= 0 && j > i ? t.slice(i, j + 1) : t
}

/** La réponse validée par `schema`, ou `null` après `essais` réponses refusées. */
export async function demanderValide<S extends z.ZodTypeAny>(
  scope: string, prompt: string, schema: S, forme: "objet" | "liste", essais = 2,
): Promise<z.infer<S> | null> {
  for (let essai = 1; essai <= essais; essai++) {
    try {
      const r = schema.safeParse(JSON.parse(extraireJson(await demander(prompt), forme)))
      if (r.success) { step(scope, `réponse du modèle au contrat (essai ${essai})`); return r.data }
      step(scope, `réponse hors schéma (essai ${essai}) : ${premierEcart(r.error)}`)
    } catch (e) {
      step(scope, `échec (essai ${essai}) : ${String((e as Error).message).slice(0, 160)}`)
    }
  }
  return null
}
