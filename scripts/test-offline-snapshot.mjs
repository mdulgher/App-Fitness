import assert from "node:assert/strict";
import { comSnapshot, apagarSnapshots, lerSnapshot } from "../js/offline-snapshot.js";
import { pareceErroDeRede } from "../js/sync-queue.js";

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

// O caso que faltava: recusa de acesso COM o navegador dizendo que está
// offline. Antes, `pareceFalhaDeRede` devolvia true só por `online: false` e o
// snapshot respondia no lugar do erro — o professor bloqueava o aluno, o RLS
// negava, e a tela seguia mostrando o treino guardado como se fosse falta de
// sinal. `navigator.onLine` dá falso negativo com frequência (Wi-Fi de
// academia, VPN, captive portal), então isso não era hipótese remota.
for (const mensagem of [
  "permission denied for table workout_plans",
  "new row violates row-level security policy",
  "JWT expired",
  "Seu acesso bloqueado pelo professor",
]) {
  await assert.rejects(
    comSnapshot("aluno-a", "ficha", async () => { throw new Error(mensagem); }, { storage, online: false }),
    new RegExp(mensagem.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `recusa de acesso não pode cair no snapshot: ${mensagem}`
  );
}

// E a falha de rede de verdade continua coberta mesmo com essa checagem nova.
assert.deepEqual(
  await comSnapshot("aluno-a", "ficha", async () => { throw new TypeError("Load failed"); }, { storage, online: false }),
  { id: "f1" }
);

// A fila usa a mesma regra: recusa de acesso não pode virar "mando quando a
// rede voltar", senão a série nunca sobe e ninguém fica sabendo.
assert.equal(pareceErroDeRede(new Error("permission denied for table exercise_logs"), false), false);
assert.equal(pareceErroDeRede(new Error("Failed to fetch"), false), true);
assert.equal(pareceErroDeRede(new Error("qualquer outra coisa"), false), true);
assert.equal(pareceErroDeRede(new Error("qualquer outra coisa"), true), false);

apagarSnapshots("aluno-a", storage);
assert.equal(lerSnapshot("aluno-a", "ficha", storage).encontrado, false);
console.log(
  "OK: snapshot é isolado, cobre rede mas nunca recusa de acesso (mesmo offline), " +
  "é apagado no logout, e a fila segue a mesma regra."
);
