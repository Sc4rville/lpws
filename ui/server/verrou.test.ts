import { test } from "node:test"
import assert from "node:assert/strict"
import { verrouillerCampagne, avecCampagne } from "./verrou.ts"

test("verrouillerCampagne : la seconde prise est refusée 409, la libération ré-autorise", () => {
  const liberer = verrouillerCampagne("acme/search")
  assert.throws(() => verrouillerCampagne("acme/search"), (e: any) => e.code === 409)
  const autre = verrouillerCampagne("acme/autre") // une autre campagne n'est pas bloquée
  autre()
  liberer()
  const relache = verrouillerCampagne("acme/search")
  relache()
})

test("avecCampagne : le verrou couvre toute la durée de l'action, même en échec", async () => {
  let dedans = false
  const p = avecCampagne("acme/search", async () => {
    dedans = true
    assert.throws(() => verrouillerCampagne("acme/search"), (e: any) => e.code === 409)
    return 42
  })
  assert.equal(dedans, true, "le verrou est pris avant que l'action ne commence")
  assert.equal(await p, 42)
  verrouillerCampagne("acme/search")()
  await assert.rejects(
    avecCampagne("acme/search", async () => { throw new Error("panne") }),
    /panne/,
  )
  verrouillerCampagne("acme/search")()
})

test("verrou tenu à la main : un démarrage de job peut rendre tôt sans lâcher la campagne", async () => {
  const liberer = verrouillerCampagne("acme/search")
  const fin = new Promise<void>((res) => setTimeout(res, 30))
  const job = fin.finally(liberer)
  assert.throws(() => verrouillerCampagne("acme/search"), (e: any) => e.code === 409)
  await job
  verrouillerCampagne("acme/search")()
})
