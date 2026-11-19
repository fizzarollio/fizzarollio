-- =====================================================================
-- FIZZAROLLIO · Миграция 1: профили пользователей
-- Пароли здесь НЕ хранятся. Ими занимается Supabase Auth (схема auth).
-- =====================================================================

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text not null default 'ГОСТЬ',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_nickname_len check (char_length(nickname) between 2 and 24),
  constraint profiles_nickname_chars check (nickname !~ '[<>&"'']')
);

comment on table public.profiles is 'Публичные данные пользователя. Пароль и почта живут в auth.users.';

-- Автоматически создаём профиль при регистрации
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nick text;
begin
  nick := left(regexp_replace(coalesce(new.raw_user_meta_data->>'nickname', ''), '[<>&"'']', '', 'g'), 24);
  if char_length(nick) < 2 then
    nick := 'ГОСТЬ-' || (1000 + floor(random() * 9000))::int;
  end if;
  insert into public.profiles (id, nickname) values (new.id, nick)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------- RLS ----------------
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- insert/delete политик нет: профиль создаёт только триггер, удаляется каскадом.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (nickname) on public.profiles to authenticated;
