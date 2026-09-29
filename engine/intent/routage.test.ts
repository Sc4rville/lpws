import { test } from "node:test"
import assert from "node:assert/strict"
import type { Ciblage } from "./ciblage.ts"
import { choisirPourClic, ciblagesSeCroisent, normaliserMotCle, correspondAuClic } from "./routage.ts"

const PAGE = "https://client.test/lp"
const cible = (motCle: string, extra: Partial<Ciblage["routes"][number]> = {}, intention: Ciblage["intention"] = "prix"): Ciblage =>
  ({ intention, revision: "r1", routes: [{ motCle, ...extra }] })

type V = { nom: string; part: number; page: string; ciblage?: Ciblage; experience?: string }
const cfg = (variantes: V[], actif = true) => ({ actif, variantes })

test("normaliserMotCle : crochets, guillemets, casse et espaces s'effacent", () => {
  assert.equal(normaliserMotCle("  [Chaussures   Pas Cher] "), "chaussures pas cher")
  assert.equal(normaliserMotCle('"Meilleur Prix"'), "meilleur prix")
})

test("correspondAuClic : mot-clé exact, et lpws_cp/lpws_ag lèvent l'ambiguïté entre campagnes", () => {
  const c = cible("chaussures pas cher", { campagneId: "123" })
  const p = (s: string) => new URLSearchParams(s)
  assert.equal(correspondAuClic(c, p("lpws_kw=chaussures+pas+cher")), false, "sans lpws_cp la route scopée ne mord pas")
  assert.equal(correspondAuClic(c, p("lpws_kw=chaussures+pas+cher&lpws_cp=123")), true)
  assert.equal(correspondAuClic(c, p("lpws_kw=chaussures+pas+cher&lpws_cp=999")), false)
  const g = cible("chaussures pas cher", { campagneId: "123", groupeId: "7" })
  assert.equal(correspondAuClic(g, p("lpws_kw=chaussures+pas+cher&lpws_cp=123&lpws_ag=7")), true)
  assert.equal(correspondAuClic(g, p("lpws_kw=chaussures+pas+cher&lpws_cp=123&lpws_ag=8")), false)
})

test("correspondAuClic : vide, {keyword} brut, AI Max (a) et Display (d) ne matchent pas", () => {
  const c = cible("chaussures pas cher")
  const p = (s: string) => new URLSearchParams(s)
  assert.equal(correspondAuClic(c, p("")), false)
  assert.equal(correspondAuClic(c, p("lpws_kw={keyword}")), false)
  assert.equal(correspondAuClic(c, p("lpws_kw=chaussures+pas+cher&lpws_mt=a")), false)
  assert.equal(correspondAuClic(c, p("lpws_kw=chaussures+pas+cher&lpws_net=d")), false)
  assert.equal(correspondAuClic(c, p("lpws_kw=chaussures+pas+cher&lpws_mt=e&lpws_net=g")), true)
})

test("choisirPourClic : mot-clé inconnu ou hors routes → original, motif franc", () => {
  const v: V = { nom: "v-prix", part: 100, page: PAGE, ciblage: cible("chaussures pas cher"), experience: "e" }
  const r = choisirPourClic(cfg([v]), PAGE + "?lpws_kw=baskets+rouges", "id1")
  assert.equal(r.variante, null)
  assert.equal(r.motif, "aucun test éligible")
})

test("choisirPourClic : deux ciblages qui se disputent le clic conservent l'original", () => {
  const a: V = { nom: "a", part: 100, page: PAGE, ciblage: cible("chaussures") }
  const b: V = { nom: "b", part: 100, page: PAGE, ciblage: cible("[chaussures]", {}, "comparaison") }
  const r = choisirPourClic(cfg([a, b]), PAGE + "?lpws_kw=chaussures", "id1")
  assert.equal(r.variante, null)
  assert.match(r.motif, /concurrents/)
})

test("choisirPourClic : deux intentions disjointes cohabitent, chacune sert sa variante", () => {
  const a: V = { nom: "a", part: 100, page: PAGE, ciblage: cible("chaussures pas cher", {}, "prix") }
  const b: V = { nom: "b", part: 100, page: PAGE, ciblage: cible("alternative nike", {}, "alternative") }
  assert.equal(choisirPourClic(cfg([a, b]), PAGE + "?lpws_kw=chaussures+pas+cher", "id").variante?.nom, "a")
  assert.equal(choisirPourClic(cfg([a, b]), PAGE + "?lpws_kw=alternative+nike", "id").variante?.nom, "b")
  assert.equal(choisirPourClic(cfg([a, b]), PAGE + "?lpws_kw=autre", "id").variante, null)
})

test("choisirPourClic : part 0 sert personne, part 100 sert tout le monde de l'audience", () => {
  const u = PAGE + "?lpws_kw=chaussures"
  assert.equal(choisirPourClic(cfg([{ nom: "z", part: 0, page: PAGE, ciblage: cible("chaussures") }]), u, "id").variante, null)
  assert.equal(choisirPourClic(cfg([{ nom: "c", part: 100, page: PAGE, ciblage: cible("chaussures") }]), u, "id").variante?.nom, "c")
})

test("choisirPourClic : déterministe — même clic, même lancement, même issue ; l'expérience isole", () => {
  const id = "gclid-xyz"
  const u = PAGE + "?lpws_kw=chaussures"
  const v = (experience: string): V => ({ nom: "v", part: 50, page: PAGE, ciblage: cible("chaussures"), experience })
  const r1 = choisirPourClic(cfg([v("exp1")]), u, id)
  const r2 = choisirPourClic(cfg([v("exp1")]), u, id)
  assert.deepEqual(r1, r2)
  const autres = choisirPourClic(cfg([v("exp1")]), u, id)
  assert.equal(autres.experience, "exp1")
  if (r1.variante === null) assert.equal(r1.motif, "témoin du même ciblage")
})

test("choisirPourClic : aperçu forcé, off, page non configurée", () => {
  const v: V = { nom: "v", part: 50, page: PAGE, ciblage: cible("chaussures"), experience: "e1" }
  const force = choisirPourClic(cfg([v]), PAGE + "?lpws=v", "id")
  assert.equal(force.variante?.nom, "v")
  assert.equal(force.apercu, true)
  assert.equal(choisirPourClic(cfg([v]), PAGE + "?lpws=off", "id").variante, null)
  assert.equal(choisirPourClic(cfg([v], false), PAGE, "id").motif, "désactivé")
  const hors = choisirPourClic(cfg([v]), "https://client.test/merci", "id")
  assert.equal(hors.motif, "page hors test")
  assert.equal(hors.variante, null)
})

test("ciblagesSeCroisent : joker vs scopé croisent, disjoints non, général croise tout", () => {
  assert.equal(ciblagesSeCroisent(cible("chaussures"), cible("chaussures", { campagneId: "123" })), true)
  assert.equal(ciblagesSeCroisent(cible("chaussures", { campagneId: "123" }), cible("chaussures", { campagneId: "999" })), false)
  assert.equal(ciblagesSeCroisent(cible("chaussures"), cible("velos")), false)
  assert.equal(ciblagesSeCroisent(undefined, cible("velos")), true)
  assert.equal(ciblagesSeCroisent(undefined, undefined), true)
})
