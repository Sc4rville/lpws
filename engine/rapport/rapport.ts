/**
 * rapport.ts — LE RAPPORT CLIENT : une page HTML autonome, prête à envoyer, par test
 * (docs/business-model-rapport.md §6 ; feuille de route 3.4, 4.1).
 *
 * Ce qu'on a testé et pourquoi, les deux versions côte à côte, le taux de conversion et le coût
 * par conversion avant / après, la recommandation, et ce que la mémoire du client dit des tests
 * précédents. En Solo il est marqué LPWS (la boucle virale : il arrive chez le client, qui
 * travaille avec d'autres buyers) ; en Agence il porte la marque du buyer, sans un mot de LPWS.
 *
 * Aucun chiffre n'est inventé : sans résultats GA4, le rapport le dit et ne montre pas de taux.
 * Les deux captures sont embarquées : le fichier s'envoie seul, sans lien vers la machine.
 */
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { lireJson } from "../shared/json.ts"
import { campagne as fichiersDe, type Test } from "../shared/campagne.ts"
import { historique, verdictDe } from "../measure/experience.ts"
import type { Resultats } from "../measure/run.ts"
import type { Compte } from "../compte/compte.ts"
import { palierEnVigueur } from "../compte/compte.ts"

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
const pc = (x: number, d = 1) => `${(x * 100).toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d })} %`
const eur = (x: number) => `${x.toLocaleString("fr-FR", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} €`
const date = (iso?: string) => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—"

async function image(f: string): Promise<string | null> {
  if (!existsSync(f)) return null
  return `data:image/png;base64,${(await readFile(f)).toString("base64")}`
}

export async function rapportHtml(campagneDir: string, testId: string, compte: Compte): Promise<string> {
  const f = fichiersDe(campagneDir)
  const tests = await lireJson<Test[]>(f.tests, [])
  const t = tests.find((x) => x.id === testId)
  if (!t) throw Object.assign(new Error("test inconnu"), { code: 404 })
  const meta = await lireJson<{ source?: string }>(f.meta, {})
  const ctx = await lireJson<{ cpc?: number; annonce?: { titre: string } } | null>(f.contexte, null)
  const res = await lireJson<Resultats | null>(f.resultats, null)
  const memoire = (await historique(dirname(campagneDir))).experiences.filter((e) => e.test !== t.id).sort((a, b) => b.arreteLe.localeCompare(a.arreteLe)).slice(0, 5)
  const p = palierEnVigueur(compte)
  const blanche = p.marqueBlanche && !!compte.marque.nom
  const marque = blanche ? compte.marque.nom : "LPWS"
  const couleur = blanche ? compte.marque.couleur : "#111214"

  const o = res?.versions.controle, v = res?.versions[t.id]
  const jours = t.lanceLe ? Math.max(0, Math.floor((Date.parse(t.finLe ?? new Date().toISOString()) - Date.parse(t.lanceLe)) / 86_400_000)) : 0
  const b = o && v && o.n && v.n ? (await verdictDe(campagneDir, t)).verdict : null
  const reco = !b ? (t.etat === "live" ? "Pas encore de résultats mesurés : le test continue, aucune conclusion n'est tirée." : "Test arrêté sans résultats mesurés : aucune conclusion n'est tirée.")
    : b.k === "gagnant" ? "Déployer la variante sur 100 % du trafic, puis tester l'étape suivante."
    : b.k === "perdant" ? "Garder l'original. Ce que la variante changeait n'est pas ce qui retient vos visiteurs : on teste une autre piste."
    : b.k === "nul" || b.k === "jamais" ? "Garder l'original : l'écart ne justifie pas le changement. Le test est enregistré, il ne sera pas re-proposé."
    : b.k === "srm" ? "Corriger la répartition avant toute conclusion (voir ci-dessus)."
    : "Laisser courir le test jusqu'à l'échantillon prévu."
  const ligne = (nom: string, x: { n: number; c: number }) => {
    const taux = x.n ? x.c / x.n : 0
    return `<tr><td>${nom}</td><td>${x.n.toLocaleString("fr-FR")}</td><td>${x.c.toLocaleString("fr-FR")}</td><td>${pc(taux)}</td>${ctx?.cpc ? `<td>${taux ? eur(ctx.cpc / taux) : "—"}</td>` : ""}</tr>`
  }
  const [imgO, imgV] = await Promise.all([image(join(f.baseline, "clone.png")), image(join(f.variante(t.id), "variant.png"))])

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(t.titre)} · rapport de test</title>
<style>
body{font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111214;background:#f5f5f3;margin:0}
main{max-width:980px;margin:0 auto;padding:40px 24px 64px}
header{display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid ${couleur};padding-bottom:14px;margin-bottom:28px}
header b{font-size:18px;color:${couleur}} h1{font-size:28px;line-height:1.2;margin:0 0 6px} h2{font-size:17px;margin:32px 0 10px}
.u{color:#7a7c82;font-size:13.5px;word-break:break-all} .card{background:#fff;border-radius:16px;padding:20px 22px;margin:14px 0;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.verdict{border-left:5px solid ${couleur}} .verdict p{margin:6px 0 0;font-size:16px}
table{border-collapse:collapse;width:100%} th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #eee} th{font-size:12.5px;color:#7a7c82;font-weight:600}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:14px} .duo figure{margin:0;background:#fff;border-radius:14px;overflow:hidden} .duo img{width:100%;max-height:640px;object-fit:cover;object-position:top;display:block}
figcaption{padding:10px 14px;font-weight:600;font-size:13.5px} .muted{color:#7a7c82} footer{margin-top:40px;font-size:12.5px;color:#7a7c82}
@media(max-width:700px){.duo{grid-template-columns:1fr}} @media print{body{background:#fff}.card{box-shadow:none;border:1px solid #eee}}
</style></head><body><main>
<header><b>${esc(marque)}</b><span class="muted">Rapport du ${date(new Date().toISOString())}</span></header>
<h1>${esc(t.titre)}</h1><div class="u">${esc(meta.source ?? "")}</div>
<div class="card"><b>Ce qu'on a testé.</b> ${esc(t.teste)}<br><b>Pourquoi.</b> ${esc(t.pourquoi)}${ctx?.annonce ? `<br><b>L'annonce.</b> « ${esc(ctx.annonce.titre)} »` : ""}
<p class="muted" style="margin:10px 0 0">Lancé le ${date(t.lanceLe)}${t.finLe ? `, arrêté le ${date(t.finLe)}` : ""} · ${jours} jour(s) · ${t.part || 50} % des visiteurs sur la variante${t.plan ? ` · échantillon prévu : ${Math.max(t.plan.controle, t.plan.variante).toLocaleString("fr-FR")} visiteurs par version` : ""}</p></div>
<div class="card verdict"><b>${b ? esc(b.titre) : "Pas encore de résultats"}</b>
<p>${esc(b ? b.detail + "." : "GA4 n'a pas encore renvoyé de mesures pour ce test.")}</p>${b?.stats ? `<p class="muted">Écart probable entre ${pc(b.stats!.ic.lo)} et ${pc(b.stats!.ic.hi)} (intervalle à 95 %).</p>` : ""}
<p><b>Recommandation.</b> ${esc(reco)}</p></div>
${o && v ? `<h2>Les chiffres</h2><div class="card"><table><tr><th>Version</th><th>Visiteurs</th><th>Conversions</th><th>Taux</th>${ctx?.cpc ? "<th>Coût par conversion</th>" : ""}</tr>${ligne("Original", o)}${ligne("Variante", v)}</table>
<p class="muted" style="margin:10px 0 0">Source : ${res!.source === "exemple" ? "réponse GA4 d'exemple (démonstration)" : "Google Analytics 4"}, lu le ${date(res!.luLe)}.${ctx?.cpc ? ` Coût par conversion calculé au CPC moyen de ${eur(ctx.cpc)}.` : ""}</p></div>` : ""}
${imgO || imgV ? `<h2>Les deux versions</h2><div class="duo">${imgO ? `<figure><img src="${imgO}" alt="Original"><figcaption>Original</figcaption></figure>` : ""}${imgV ? `<figure><img src="${imgV}" alt="Variante"><figcaption>Variante</figcaption></figure>` : ""}</div>` : ""}
${memoire.length ? `<h2>Les tests précédents</h2><div class="card"><table><tr><th>Test</th><th>Fin</th><th>Résultat</th></tr>${memoire.map((e) => `<tr><td>${esc(e.titre)}</td><td>${date(e.arreteLe)}</td><td>${esc(e.conclusion)}${e.hausse ? ` (${e.hausse.mid >= 0 ? "+" : ""}${pc(e.hausse.mid)})` : ""}</td></tr>`).join("")}</table></div>` : ""}
<footer>${blanche ? esc(compte.marque.nom) : "Préparé avec LPWS : diagnostic et tests de landing page pour media buyers."} Données de performance traitées pour le seul compte de ce client.</footer>
</main></body></html>`
}
