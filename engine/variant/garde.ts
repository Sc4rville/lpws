/**
 * garde.ts — LES REFUS, en filtre de sortie : une variante qui les franchit n'est pas écrite.
 *
 * Le cadre du modèle (variantes.ts) demande déjà de n'écrire que ce que la page affirme. Une
 * consigne se contourne ; ce filtre, non. Il relit chaque texte proposé contre ce que le client
 * affirme lui-même (la page capturée, l'annonce, l'offre qu'il a déclarée) et refuse :
 *   · un chiffre que ni la page ni l'annonce ne contiennent (statistique sans source) ;
 *   · de l'urgence ou de la rareté que ni la page ni l'annonce n'affichent ;
 *   · une citation absente de la page (faux témoignage) ;
 *   · une fausse personnalisation (gabarit « {Entreprise} », « conçu pour vous »).
 * Cf. docs/brain.html, « Ce que le brain refuse de faire ». Aucun modèle ici : tout se vérifie.
 */
import type { Contexte } from "./contexte.ts"

/** Tout ce que le client affirme lui-même, en minuscules, espaces normalisés. */
export function sourcesDe(html: string, c: Contexte): string {
  const page = html
    // pas les <template> : les racines fantômes capturées (déclaratives) y vivent, avec leur texte
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&")
  return normaliser([page, c.annonce.titre, c.annonce.description ?? "", ...c.annonce.motsCles, c.offre ?? "", c.cible ?? ""].join(" \n "))
}

const normaliser = (t: string) => t.normalize("NFKC").replace(/[\u00a0\u202f]/g, " ").replace(/[’‘]/g, "'").toLowerCase().replace(/\s+/g, " ")

/** « 10 000 », « 10,000 » et « 10000 » sont le même chiffre ; « 4,8 » et « 4.8 » aussi. */
const chiffres = (t: string): string[] =>
  (t.match(/\d+(?:[ .,]\d+)*/g) ?? []).map((x) => x.replace(/[ .,]/g, ""))

const URGENCE = [
  /plus que \d+/, /derni[eè]re?s? (chance|places?|pi[eè]ces?|jours?|heures?)/, /d[ée]p[eê]chez/, /(offre|promo\w*) (expire|limit[ée]e?)/,
  /aujourd'hui seulement/, /(se termine|fin) (ce soir|demain|bient[oô]t)/, /stock limit[ée]/, /temps limit[ée]/, /quantit[ée]s? limit[ée]es?/,
  /only \d+ left/, /last chance/, /hurry/, /limited (time|stock|offer|spots?)/, /(ends|expires) (tonight|today|soon|tomorrow)/, /while (stocks?|supplies) last/, /act now/,
]

const PERSONNALISATION = [/\{[^}]*\}/, /\[(entreprise|company|pr[ée]nom|name|ville|city)\]/, /con[çc]u(e)? (sp[ée]cialement )?pour vous/, /(made|built|designed) (especially |just )?for you/]

const CITATION = /[«“"]\s*([^«»“”"]{12,})\s*[»”"]/g

/** Les refus d'un texte proposé, vides s'il est sûr. */
export function refusDe(texte: string, sources: string): string[] {
  const t = normaliser(texte)
  const refus: string[] = []
  const connus = new Set(chiffres(sources))
  const inventes = chiffres(t).filter((n) => !connus.has(n))
  if (inventes.length) refus.push(`chiffre sans source (${[...new Set(inventes)].join(", ")}) : ni la page ni l'annonce ne le contiennent`)
  for (const r of URGENCE) {
    const m = t.match(r)
    if (m && !sources.includes(m[0])) { refus.push(`urgence ou rareté que la page n'affiche pas (« ${m[0]} »)`); break }
  }
  for (const [, q] of t.matchAll(CITATION))
    if (!sources.includes(q.trim())) { refus.push(`citation absente de la page (« ${q.trim().slice(0, 50)} »)`); break }
  for (const r of PERSONNALISATION) {
    const m = t.match(r)
    if (m && !sources.includes(m[0])) { refus.push(`fausse personnalisation (« ${m[0]} »)`); break }
  }
  return refus
}
