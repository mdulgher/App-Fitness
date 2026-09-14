-- A tabela nasceu com RLS ligada e só policy de SELECT, então a própria
-- `vender_pacote` — que roda como `security invoker`, de propósito — era
-- recusada ao gravar a chave de idempotência. Sem INSERT não há venda; sem
-- DELETE, `cancelar_pacote` não consegue limpar a chave da venda cancelada.
drop policy if exists "so o professor registra a venda" on public.sale_requests;
create policy "so o professor registra a venda"
  on public.sale_requests for insert to authenticated
  with check (public.is_trainer() and actor_id = auth.uid());

drop policy if exists "so o professor limpa a venda cancelada" on public.sale_requests;
create policy "so o professor limpa a venda cancelada"
  on public.sale_requests for delete to authenticated
  using (public.is_trainer());

-- UPDATE segue sem policy de propósito: a trilha de uma venda não se edita.
