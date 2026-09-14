-- Dados de cobrança do professor. Linha única (o app tem um professor só):
-- a chave primária booleana com check impede que exista uma segunda linha e
-- o app precise adivinhar qual vale.
create table if not exists public.trainer_settings (
  id boolean primary key default true check (id),
  pix_key text,
  pix_key_type text check (pix_key_type in ('cpf','cnpj','email','telefone','aleatoria')),
  pix_name text,
  pix_city text,
  charge_message text,
  updated_at timestamptz not null default now()
);

insert into public.trainer_settings (id) values (true) on conflict do nothing;

alter table public.trainer_settings enable row level security;

-- O aluno lê: é com esta chave que ele paga. Só o professor escreve.
drop policy if exists "todo mundo logado le a chave de cobranca" on public.trainer_settings;
create policy "todo mundo logado le a chave de cobranca"
  on public.trainer_settings for select using (true);

drop policy if exists "so o professor edita a cobranca" on public.trainer_settings;
create policy "so o professor edita a cobranca"
  on public.trainer_settings for update
  using (is_trainer()) with check (is_trainer());