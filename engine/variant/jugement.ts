/**
 * jugement.ts — LES YEUX DU BRAIN, partie jugement : ce qu'on ne peut pas compter.
 *
 * « Ce titre nomme-t-il une catégorie ou un résultat ? », « la promesse de l'annonce est-elle
 * dans le titre ? » : ce sont des questions de sens, pas de comptage. On les pose à un modèle,
 * mais dans la forme décidée dès ETAT.md : une liste de QUESTIONS TYPÉES INDÉPENDANTES, chacune
 * avec un type de sortie déclaré et une confiance. Pas de prose, pas d'explication demandée au
 * modèle : l'explication vient de la règle, jamais de lui.
 *
 * Le modèle tourne sur les crédits du plan (`claude -p`, compte connecté), pas sur l'API au
 * jeton. Sa sortie passe le schéma zod avant d'être écrite : une réponse hors format est
 * refusée, réessayée une fois, puis l'ensemble est déclaré « non jugé » et les règles qui en
 * dépendent restent non évaluables. Jamais une supposition silencieuse.
 */
import { spawn } from "node:child_process"
import { z } from "zod"
import type { SignauxMecaniques } from "./signaux.ts"
import type { Contexte } from "./contexte.ts"
import { step } from "../shared/log.ts"

const SCOPE = "variant/jugement"

const Conf = z.number().min(0).max(1)
const B = z.object({ valeur: z.boolean(), confiance: Conf })

export const SignauxJuges = z.object({
  promesseDansTitre: B,
  titreType: z.object({ valeur: z.enum(["categorie", "resultat", "mixte"]), confiance: Conf }),
  cadreDeReference: B,
  niveauLecture: z.object({ valeur: z.enum(["simple", "professionnel", "technique"]), confiance: Conf }),
  objectionsTraitees: B,
  preuveAligneeCible: B,
  ctaAligneVente: B,
  risquePercuEleve: B,
})
export type SignauxJuges = z.infer<typeof SignauxJuges>

const CONSIGNE = `Tu es un capteur, pas un conseiller. Tu réponds à des questions fermées sur une page d'atterrissage et l'annonce qui y envoie du trafic. Tu ne proposes rien, tu n'expliques rien : tu constates.

Réponds UNIQUEMENT par un objet JSON, sans texte autour, sans balises de code, avec exactement ces clés :
{
 "promesseDansTitre": {"valeur": bool, "confiance": 0..1},   // la promesse de l'annonce (bénéfice, offre, mécanisme) est reprise, même reformulée, dans le titre ou le sous-titre
 "titreType": {"valeur": "categorie"|"resultat"|"mixte", "confiance": 0..1},   // le titre nomme ce que c'est (catégorie) ou ce que le visiteur obtient (résultat)
 "cadreDeReference": {"valeur": bool, "confiance": 0..1},   // la page dit à quoi le produit se compare (alternative, faire à la main, ne rien faire)
 "niveauLecture": {"valeur": "simple"|"professionnel"|"technique", "confiance": 0..1},
 "objectionsTraitees": {"valeur": bool, "confiance": 0..1},   // la page répond à des doutes (prix, temps, risque, « et si ça ne marche pas »)
 "preuveAligneeCible": {"valeur": bool, "confiance": 0..1},   // les preuves (logos, témoignages) ressemblent à la cible déclarée ; true si aucune cible déclarée
 "ctaAligneVente": {"valeur": bool, "confiance": 0..1},   // le bouton principal correspond au mode de vente (libre-service → essayer/commencer ; commercial → démo/contact ; achat → acheter/ajouter)
 "risquePercuEleve": {"valeur": bool, "confiance": 0..1}   // la décision engage (prix, contrat, effort de migration) au point qu'une garantie compterait
}`

function texteDe(m: SignauxMecaniques, c: Contexte, corps: string): string {
  return `ANNONCE
titre : ${c.annonce.titre}
description : ${c.annonce.description ?? "(aucune)"}
mots-clés / audience : ${c.annonce.motsCles.join(", ") || "(aucun)"}

CONTEXTE
mode de vente : ${c.vente}
cible déclarée : ${c.cible ?? "(aucune)"}
offre : ${c.offre ?? "(non précisée)"}
panier moyen : ${c.panierMoyen ? c.panierMoyen + " €" : "(inconnu)"}

PAGE
titre : ${m.hero.titre}
sous-titre : ${m.hero.sousTitre}
boutons : ${m.ctas.slice(0, 6).map((x) => `« ${x.texte} »`).join(" · ") || "(aucun)"}
sections : ${m.sections.map((s) => s.titre).filter(Boolean).slice(0, 12).join(" | ")}
preuves : ${m.preuves.logos} logos, ${m.preuves.temoignages.nombre} témoignages, avis ${m.preuves.avis.presents ? "présents" : "absents"}
prix visible : ${m.prix.visible ? m.prix.valeurs.slice(0, 3).join(", ") : "non"}
garantie : ${m.garantie.presente ? m.garantie.extrait : "aucune"}

TEXTE DE LA PAGE (début)
${corps.slice(0, 2500)}`
}

function claude(prompt: string): Promise<string> {
  return new Promise((ok, ko) => {
    const p = spawn("claude", ["-p", "--output-format", "json", "--model", process.env.LPWS_MODELE ?? "sonnet"], { stdio: ["pipe", "pipe", "pipe"] })
    let out = "", err = ""
    p.stdout.on("data", (d) => out += d)
    p.stderr.on("data", (d) => err += d)
    p.on("close", (code) => {
      if (code !== 0) return ko(new Error(`claude -p a quitté avec ${code} : ${err.slice(0, 200)}`))
      try { ok(String((JSON.parse(out) as { result?: string }).result ?? "")) } catch { ok(out) }
    })
    p.stdin.write(prompt); p.stdin.end()
  })
}

const extraireJson = (t: string) => {
  const i = t.indexOf("{"), j = t.lastIndexOf("}")
  return i >= 0 && j > i ? t.slice(i, j + 1) : t
}

/** Les signaux de jugement, ou null si le modèle n'a pas répondu dans le format deux fois de suite. */
export async function juger(m: SignauxMecaniques, c: Contexte, corps: string): Promise<SignauxJuges | null> {
  const prompt = `${CONSIGNE}\n\n${texteDe(m, c, corps)}`
  for (let essai = 1; essai <= 2; essai++) {
    try {
      const brut = await claude(prompt)
      const parse = SignauxJuges.safeParse(JSON.parse(extraireJson(brut)))
      if (parse.success) { step(SCOPE, `8 questions typées répondues (essai ${essai})`); return parse.data }
      step(SCOPE, `réponse hors schéma (essai ${essai}) : ${parse.error.issues[0]?.path.join(".")} ${parse.error.issues[0]?.message}`)
    } catch (e) {
      step(SCOPE, `échec (essai ${essai}) : ${String((e as Error).message).slice(0, 160)}`)
    }
  }
  step(SCOPE, "jugement indisponible : les règles qui en dépendent resteront non évaluables")
  return null
}
