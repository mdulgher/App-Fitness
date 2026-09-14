-- Log de erros do app. Quem escreve é o próprio app, de dentro do navegador do
-- usuário; quem lê é o professor (e o Claude Code, pelo MCP do Supabase).
create table if not exists public.app_errors (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  user_id      uuid references auth.users(id) on delete set null,
  papel        text,
  rota         text,
  origem       text,                  -- 'janela' | 'promessa' | 'tela' | 'fila'
  mensagem     text not null,
  detalhe      text,                  -- pilha, truncada
  contexto     jsonb,                 -- o que a tela estava fazendo
  navegador    text,
  online       boolean
);

create index if not exists app_errors_created_at_idx on public.app_errors (created_at desc);

alter table public.app_errors enable row level security;

-- Qualquer sessão registra o próprio erro, inclusive antes do login (user_id
-- nulo). Sem isso, justamente o erro que impede de entrar nunca seria visto.
drop policy if exists "qualquer um registra o proprio erro" on public.app_errors;
create policy "qualquer um registra o proprio erro" on public.app_errors
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- Ler é só do professor: log tem rota, id e mensagem de erro de outras pessoas.
drop policy if exists "so o professor le os erros" on public.app_errors;
create policy "so o professor le os erros" on public.app_errors
  for select to authenticated
  using (public.is_trainer());

drop policy if exists "so o professor apaga erros" on public.app_errors;
create policy "so o professor apaga erros" on public.app_errors
  for delete to authenticated
  using (public.is_trainer());