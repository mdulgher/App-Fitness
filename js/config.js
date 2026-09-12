// Leo Personal Trainning — configuração

export const APP_NAME = "Leo Personal Trainning";

// 'local'    -> dados no localStorage do navegador, sem senha de verdade
// 'supabase' -> banco de verdade, com login e regras de acesso reais
//
// Trocar esta linha é a única mudança necessária para migrar. Nenhuma tela
// sabe qual das duas está ativa.
export const DATA_SOURCE = "supabase";

// A chave publicável é pública por design: ela não libera nada sozinha. Quem
// controla o acesso são as políticas de RLS no banco. A chave `service_role`
// NUNCA entra neste arquivo — ela ignora todas as regras.
export const SUPABASE = {
  url: "https://azifpaxbeozfooydkzxh.supabase.co",
  anonKey: "sb_publishable_XPz0zWG0jIm1n1yyQEkSgA_EWQtkfbp",
};

export const TIMEZONE = "America/Sao_Paulo";

// Dias sem treinar a partir dos quais o aluno aparece em "precisa de atenção".
export const DIAS_SEM_TREINAR_ALERTA = 7;
