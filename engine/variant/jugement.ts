/**
 * jugement.ts — LES YEUX DU BRAIN, partie jugement : ce qu'on ne peut pas compter.
 *
 * « Ce titre nomme-t-il une catégorie ou un résultat ? », « la promesse de l'annonce est-elle
 * dans le titre ? » : ce sont des questions de sens, pas de comptage. On les pose à un modèle,
 * mais dans la forme actée (docs/architecture.md, « capteur / raisonnement ») : une liste de QUESTIONS TYPÉES INDÉPENDANTES, chacune
 * avec un type de sortie déclaré et une confiance. Pas de prose, pas d'explication demandée au
 * modèle : l'explication vient de la règle, jamais de lui.
 *
 * Le modèle tourne sur les crédits du plan (`claude -p`, compte connecté), pas sur l'API au
 * jeton. Sa sortie passe le schéma zod avant d'être écrite : une réponse hors format est
 * refusée, réessayée une fois, puis l'ensemble est déclaré « non jugé » et les règles qui en
 * dépendent restent non évaluables. Jamais une supposition silencieuse.
 */
import { z } from "zod"
import type { SignauxMecaniques } from "./signaux.ts"
import type { Contexte } from "./contexte.ts"
import { step } from "../shared/log.ts"
import { demanderValide } from "../shared/modele.ts"

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
 "titreType": {"valeur": "categorie"|"resultat"|"mixte", "confiance": 0..1},   // « categorie » : le titre nomme ce que c'est (« Marketing Software ») ; « resultat » : ce que le visiteur obtient ou fait (« Manage projects efficiently ») ; « mixte » SEULEMENT si le titre contient à la fois un nom de catégorie ET un résultat explicite
 "cadreDeReference": {"valeur": bool, "confiance": 0..1},   // quelque part dans la page (pas seulement le titre), le produit est situé face à une alternative : un concurrent, « build vs buy », « instead of », « without adding more tools », « from four inboxes to one », faire à la main, ne rien faire
 "niveauLecture": {"valeur": "simple"|"professionnel"|"technique", "confiance": 0..1},
 "objectionsTraitees": {"valeur": bool, "confiance": 0..1},   // la page répond à des doutes (prix, temps, risque, « et si ça ne marche pas ») : une section FAQ compte, une garantie ou « sans carte » compte, un simple argumentaire produit ne compte pas
 "preuveAligneeCible": {"valeur": bool, "confiance": 0..1},   // les preuves (logos, témoignages) ressemblent à la cible déclarée ; true si aucune cible déclarée
 "ctaAligneVente": {"valeur": bool, "confiance": 0..1},   // le bouton principal correspond au mode de vente (libre-service → essayer/commencer ; commercial → démo/contact ; achat → acheter/ajouter)
 "risquePercuEleve": {"valeur": bool, "confiance": 0..1}   // la décision engage (prix, contrat, effort de migration) au point qu'une garantie compterait
}`

/** Le texte de la page tel que le juge le lit : sans scripts, sans menus ni pied de page. Sur un
 *  grand site, les 2 500 premiers caractères du body sont un menu : le juge ne voyait pas la page. */
export function corpsDe(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<(header|nav|footer)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
}

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
section FAQ / objections : ${m.objections.sectionPresente ? "présente" : "absente"}
formulaire : ${m.formulaire.present ? `${m.formulaire.champs} champs` : "aucun"}
bouton principal (premier au-dessus du pli) : ${m.ctas[0] ? `« ${m.ctas[0].texte} »` : "(aucun)"}

TEXTE DE LA PAGE (début)
${corps.slice(0, 2500)}`
}

/** Les signaux de jugement, ou null si le modèle n'a pas répondu dans le format deux fois de suite. */
export async function juger(m: SignauxMecaniques, c: Contexte, corps: string): Promise<SignauxJuges | null> {
  const j = await demanderValide(SCOPE, `${CONSIGNE}\n\n${texteDe(m, c, corps)}`, SignauxJuges, "objet")
  if (j) return j
  step(SCOPE, "jugement indisponible : les règles qui en dépendent resteront non évaluables")
  return null
}
