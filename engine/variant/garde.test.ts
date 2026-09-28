import { test } from "node:test"
import assert from "node:assert/strict"
import { refusDe, sourcesDe } from "./garde.ts"
import type { Contexte } from "./contexte.ts"

const ctx = { annonce: { titre: "Logiciel de support pour PME", motsCles: ["helpdesk"] }, vente: "libre-service", trafic: "google-search" } as Contexte
const src = sourcesDe(`<h1>Le support client des PME</h1><p>Plus de 10&nbsp;000 équipes. Note 4,8/5.</p><blockquote>« On répond deux fois plus vite »</blockquote><script>var x = 99</script>`, ctx)

test("garde : ce que la page affirme passe, sous une autre forme comprise", () => {
  assert.deepEqual(refusDe("Le support client de 10 000 PME", src), [])
  assert.deepEqual(refusDe("Noté 4.8/5 par les PME", src), [])
  assert.deepEqual(refusDe("« On répond deux fois plus vite »", src), [])
  assert.deepEqual(refusDe("Un logiciel de support pour PME", src), [])
})

test("garde : chiffre inventé, urgence, faux témoignage, fausse personnalisation sont refusés", () => {
  assert.match(refusDe("Adopté par 50 000 équipes", src)[0], /chiffre sans source \(50000\)/)
  assert.match(refusDe("Rejoignez 99 équipes", src)[0], /chiffre sans source/, "un chiffre du JS n'est pas une affirmation de la page")
  assert.match(refusDe("Offre limitée : dépêchez-vous", src)[0], /urgence/)
  assert.match(refusDe("Hurry, spots are going fast", src)[0], /urgence/)
  assert.match(refusDe("« Le meilleur outil que j'ai utilisé »", src)[0], /citation absente/)
  assert.match(refusDe("Conçu pour vous, {Entreprise}", src)[0], /fausse personnalisation/)
})
