import { test } from "node:test"
import assert from "node:assert/strict"
import { comparer, juger, nParBranche, normCdf, planifier, repartition } from "./stats.ts"

test("normCdf : valeurs de référence", () => {
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-7)
  assert.ok(Math.abs(normCdf(1.959964) - 0.975) < 1e-4)
  assert.ok(Math.abs(normCdf(-1.959964) - 0.025) < 1e-4)
})

test("nParBranche : 3 %, +20 %, 50/50 ≈ 13 900 par version (formule usuelle)", () => {
  const n = nParBranche(0.03, 0.2)
  assert.ok(n.controle > 13_000 && n.controle < 14_500, String(n.controle))
  assert.equal(n.controle, n.variante)
})

test("nParBranche : une part inégale coûte plus de visiteurs au total", () => {
  const a = nParBranche(0.03, 0.2, 0.5), b = nParBranche(0.03, 0.2, 0.2)
  assert.ok(b.controle + b.variante > a.controle + a.variante)
  assert.ok(b.controle > b.variante)
})

test("planifier : horizon en jours, faisabilité et hausse détectable en huit semaines", () => {
  const p = planifier({ tauxBase: 0.03, mde: 0.2, part: 0.5, visiteursJour: 1000 })
  assert.equal(p.tauxSuppose, false)
  assert.ok(p.jours! >= 27 && p.jours! <= 30, String(p.jours))
  assert.equal(p.faisable, true)
  assert.ok(p.mdeEnHuitSemaines! < 0.2)
  const petit = planifier({ tauxBase: 0.03, mde: 0.1, part: 0.5, visiteursJour: 100 })
  assert.equal(petit.faisable, false)
  assert.ok(petit.mdeEnHuitSemaines! > 0.1)
  assert.equal(planifier({ part: 0.5 }).tauxSuppose, true)
})

test("comparer : hausse relative et intervalle", () => {
  const s = comparer({ n: 10_000, c: 300 }, { n: 10_000, c: 360 })
  assert.ok(Math.abs(s.lift - 0.2) < 1e-9)
  assert.ok(s.pValeur < 0.05)
  assert.ok(s.ic.lo > 0 && s.ic.hi > s.ic.mid)
})

test("repartition : 50/50 réglé, 55/45 servi sur 10 000 visiteurs → alerte", () => {
  assert.equal(repartition({ n: 5000, c: 1 }, { n: 5000, c: 1 }, 0.5).alerte, false)
  assert.equal(repartition({ n: 5500, c: 1 }, { n: 4500, c: 1 }, 0.5).alerte, true)
  assert.equal(repartition({ n: 60, c: 1 }, { n: 40, c: 1 }, 0.5).alerte, false, "trop peu de visiteurs pour crier au loup")
})

test("juger : sans données → attente, avec l'horizon prévu", () => {
  const v = juger({ part: 0.5, jours: 0, tauxBase: 0.03, mde: 0.2, visiteursJour: 1000 })
  assert.equal(v.k, "attente")
  assert.ok(v.plan.jours! > 20)
})

test("juger : un écart de 95 % au jour 3 n'est PAS un gagnant", () => {
  const v = juger({ o: { n: 1500, c: 40 }, v: { n: 1500, c: 62 }, part: 0.5, jours: 3, mde: 0.2 })
  assert.ok(comparer({ n: 1500, c: 40 }, { n: 1500, c: 62 }).pValeur < 0.05)
  assert.equal(v.k, "collecte")
  assert.equal(v.jalons.duree, false)
})

test("juger : horizon atteint et p < 0,05 → gagnant ; écart inverse → perdant", () => {
  const g = juger({ o: { n: 15_000, c: 450 }, v: { n: 15_000, c: 545 }, part: 0.5, jours: 21, mde: 0.2 })
  assert.equal(g.k, "gagnant")
  assert.equal(g.anticipe, false)
  const p = juger({ o: { n: 15_000, c: 545 }, v: { n: 15_000, c: 450 }, part: 0.5, jours: 21, mde: 0.2 })
  assert.equal(p.k, "perdant")
})

test("juger : horizon atteint sans écart → nul (inconclusif, dit comme tel)", () => {
  const v = juger({ o: { n: 15_000, c: 450 }, v: { n: 15_000, c: 460 }, part: 0.5, jours: 21, mde: 0.2 })
  assert.equal(v.k, "nul")
})

test("juger : écart écrasant après une semaine → arrêt anticipé", () => {
  const v = juger({ o: { n: 4000, c: 100 }, v: { n: 4000, c: 190 }, part: 0.5, jours: 7, mde: 0.2 })
  assert.equal(v.k, "gagnant")
  assert.equal(v.anticipe, true)
})

test("juger : trop peu de trafic → le test ne conclura pas", () => {
  const v = juger({ o: { n: 300, c: 9 }, v: { n: 300, c: 11 }, part: 0.5, jours: 10, mde: 0.1 })
  assert.equal(v.k, "jamais")
  assert.ok(v.joursRestants! > 56)
})

test("juger : répartition faussée prime sur tout", () => {
  const v = juger({ o: { n: 16_500, c: 450 }, v: { n: 13_500, c: 545 }, part: 0.5, jours: 21, mde: 0.2 })
  assert.equal(v.k, "srm")
})

test("juger : l'échantillon figé au lancement gouverne, pas le taux observé", () => {
  // taux réel ~11 % au lieu des 3 % prévus : ré-estimé, ~3 300 par version suffiraient
  const e = { o: { n: 5000, c: 500 }, v: { n: 5000, c: 570 }, part: 0.5, jours: 12, tauxBase: 0.03, mde: 0.2 }
  assert.equal(juger(e).k, "gagnant")
  const f = juger({ ...e, cible: { controle: 13_911, variante: 13_911 } })
  assert.equal(f.k, "collecte")
  assert.equal(f.plan.controle, 13_911)
  assert.ok(!f.jalons.vol)
  // un plan sérialisé à 0 ou 100 % (Infinity → null) ne vaut pas « volume atteint »
  const nul = juger({ ...e, o: { n: 300, c: 30 }, v: { n: 300, c: 45 }, cible: { controle: null as unknown as number, variante: null as unknown as number } })
  assert.ok(!nul.jalons.vol)
})
