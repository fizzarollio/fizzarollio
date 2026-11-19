-- =====================================================================
-- FIZZAROLLIO · Миграция 4: у каждой карточки свой неповторимый «геном»
-- Подходит и для нового проекта, и для уже созданного (старые карточки получат геном).
-- =====================================================================

-- glyph = 28 бит, из них рисуется симметричный узор 7x7. В базе он UNIQUE:
-- двух одинаковых карточек быть не может (≈ 268 миллионов вариантов).
alter table public.cards add column if not exists glyph integer;

-- Уже выданным карточкам даём уникальный геном (умножение на нечётное число
-- по модулю 2^28 — взаимно однозначное, повторов не будет).
with numbered as (
  select id, row_number() over (order by acquired_at, id) as rn
    from public.cards where glyph is null
)
update public.cards c
   set glyph = ((n.rn * 2654435761) % 268435456)::int
  from numbered n
 where c.id = n.id;

alter table public.cards alter column glyph set not null;
alter table public.cards add constraint cards_glyph_unique unique (glyph);
alter table public.cards add constraint cards_glyph_range check (glyph between 0 and 268435455);

-- ---------------- Выдача карточки (новая версия) ----------------
drop function if exists public.issue_card(uuid);

create or replace function public.issue_card(p_user_id uuid)
returns table (
  serial_number text, name text, description text, symbol text,
  rarity public.card_rarity, glyph integer, acquired_at timestamptz, is_new boolean
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
  v_glyph    integer;
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
      v_existing.symbol, v_existing.rarity, v_existing.glyph, v_existing.acquired_at, false;
    return;
  end if;

  -- 2. Защита от одновременных запросов одного пользователя
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into v_existing from public.cards c where c.owner_id = p_user_id;
  if found then
    return query select v_existing.serial_number, v_existing.name, v_existing.description,
      v_existing.symbol, v_existing.rarity, v_existing.glyph, v_existing.acquired_at, false;
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

  -- 5. Уникальный геном + серийный номер. Если геном вдруг занят — берём другой.
  for i in 1..40 loop
    v_glyph := floor(random() * 268435456)::int;
    if exists (select 1 from public.cards c where c.glyph = v_glyph) then
      continue;
    end if;
    begin
      insert into public.cards (serial_number, name, description, symbol, rarity, glyph, owner_id)
      values ('FZ-' || lpad(nextval('public.card_serial_seq')::text, 6, '0'),
              v_tpl.name, v_tpl.description, v_tpl.symbol, v_tpl.rarity, v_glyph, p_user_id)
      returning * into v_inserted;
      exit;
    exception when unique_violation then
      -- в ту же долю секунды этот геном забрал другой игрок: пробуем снова
      select * into v_existing from public.cards c where c.owner_id = p_user_id;
      if found then
        return query select v_existing.serial_number, v_existing.name, v_existing.description,
          v_existing.symbol, v_existing.rarity, v_existing.glyph, v_existing.acquired_at, false;
        return;
      end if;
    end;
  end loop;

  if v_inserted.id is null then
    raise exception 'could not allocate unique card';
  end if;

  return query select v_inserted.serial_number, v_inserted.name, v_inserted.description,
    v_inserted.symbol, v_inserted.rarity, v_inserted.glyph, v_inserted.acquired_at, true;
end;
$$;

revoke all on function public.issue_card(uuid) from public, anon, authenticated;
grant execute on function public.issue_card(uuid) to service_role;
