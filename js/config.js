// Leo Personal Trainning — configuração

export const APP_NAME = "Leo Personal Trainning";

// 'local'    -> dados no localStorage do navegador (fases 0 a 7)
// 'supabase' -> banco de verdade (fase 8)
// Trocar esta linha é a única mudança necessária para migrar.
export const DATA_SOURCE = "local";

export const SUPABASE = {
  url: "",
  anonKey: "",
};

export const TIMEZONE = "America/Sao_Paulo";

// Dias sem treinar a partir dos quais o aluno aparece em "precisa de atenção".
export const DIAS_SEM_TREINAR_ALERTA = 7;
