// Leo Personal Trainning — interface única de dados
//
// As telas importam SÓ deste arquivo. Nenhuma view deve tocar em localStorage
// nem no cliente do Supabase diretamente: é essa disciplina que faz a Fase 8
// ser a troca de uma linha em config.js, e não uma reescrita.

import { DATA_SOURCE } from "./config.js";
import { hoje } from "./utils.js";

const impl =
  DATA_SOURCE === "supabase"
    ? await import("./db-supabase.js")
    : await import("./db-local.js");

export const db = impl;
export default impl;

/* ==================== regras de domínio compartilhadas ====================
   Ficam aqui porque valem para as duas implementações e para as telas.      */

// O status do pagamento nunca é armazenado: "vencido" depende da data de hoje
// e, guardado no banco, apodrece — uma cobrança vencida ficaria "pendente"
// para sempre. Então é sempre calculado no momento da consulta.
export function statusPagamento(pagamento, referencia = hoje()) {
  if (!pagamento) return null;
  if (pagamento.paid_date) return "paid";
  return pagamento.due_date < referencia ? "overdue" : "pending";
}

export const ROTULO_STATUS = {
  paid: "Pago",
  pending: "A vencer",
  overdue: "Vencido",
};

// Em preto e branco, estado não pode depender de cor: cada status carrega
// rótulo e um preenchimento distinto.
export const CLASSE_STATUS = {
  paid: "tag tag-quiet",
  pending: "tag",
  overdue: "tag tag-solid",
};
