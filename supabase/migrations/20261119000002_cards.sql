-- =====================================================================
-- FIZZAROLLIO · Миграция 2: система карточек
-- =====================================================================

create type public.card_rarity as enum
  ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'ANOMALY');

-- Шаблоны: из них сервер выбирает название/описание/символ
create table public.card_templates (
  id           serial primary key,
  rarity       public.card_rarity not null,
  name         text not null,
  description  text not null,
  symbol       text not null,
  constraint card_templates_unique unique (rarity, name)
);

-- Вероятности выпадения редкостей (вес)
create table public.rarity_weights (
  rarity  public.card_rarity primary key,
  weight  integer not null check (weight > 0)
);

-- Серийные номера: FZ-000001, FZ-000002 ...
create sequence public.card_serial_seq start 1 minvalue 1 no cycle;

create table public.cards (
  id             uuid primary key default gen_random_uuid(),
  serial_number  text not null unique,
  name           text not null,
  description    text not null,
  symbol         text not null,
  rarity         public.card_rarity not null,
  acquired_at    timestamptz not null default now(),
  owner_id       uuid not null unique references auth.users(id) on delete cascade
  -- unique(owner_id): один пользователь = одна карточка. Это защита на уровне базы.
);

create index cards_rarity_idx on public.cards (rarity);

comment on table public.cards is 'Выданные карточки. Пишет только серверная функция issue_card().';

-- ---------------- Выдача карточки ----------------
-- Повторный вызов возвращает уже существующую карточку.
create or replace function public.issue_card(p_user_id uuid)
returns table (
  serial_number text, name text, description text, symbol text,
  rarity public.card_rarity, acquired_at timestamptz, is_new boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_existing public.cards%rowtype;
  v_rarity   public.card_rarity;
  v_tpl      public.card_templates%rowtype;
  v_total    integer;
  v_roll     integer;
  v_inserted public.cards%rowtype;
begin
  if p_user_id is null then
    raise exception 'user id required';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'user not found';
  end if;

  -- 1. Уже есть карточка? Возвращаем её.
  select * into v_existing from public.cards c where c.owner_id = p_user_id;
  if found then
    return query select v_existing.serial_number, v_existing.name, v_existing.description,
      v_existing.symbol, v_existing.rarity, v_existing.acquired_at, false;
    return;
  end if;

  -- 2. Защита от одновременных запросов одного пользователя
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into v_existing from public.cards c where c.owner_id = p_user_id;
  if found then
    return query select v_existing.serial_number, v_existing.name, v_existing.description,
      v_existing.symbol, v_existing.rarity, v_existing.acquired_at, false;
    return;
  end if;

  -- 3. Выбор редкости по весам
  select sum(weight) into v_total from public.rarity_weights;
  v_roll := 1 + floor(random() * v_total)::int;
  select r.rarity into v_rarity from (
    select rarity, sum(weight) over (order by rarity) as cum from public.rarity_weights
  ) r where r.cum >= v_roll order by r.cum limit 1;

  -- 4. Случайный шаблон этой редкости
  select * into v_tpl from public.card_templates t
   where t.rarity = v_rarity order by random() limit 1;
  if not found then
    raise exception 'no templates for rarity %', v_rarity;
  end if;

  -- 5. Создание карточки с уникальным серийным номером
  insert into public.cards (serial_number, name, description, symbol, rarity, owner_id)
  values ('FZ-' || lpad(nextval('public.card_serial_seq')::text, 6, '0'),
          v_tpl.name, v_tpl.description, v_tpl.symbol, v_tpl.rarity, p_user_id)
  returning * into v_inserted;

  return query select v_inserted.serial_number, v_inserted.name, v_inserted.description,
    v_inserted.symbol, v_inserted.rarity, v_inserted.acquired_at, true;
end;
$$;

-- Вызывать выдачу может ТОЛЬКО серверная функция (service_role), не браузер
revoke all on function public.issue_card(uuid) from public, anon, authenticated;
grant execute on function public.issue_card(uuid) to service_role;

-- ---------------- RLS ----------------
alter table public.cards enable row level security;
alter table public.card_templates enable row level security;
alter table public.rarity_weights enable row level security;

revoke all on public.cards, public.card_templates, public.rarity_weights from anon, authenticated;
revoke all on sequence public.card_serial_seq from anon, authenticated;

-- Пользователь видит только свою карточку и ничего не может менять
grant select on public.cards to authenticated;
create policy "cards_select_own" on public.cards
  for select to authenticated
  using (owner_id = (select auth.uid()));
-- политик insert/update/delete нет → запрещено всем, кроме service_role

-- Шаблоны и веса: политик нет → недоступны из браузера вообще
