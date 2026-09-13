-- Um aluno podia atualizar a própria linha de profiles, inclusive a coluna
-- role. Como is_trainer() consulta essa coluna, isso permitia promover a
-- própria conta a professor e, em seguida, acessar todos os dados.
revoke update on table public.profiles from authenticated;
grant update (full_name, phone, avatar_url) on table public.profiles to authenticated;

-- A chave PIX só é necessária depois do login. O papel PostgreSQL `public`
-- também inclui requisições anônimas do PostgREST.
drop policy if exists "todo mundo logado le a chave de cobranca" on public.trainer_settings;
drop policy if exists "usuarios logados leem a chave de cobranca" on public.trainer_settings;
create policy "usuarios logados leem a chave de cobranca"
  on public.trainer_settings
  for select
  to authenticated
  using (true);

-- Impede que a chave publicável seja usada para inundar a caixa-preta de
-- erros. Erros ocorridos antes do login continuam no aparelho e são enviados
-- depois que uma sessão autenticada existir.
drop policy if exists "qualquer um registra o proprio erro" on public.app_errors;
drop policy if exists "usuario logado registra o proprio erro" on public.app_errors;
create policy "usuario logado registra o proprio erro"
  on public.app_errors
  for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid());

-- O app não oferece cadastro público e não precisa consultar nenhuma tabela
-- antes do login. Retirar os privilégios do papel anon acrescenta uma segunda
-- barreira além do RLS.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
