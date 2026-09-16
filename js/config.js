// Leo Personal Trainning — configuração

export const APP_NAME = "Leo Personal Trainning";

// Identifica exatamente o conjunto de arquivos que produziu um erro. O mesmo
// valor aparece no service worker; os testes impedem que os dois divirjam.
export const RELEASE_ID = "2026.09.16-8";

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

// Perfil público do professor. Aparece no painel dele e na área dos alunos.
export const PROFESSOR = {
  nome: "Leonardo Guilherme",
  titulo: "Treinador fitness e lifestyle",
  instagram: "treinador_leonardog",
  instagramUrl: "https://instagram.com/treinador_leonardog",
  especializacoes: [
    "Treinamento avançado para hipertrofia",
    "Atendimento personalizado online e presencial",
    "LGTEAM",
  ],
};

export const TIMEZONE = "America/Sao_Paulo";

// Dias sem treinar a partir dos quais o aluno aparece em "precisa de atenção".
export const DIAS_SEM_TREINAR_ALERTA = 7;
