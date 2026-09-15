import assert from "node:assert/strict";
import { comSnapshot, apagarSnapshots, lerSnapshot } from "../js/offline-snapshot.js";

function memoria() {
  const dados = new Map();
  return {
    get length() { return dados.size; },
    key(i) { return [...dados.keys()][i] ?? null; },
    getItem(k) { return dados.has(k) ? dados.get(k) : null; },
    setItem(k, v) { dados.set(k, String(v)); },
    removeItem(k) { dados.delete(k); },
  };
}

const storage = memoria();
const online = await comSnapshot("aluno-a", "ficha", async () => ({ id: "f1" }), { storage });
assert.deepEqual(online, { id: "f1" });

const offline = await comSnapshot("aluno-a", "ficha", async () => {
  throw new TypeError("Failed to fetch");
}, { storage, online: false });
assert.deepEqual(offline, { id: "f1" });

await assert.rejects(
  comSnapshot("aluno-b", "ficha", async () => { throw new TypeError("Failed to fetch"); }, { storage, online: false }),
  /Failed to fetch/
);
await assert.rejects(
  comSnapshot("aluno-a", "ficha", async () => { throw new Error("permission denied"); }, { storage }),
  /permission denied/
);

apagarSnapshots("aluno-a", storage);
assert.equal(lerSnapshot("aluno-a", "ficha", storage).encontrado, false);
console.log("OK: snapshot é isolado, só cobre rede e é apagado no logout.");
