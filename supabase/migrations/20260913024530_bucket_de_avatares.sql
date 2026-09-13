-- Foto de perfil de qualquer usuário (professor e aluno).
--
-- Bucket público, mas o caminho carrega um sufixo aleatório
-- (`<uid>/<uuid>.jpg`): a URL só chega a quem consegue ler a linha de
-- `profiles`, e o RLS de profiles já limita isso ao dono e ao professor.
-- Bucket privado exigiria URL assinada e renovada a cada render — na lista de
-- 12 alunos seriam 12 requisições extras só para desenhar avatares.
--
-- O limite de 2 MB é a segunda barreira: o app reduz a imagem no navegador
-- antes de enviar, mas quem chamar a API direto não passa daqui.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cada um escreve somente dentro da própria pasta. Sem isto, qualquer usuário
-- logado poderia sobrescrever a foto de outro.
drop policy if exists "avatar: envia o proprio" on storage.objects;
create policy "avatar: envia o proprio"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar: troca o proprio" on storage.objects;
create policy "avatar: troca o proprio"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar: apaga o proprio" on storage.objects;
create policy "avatar: apaga o proprio"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
