-- Encerrar as sessoes de um aluno, para o "Redefinir senha" do professor (AT-06).
--
-- Trocar a senha NAO invalida o que ja esta aberto: o access token vale ate
-- expirar e o refresh token continua renovando. Sem revogar, "redefinir senha"
-- deixaria o aparelho antigo dentro da conta com a senha velha — a mesma
-- armadilha do "Sair" que nao saia, de 16/09.
--
-- Por que no banco e nao pela API de Auth: nesta versao do GoTrue nao existe
-- endpoint administrativo para isso. Medido, nao suposto —
-- `DELETE /admin/users/{id}/sessions` responde 404, e `auth.admin.signOut()` do
-- supabase-js recebe o JWT do usuario, que a Edge Function nao tem (quem esta
-- logado la e o professor). Passar o id no lugar do token da 403
-- "token is malformed", em silencio para quem chamou.
--
-- Apagar a sessao basta: `auth.refresh_tokens` e `auth.mfa_amr_claims` apontam
-- para `auth.sessions` com `on delete cascade`.
create or replace function public.encerrar_sessoes_do_aluno(aluno uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  removidas integer;
begin
  -- O alvo precisa ser aluno. A Edge Function ja confere isso, e aqui de novo
  -- de proposito: uma funcao `security definer` que escreve no schema `auth`
  -- nao pode depender de quem a chama ter conferido.
  if not exists (
    select 1 from public.profiles where id = aluno and role = 'student'
  ) then
    raise exception 'Só as sessões de um aluno podem ser encerradas por aqui.';
  end if;

  delete from auth.sessions where user_id = aluno;
  get diagnostics removidas = row_count;
  return removidas;
end;
$$;

-- Ninguem alcanca isto pelo navegador. Quem chama e a Edge Function
-- `redefinir-senha-aluno`, com `service_role`, depois de conferir que quem
-- pediu e o professor.
revoke execute on function public.encerrar_sessoes_do_aluno(uuid) from public;
revoke execute on function public.encerrar_sessoes_do_aluno(uuid) from anon;
revoke execute on function public.encerrar_sessoes_do_aluno(uuid) from authenticated;
grant execute on function public.encerrar_sessoes_do_aluno(uuid) to service_role;
