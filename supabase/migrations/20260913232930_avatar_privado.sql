-- SEC-02: o bucket nasceu público e a policy de leitura só perguntava
-- `bucket_id = 'avatars'`. Qualquer aluno logado listava a pasta de outro e
-- abria a foto; sem JWT nenhum, a URL pública respondia 200. O nome de arquivo
-- aleatório não ajuda quando a listagem é liberada: ela entrega o nome.
update storage.buckets set public = false where id = 'avatars';

drop policy if exists "avatar: le" on storage.objects;

-- Dono lê a própria pasta; professor lê todas (precisa ver a foto do aluno).
-- Sem `to authenticated` isso valeria para `anon` também.
create policy "avatar: dono le a propria pasta, professor le todas"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (auth.uid())::text
      or public.is_trainer()
    )
  );
