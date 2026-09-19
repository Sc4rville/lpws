/**
 * variantes.ts — des constats aux trois variantes prêtes à lancer.
 *
 * Le diagnostic dit QUOI changer et POURQUOI (une règle, une source). Ici on décide COMMENT :
 * le nouveau texte d'un titre, d'un bouton, l'ordre de deux sections. C'est un moment
 * d'écriture, donc un modèle ; mais il écrit dans un cadre fermé, et sa sortie passe le même
 * contrat zod que n'importe quelle variante faite à la main (apply/spec.ts). Une proposition
 * hors contrat n'existe pas.
 *
 * Les limites qu'on lui impose ne sont pas de la politesse, ce sont celles du brain :
 *   · n'écrire que ce que la page affirme déjà, jamais un chiffre, une garantie, un client ;
 *   · une variante = une hypothèse = une ou deux éditions, pas une nouvelle page ;
 *   · la langue de la page, le ton de la page, pas de superlatif ;
 *   · une ancre existante, sinon rien.
 *
 * Tourne sur les crédits du plan (`claude -p`), comme le jugement.
 */
import { spawn } from "node:child_process"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { VariantSpec } from "../apply/spec.ts"
import type { Constat } from "./diagnostic.ts"
import type { SignauxMecaniques } from "./signaux.ts"
import type { Contexte } from "./contexte.ts"
import { slugify } from "../shared/paths.ts"
import { step } from "../shared/log.ts"

const SCOPE = "variant/variantes"

const Proposition = z.object({
  regle: z.string(),
  titre: z.string().min(4).max(70),
  hypothese: z.string().min(20),
  metrique: z.string().min(3),
  risque: z.string().min(3),
  edits: z.array(z.object({
    anchor: z.string(),
    op: z.enum(["set", "remove", "move", "swap", "duplicate"]).default("set"),
    text: z.string().optional(),
    before: z.string().optional(),
    after: z.string().optional(),
    with: z.string().optional(),
    as: z.string().optional(),
    pourquoi: z.string().min(3),
  })).min(1).max(2),
})
const Propositions = z.array(Proposition).min(1).max(4)

function claude(prompt: string): Promise<string> {
  return new Promise((ok, ko) => {
    const p = spawn("claude", ["-p", "--output-format", "json", "--model", "sonnet"], { stdio: ["pipe", "pipe", "pipe"] })
    let out = "", err = ""
    p.stdout.on("data", (d) => out += d); p.stderr.on("data", (d) => err += d)
    p.on("close", (code) => {
      if (code !== 0) return ko(new Error(`claude -p a quitté avec ${code} : ${err.slice(0, 200)}`))
      try { ok(String((JSON.parse(out) as { result?: string }).result ?? "")) } catch { ok(out) }
    })
    p.stdin.write(prompt); p.stdin.end()
  })
}
const extraireJson = (t: string) => { const i = t.indexOf("["), j = t.lastIndexOf("]"); return i >= 0 && j > i ? t.slice(i, j + 1) : t }

function cadre(constats: Constat[], m: SignauxMecaniques, c: Contexte, langue: string): string {
  const ancres = [
    m.hero.titreAnchor && `${m.hero.titreAnchor} = TITRE « ${m.hero.titre} »`,
    m.hero.sousTitreAnchor && `${m.hero.sousTitreAnchor} = SOUS-TITRE « ${m.hero.sousTitre.slice(0, 120)} »`,
    ...m.ctas.slice(0, 4).map((x) => `${x.anchor} = BOUTON « ${x.texte} »${x.auDessusDuPli ? " (au-dessus du pli)" : ""}`),
    m.nav.anchor && `${m.nav.anchor} = NAVIGATION (${m.nav.liens} liens)`,
    ...m.sections.slice(0, 10).map((s) => `${s.anchor} = SECTION « ${s.titre || "(sans titre)"} » à ${s.y}px`),
  ].filter(Boolean).join("\n")

  return `Tu écris des variantes de page d'atterrissage pour un media buyer. Tu ne conseilles pas, tu produis des éditions précises, dans un cadre fermé.

RÈGLES ABSOLUES
- N'écris que ce que la page affirme déjà. Aucun chiffre, aucune garantie, aucun nom de client, aucune promesse que la page ne contient pas. ${c.limites ? "Interdit par le client : " + c.limites + "." : ""}
- Une variante = UNE hypothèse = 1 ou 2 éditions. Pas une nouvelle page.
- Langue de la page : ${langue}. Ton de la page. Pas de superlatif, pas de point d'exclamation.
- Une édition vise une ANCRE de la liste ci-dessous, jamais autre chose.
- op "set" : remplace le texte (clé "text"). op "remove" : retire l'élément. op "move" : déplace l'ancre avant ("before") ou après ("after") une autre ancre. op "duplicate" : copie l'ancre et la pose "before"/"after" une autre, avec "as": un suffixe alphanumérique court. op "swap" : échange avec "with".
- Le "titre" de la variante est ce que le buyer lira dans sa liste : court, dans ses mots (ex. « Le titre reprend la promesse de l'annonce »).

ANNONCE : « ${c.annonce.titre} » ${c.annonce.description ? "/ « " + c.annonce.description + " »" : ""}
MOTS-CLÉS : ${c.annonce.motsCles.join(", ") || "(aucun)"}
MODE DE VENTE : ${c.vente}${c.cible ? " · CIBLE : " + c.cible : ""}${c.offre ? " · OFFRE : " + c.offre : ""}

ANCRES DISPONIBLES
${ancres}

CONSTATS À TRANSFORMER EN VARIANTES (une variante par constat, dans cet ordre)
${constats.map((k, i) => `${i + 1}. [${k.id}] ${k.signal}\n   Action : ${k.action}\n   Consigne : ${k.test?.consigne}\n   Verbes autorisés : ${k.test?.verbes.join(", ")} · Cible : ${k.test?.cible}`).join("\n")}

Réponds UNIQUEMENT par un tableau JSON, sans texte autour, sans balises :
[{"regle": "<id du constat>", "titre": "...", "hypothese": "Si ... alors ... parce que ...", "metrique": "...", "risque": "...", "edits": [{"anchor": "e123", "op": "set", "text": "...", "pourquoi": "..."}]}]`
}

export type VarianteProduite = { nom: string; regle: string; fichier: string; titre: string; teste: string }

export async function ecrireVariantes(
  campagne: string, constats: Constat[], m: SignauxMecaniques, c: Contexte, langue: string,
): Promise<VarianteProduite[]> {
  const base = join(campagne, "baseline")
  const empreintes: Array<{ a: string; role: string; text: string }> = JSON.parse(await readFile(join(base, "anchors.json"), "utf8"))
  const parAncre = new Map(empreintes.map((e) => [e.a, e]))
  /* UNE VARIANTE PAR CIBLE, pas les trois meilleurs constats quoi qu'ils touchent.
   * Décidé avec kabylesystem le 2026-09-19 : sur HubSpot, les trois meilleurs constats visaient
   * tous le titre, et le buyer se retrouvait avec un A/B/C du même mot. Il veut de la diversité :
   * un test de titre, un test de bouton, un test de structure. Si une famille est vide, on
   * complète avec le meilleur constat restant. */
  const famille = (k: Constat) => k.test!.cible === "titre" || k.test!.cible === "sous-titre" ? "titre"
    : k.test!.cible === "cta" ? "bouton" : "structure"
  const testables = constats.filter((k) => k.test)
  const choisis: Constat[] = []
  for (const f of ["titre", "bouton", "structure"] as const) {
    const k = testables.find((x) => famille(x) === f && !choisis.includes(x))
    if (k) choisis.push(k)
  }
  for (const k of testables) if (choisis.length < 3 && !choisis.includes(k)) choisis.push(k)
  if (!choisis.length) { step(SCOPE, "aucun constat testable : rien à écrire"); return [] }
  step(SCOPE, `cibles retenues : ${choisis.map((k) => `${famille(k)} (${k.id})`).join(" · ")}`)

  let props: z.infer<typeof Propositions> | null = null
  for (let essai = 1; essai <= 2 && !props; essai++) {
    try {
      const brut = await claude(cadre(choisis, m, c, langue))
      const p = Propositions.safeParse(JSON.parse(extraireJson(brut)))
      if (p.success) props = p.data
      else step(SCOPE, `proposition hors schéma (essai ${essai}) : ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`)
    } catch (e) { step(SCOPE, `échec (essai ${essai}) : ${String((e as Error).message).slice(0, 160)}`) }
  }
  if (!props) { step(SCOPE, "le modèle n'a pas produit de variantes valides"); return [] }

  await mkdir(join(campagne, "specs"), { recursive: true })
  const sorties: VarianteProduite[] = []
  for (const p of props) {
    const k = choisis.find((x) => x.id === p.regle)
    if (!k) { step(SCOPE, `proposition pour une règle inconnue (${p.regle}) : ignorée`); continue }
    // chaque ancre doit exister : une édition dans le vide n'est pas une variante
    const inconnue = p.edits.flatMap((e) => [e.anchor, e.before, e.after, e.with]).filter((a): a is string => !!a).find((a) => !parAncre.has(a))
    if (inconnue) { step(SCOPE, `« ${p.titre} » vise l'ancre ${inconnue} qui n'existe pas : refusée`); continue }

    // un nom de dossier lisible : coupé à un mot entier, jamais au milieu d'un mot
    const nom = slugify(p.titre).slice(0, 44).replace(/-[^-]*$/, "")
    const spec = {
      nom, hypothese: p.hypothese, metrique: p.metrique, risque: p.risque,
      diagnostic: { regle: k.id, signal: k.signal, priorite: k.score >= 60 ? "HIGH" : k.score >= 35 ? "MEDIUM" : "LOW", confiance: "Medium", preuve: k.sources.join(", ") },
      edits: p.edits.map((e) => {
        const emp = parAncre.get(e.anchor)!
        return { ...e, attendu: { role: emp.role as "heading" | "text" | "link" | "media" | "field" | "bande" | "autre", text: emp.text } }
      }),
    }
    const v = VariantSpec.safeParse(spec)
    if (!v.success) { step(SCOPE, `« ${p.titre} » hors contrat : ${v.error.issues[0]?.path.join(".")} ${v.error.issues[0]?.message}`); continue }
    const fichier = join(campagne, "specs", `${nom}.json`)
    await writeFile(fichier, JSON.stringify(v.data, null, 2))
    // ce que le buyer lit : des mots, pas des ancres. Le texte d'origine vient des signaux (casse
    // réelle) quand on le connaît, sinon de l'empreinte (normalisée en minuscules)
    const nommer = (a: string): string => {
      if (a === m.nav.anchor) return "le menu de navigation"
      if (a === m.hero.titreAnchor) return `le titre « ${m.hero.titre.slice(0, 60)} »`
      if (a === m.hero.sousTitreAnchor) return `le sous-titre « ${m.hero.sousTitre.slice(0, 60)} »`
      const cta = m.ctas.find((x) => x.anchor === a); if (cta) return `le bouton « ${cta.texte.slice(0, 50)} »`
      const sec = m.sections.find((x) => x.anchor === a); if (sec) return `la section « ${sec.titre || "sans titre"} »`
      return `« ${(parAncre.get(a)?.text ?? a).slice(0, 50)} »`
    }
    const e0 = p.edits[0]
    const teste = e0.op === "set" ? `${nommer(e0.anchor)} devient « ${(e0.text ?? "").slice(0, 70)} »`
      : e0.op === "remove" ? `Retirer ${nommer(e0.anchor)}`
      : e0.op === "duplicate" ? `Dupliquer ${nommer(e0.anchor)} ${e0.before ? "avant " + nommer(e0.before) : "après " + nommer(e0.after ?? "")}`
      : e0.op === "swap" ? `Échanger ${nommer(e0.anchor)} et ${nommer(e0.with ?? "")}`
      : `Déplacer ${nommer(e0.anchor)} ${e0.before ? "avant " + nommer(e0.before) : "après " + nommer(e0.after ?? "")}`
    sorties.push({ nom, regle: k.id, fichier, titre: p.titre, teste })
    step(SCOPE, `✓ ${p.titre} → ${fichier}`)
  }
  return sorties
}
