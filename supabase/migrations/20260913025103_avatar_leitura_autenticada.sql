-- O Storage resolve a linha do objeto antes de apagar ou substituir: sem uma
-- política de SELECT, o DELETE volta "Access denied" mesmo com a política de
-- DELETE correta. Foi o que aconteceu — a troca de foto subia a nova e nunca
-- removia a antiga, acumulando arquivo órfão.
--
-- Não amplia exposição: o bucket já é público para leitura pelo endpoint
-- público. Isto apenas deixa a API encontrar o objeto para o dono.
drop policy if exists "avatar: le" on storage.objects;
create policy "avatar: le"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');
