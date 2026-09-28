import { test } from "node:test"
import assert from "node:assert/strict"
import { confiance } from "./diagnostic.ts"

test("confiance : un seul résultat est une anecdote, plusieurs déplacent la règle, dans des bornes", () => {
  assert.equal(confiance(undefined), 1)
  assert.equal(confiance({ gagnes: 0, perdus: 1, nuls: 4, clients: 1 }), 1)
  assert.equal(confiance({ gagnes: 0, perdus: 2, nuls: 0, clients: 2 }), 0.5)
  assert.equal(confiance({ gagnes: 3, perdus: 1, nuls: 0, clients: 3 }), 1.5)
  assert.equal(confiance({ gagnes: 1, perdus: 1, nuls: 0, clients: 1 }), 1)
  assert.equal(confiance({ gagnes: 0, perdus: 9, nuls: 0, clients: 5 }), 0.5)
})
