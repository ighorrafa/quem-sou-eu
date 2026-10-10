-- Quem Sou Eu: schema, RLS e regras de jogo transacionais.
-- Toda escrita feita pelo cliente passa por funções SECURITY DEFINER abaixo;
-- as tabelas expõem apenas SELECT (filtrado por RLS) para o papel authenticated.

create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos e tabelas
-- ---------------------------------------------------------------------------

create type public.room_status as enum ('lobby', 'playing', 'finished');

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references auth.users (id) on delete cascade,
  status public.room_status not null default 'lobby',
  round integer not null default 1,
  turn_version integer not null default 0,
  current_player_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours',
  constraint rooms_code_format check (code ~ '^[A-HJ-NP-Z2-9]{6}$')
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null,
  is_ready boolean not null default false,
  turn_order integer,
  finished_position integer,
  finished_at timestamptz,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id),
  constraint players_nickname_length check (char_length(nickname) between 1 and 24)
);

alter table public.rooms
  add constraint rooms_current_player_fk
  foreign key (current_player_id) references public.players (id) on delete set null;

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  owner_player_id uuid not null unique references public.players (id) on delete cascade,
  title text not null,
  normalized_title text not null,
  image_path text not null,
  created_at timestamptz not null default now(),
  constraint cards_title_length check (char_length(title) between 1 and 80),
  constraint cards_normalized_title_not_empty check (char_length(normalized_title) > 0)
);

create table public.assignments (
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  primary key (room_id, player_id),
  unique (room_id, card_id)
);

create table public.turn_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id uuid references public.players (id) on delete set null,
  kind text not null check (kind in ('start', 'pass', 'guess_wrong', 'guess_right', 'finish', 'restart')),
  guess text,
  turn_version integer not null,
  created_at timestamptz not null default now()
);

create index players_room_idx on public.players (room_id);
create index cards_room_idx on public.cards (room_id);
create index turn_events_room_idx on public.turn_events (room_id, id);
create index rooms_expires_idx on public.rooms (expires_at);

-- ---------------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------------

create or replace function public.normalize_answer(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Minúsculas, sem acentos e só letras/números (espaços e pontuação descartados).
  select nullif(
    regexp_replace(lower(extensions.unaccent('extensions.unaccent', coalesce(p_text, ''))), '[^[:alnum:]]', '', 'g'),
    ''
  );
$$;

create or replace function public.generate_room_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return result;
end;
$$;

-- Evita recursão de RLS: a checagem de participação roda como definer.
create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players
    where room_id = p_room_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.my_player_id(p_room_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.players
  where room_id = p_room_id and user_id = (select auth.uid())
  limit 1;
$$;

-- Uma carta é visível quando: sou o dono dela, ou a sala já saiu do lobby
-- e a carta não está atribuída a mim (ou já acertei o meu palpite).
create or replace function public.can_view_card(p_card_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cards c
    join public.rooms r on r.id = c.room_id
    join public.players me on me.room_id = c.room_id and me.user_id = (select auth.uid())
    where c.id = p_card_id
      and (
        c.owner_player_id = me.id
        or (
          r.status <> 'lobby'
          and (
            me.finished_position is not null
            or not exists (
              select 1 from public.assignments a
              where a.card_id = c.id and a.player_id = me.id
            )
          )
        )
      )
  );
$$;

create or replace function public.can_view_image(p_image_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cards c
    where c.image_path = p_image_path and public.can_view_card(c.id)
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: somente leitura para membros; escrita apenas via RPC
-- ---------------------------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.cards enable row level security;
alter table public.assignments enable row level security;
alter table public.turn_events enable row level security;

create policy "members read room" on public.rooms
  for select to authenticated
  using (public.is_room_member(id));

create policy "members read players" on public.players
  for select to authenticated
  using (public.is_room_member(room_id));

create policy "members read visible cards" on public.cards
  for select to authenticated
  using (public.can_view_card(id));

create policy "members read assignments" on public.assignments
  for select to authenticated
  using (public.is_room_member(room_id));

create policy "members read events" on public.turn_events
  for select to authenticated
  using (public.is_room_member(room_id));

grant usage on schema public to anon, authenticated, service_role;
grant select on public.rooms, public.players, public.cards, public.assignments, public.turn_events to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado "cards"
-- Caminho: {room_id}/{user_id}/{arquivo}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cards', 'cards', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_path_is_mine(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    array_length(storage.foldername(p_name), 1) = 2
    and (storage.foldername(p_name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.players p
      where p.room_id::text = (storage.foldername(p_name))[1]
        and p.user_id = (select auth.uid())
    );
$$;

create policy "upload own card image in lobby" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cards'
    and public.storage_path_is_mine(name)
    and exists (
      select 1 from public.rooms r
      where r.id::text = (storage.foldername(name))[1] and r.status = 'lobby'
    )
  );

create policy "read own or visible card image" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cards'
    and (public.storage_path_is_mine(name) or public.can_view_image(name))
  );

create policy "update own card image" on storage.objects
  for update to authenticated
  using (bucket_id = 'cards' and public.storage_path_is_mine(name))
  with check (bucket_id = 'cards' and public.storage_path_is_mine(name));

create policy "delete own card image" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cards' and public.storage_path_is_mine(name));

-- ---------------------------------------------------------------------------
-- RPCs de sala
-- ---------------------------------------------------------------------------

create or replace function public.peek_room(p_code text)
returns table (status public.room_status, player_count integer, is_member boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.status,
    (select count(*)::integer from public.players p where p.room_id = r.id),
    exists (select 1 from public.players p where p.room_id = r.id and p.user_id = (select auth.uid()))
  from public.rooms r
  where r.code = upper(btrim(p_code))
    and r.expires_at > now();
$$;

create or replace function public.create_room(p_nickname text)
returns table (room_id uuid, code text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nick text := btrim(coalesce(p_nickname, ''));
  v_code text;
  v_room_id uuid;
  v_attempts integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if char_length(v_nick) < 1 or char_length(v_nick) > 24 then
    raise exception 'invalid_nickname' using errcode = '22023';
  end if;

  loop
    v_code := public.generate_room_code();
    v_attempts := v_attempts + 1;
    begin
      insert into public.rooms (code, host_id) values (v_code, v_uid) returning id into v_room_id;
      exit;
    exception when unique_violation then
      if v_attempts >= 10 then
        raise exception 'could_not_generate_code';
      end if;
    end;
  end loop;

  insert into public.players (room_id, user_id, nickname) values (v_room_id, v_uid, v_nick);

  return query select v_room_id, v_code;
end;
$$;

create or replace function public.join_room(p_code text, p_nickname text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_nick text := btrim(coalesce(p_nickname, ''));
  v_room public.rooms%rowtype;
  v_player_id uuid;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_room from public.rooms
  where code = upper(btrim(p_code)) and expires_at > now()
  for update;

  if not found then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;

  select id into v_player_id from public.players where room_id = v_room.id and user_id = v_uid;
  if v_player_id is not null then
    return v_room.id;
  end if;

  if v_room.status <> 'lobby' then
    raise exception 'room_not_in_lobby' using errcode = 'P0001';
  end if;
  if char_length(v_nick) < 1 or char_length(v_nick) > 24 then
    raise exception 'invalid_nickname' using errcode = '22023';
  end if;

  select count(*) into v_count from public.players where room_id = v_room.id;
  if v_count >= 12 then
    raise exception 'room_full' using errcode = 'P0001';
  end if;

  insert into public.players (room_id, user_id, nickname) values (v_room.id, v_uid, v_nick);
  return v_room.id;
end;
$$;

create or replace function public.update_nickname(p_room_id uuid, p_nickname text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nick text := btrim(coalesce(p_nickname, ''));
  v_status public.room_status;
begin
  if char_length(v_nick) < 1 or char_length(v_nick) > 24 then
    raise exception 'invalid_nickname' using errcode = '22023';
  end if;
  select status into v_status from public.rooms where id = p_room_id;
  if v_status is distinct from 'lobby' then
    raise exception 'room_not_in_lobby' using errcode = 'P0001';
  end if;
  update public.players set nickname = v_nick
  where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
end;
$$;

-- Cria ou substitui a carta do jogador (o upload já foi feito no Storage).
create or replace function public.upsert_card(p_room_id uuid, p_title text, p_image_path text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_player public.players%rowtype;
  v_status public.room_status;
  v_title text := btrim(coalesce(p_title, ''));
  v_normalized text := public.normalize_answer(p_title);
  v_card_id uuid;
begin
  select * into v_player from public.players where room_id = p_room_id and user_id = v_uid;
  if not found then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  select status into v_status from public.rooms where id = p_room_id for update;
  if v_status <> 'lobby' then
    raise exception 'room_not_in_lobby' using errcode = 'P0001';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 80 or v_normalized is null then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  if not public.storage_path_is_mine(p_image_path) then
    raise exception 'invalid_image_path' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'cards' and o.name = p_image_path) then
    raise exception 'image_not_uploaded' using errcode = '22023';
  end if;

  insert into public.cards (room_id, owner_player_id, title, normalized_title, image_path)
  values (p_room_id, v_player.id, v_title, v_normalized, p_image_path)
  on conflict (owner_player_id) do update
    set title = excluded.title,
        normalized_title = excluded.normalized_title,
        image_path = excluded.image_path,
        created_at = now()
  returning id into v_card_id;

  -- Alterar a carta desfaz o "pronto" para o anfitrião perceber a mudança.
  update public.players set is_ready = false where id = v_player.id;

  return v_card_id;
end;
$$;

create or replace function public.set_ready(p_room_id uuid, p_ready boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_player public.players%rowtype;
  v_status public.room_status;
begin
  select * into v_player from public.players where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  select status into v_status from public.rooms where id = p_room_id for update;
  if v_status <> 'lobby' then
    raise exception 'room_not_in_lobby' using errcode = 'P0001';
  end if;
  if p_ready and not exists (select 1 from public.cards where owner_player_id = v_player.id) then
    raise exception 'card_required' using errcode = 'P0001';
  end if;
  update public.players set is_ready = p_ready where id = v_player.id;
end;
$$;

create or replace function public.leave_room(p_room_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
  v_new_host uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    return;
  end if;
  select * into v_player from public.players where room_id = p_room_id and user_id = v_uid;
  if not found then
    return;
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'room_not_in_lobby' using errcode = 'P0001';
  end if;

  delete from public.players where id = v_player.id;

  if v_room.host_id = v_uid then
    select user_id into v_new_host from public.players
    where room_id = p_room_id order by joined_at asc limit 1;
    if v_new_host is null then
      delete from public.rooms where id = p_room_id;
    else
      update public.rooms set host_id = v_new_host where id = p_room_id;
    end if;
  end if;
end;
$$;

create or replace function public.kick_player(p_room_id uuid, p_player_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.host_id <> auth.uid() then
    raise exception 'not_host' using errcode = '42501';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'room_not_in_lobby' using errcode = 'P0001';
  end if;
  delete from public.players where id = p_player_id and room_id = p_room_id and user_id <> auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs de partida
-- ---------------------------------------------------------------------------

create or replace function public.start_game(p_room_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_total integer;
  v_ready integer;
  v_with_card integer;
  v_first_player uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.host_id <> auth.uid() then
    raise exception 'not_host' using errcode = '42501';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'room_not_in_lobby' using errcode = 'P0001';
  end if;

  select count(*), count(*) filter (where is_ready) into v_total, v_ready
  from public.players where room_id = p_room_id;
  select count(*) into v_with_card from public.cards where room_id = p_room_id;

  if v_total < 2 then
    raise exception 'not_enough_players' using errcode = 'P0001';
  end if;
  if v_ready <> v_total or v_with_card <> v_total then
    raise exception 'players_not_ready' using errcode = 'P0001';
  end if;

  -- Ordem de turno aleatória.
  with shuffled as (
    select id, row_number() over (order by random()) - 1 as ord
    from public.players where room_id = p_room_id
  )
  update public.players p
  set turn_order = s.ord, finished_position = null, finished_at = null
  from shuffled s where p.id = s.id;

  -- Distribuição em anel independente da ordem de turno:
  -- cada jogador recebe a carta do próximo no anel, logo nunca a própria.
  delete from public.assignments where room_id = p_room_id;
  with ring as (
    select p.id as player_id, row_number() over (order by random()) - 1 as pos
    from public.players p where p.room_id = p_room_id
  )
  insert into public.assignments (room_id, player_id, card_id)
  select p_room_id, me.player_id, c.id
  from ring me
  join ring giver on giver.pos = (me.pos + 1) % v_total
  join public.cards c on c.owner_player_id = giver.player_id;

  select id into v_first_player from public.players
  where room_id = p_room_id order by turn_order asc limit 1;

  update public.rooms
  set status = 'playing',
      current_player_id = v_first_player,
      turn_version = 1,
      started_at = now(),
      finished_at = null,
      expires_at = now() + interval '24 hours'
  where id = p_room_id;

  insert into public.turn_events (room_id, player_id, kind, turn_version)
  values (p_room_id, v_first_player, 'start', 1);
end;
$$;

-- Próximo jogador ativo na ordem de turno, com wrap-around. Null se não houver.
create or replace function public.next_active_player(p_room_id uuid, p_current_player_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  with cur as (
    select coalesce((select turn_order from public.players where id = p_current_player_id), -1) as ord
  ),
  active as (
    select id, turn_order from public.players
    where room_id = p_room_id and finished_position is null and id <> p_current_player_id
  )
  select id from active, cur
  order by (turn_order <= cur.ord), turn_order
  limit 1;
$$;

create or replace function public.advance_turn(p_room_id uuid, p_turn_version integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_me uuid;
  v_next uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;
  if v_room.status <> 'playing' then
    raise exception 'room_not_playing' using errcode = 'P0001';
  end if;
  select id into v_me from public.players where room_id = p_room_id and user_id = auth.uid();
  if v_me is null or v_room.current_player_id <> v_me then
    raise exception 'not_your_turn' using errcode = '42501';
  end if;
  if v_room.turn_version <> p_turn_version then
    raise exception 'stale_turn' using errcode = 'P0001';
  end if;

  v_next := public.next_active_player(p_room_id, v_me);

  insert into public.turn_events (room_id, player_id, kind, turn_version)
  values (p_room_id, v_me, 'pass', v_room.turn_version);

  update public.rooms
  set current_player_id = coalesce(v_next, v_me),
      turn_version = turn_version + 1
  where id = p_room_id;
end;
$$;

create or replace function public.submit_guess(p_room_id uuid, p_turn_version integer, p_guess text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_me public.players%rowtype;
  v_answer text;
  v_guess text := public.normalize_answer(p_guess);
  v_correct boolean;
  v_next uuid;
  v_position integer;
  v_remaining integer;
  v_last uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'room_not_found' using errcode = 'P0002';
  end if;
  if v_room.status <> 'playing' then
    raise exception 'room_not_playing' using errcode = 'P0001';
  end if;
  select * into v_me from public.players where room_id = p_room_id and user_id = auth.uid();
  if v_me.id is null or v_room.current_player_id <> v_me.id then
    raise exception 'not_your_turn' using errcode = '42501';
  end if;
  if v_room.turn_version <> p_turn_version then
    raise exception 'stale_turn' using errcode = 'P0001';
  end if;
  if v_guess is null or char_length(btrim(coalesce(p_guess, ''))) > 80 then
    raise exception 'invalid_guess' using errcode = '22023';
  end if;

  select c.normalized_title into v_answer
  from public.assignments a join public.cards c on c.id = a.card_id
  where a.room_id = p_room_id and a.player_id = v_me.id;

  v_correct := (v_answer = v_guess);

  if v_correct then
    select count(*) + 1 into v_position from public.players
    where room_id = p_room_id and finished_position is not null;

    update public.players set finished_position = v_position, finished_at = now() where id = v_me.id;

    insert into public.turn_events (room_id, player_id, kind, guess, turn_version)
    values (p_room_id, v_me.id, 'guess_right', btrim(p_guess), v_room.turn_version);

    select count(*) into v_remaining from public.players
    where room_id = p_room_id and finished_position is null;

    if v_remaining <= 1 then
      -- O último jogador fecha o ranking e a partida termina.
      select id into v_last from public.players where room_id = p_room_id and finished_position is null;
      if v_last is not null then
        update public.players set finished_position = v_position + 1, finished_at = now() where id = v_last;
      end if;
      update public.rooms
      set status = 'finished', current_player_id = null, finished_at = now(), turn_version = turn_version + 1
      where id = p_room_id;
      insert into public.turn_events (room_id, player_id, kind, turn_version)
      values (p_room_id, null, 'finish', v_room.turn_version + 1);
      return jsonb_build_object('correct', true, 'position', v_position, 'finished', true);
    end if;
  else
    insert into public.turn_events (room_id, player_id, kind, guess, turn_version)
    values (p_room_id, v_me.id, 'guess_wrong', btrim(p_guess), v_room.turn_version);
  end if;

  v_next := public.next_active_player(p_room_id, v_me.id);
  update public.rooms
  set current_player_id = coalesce(v_next, v_me.id),
      turn_version = turn_version + 1
  where id = p_room_id;

  return jsonb_build_object('correct', v_correct, 'position', v_position, 'finished', false);
end;
$$;

create or replace function public.restart_game(p_room_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found or v_room.host_id <> auth.uid() then
    raise exception 'not_host' using errcode = '42501';
  end if;
  if v_room.status = 'lobby' then
    raise exception 'room_in_lobby' using errcode = 'P0001';
  end if;

  delete from public.assignments where room_id = p_room_id;
  delete from public.cards where room_id = p_room_id;
  update public.players
  set is_ready = false, turn_order = null, finished_position = null, finished_at = null
  where room_id = p_room_id;

  update public.rooms
  set status = 'lobby',
      current_player_id = null,
      turn_version = 0,
      round = round + 1,
      started_at = null,
      finished_at = null,
      expires_at = now() + interval '24 hours'
  where id = p_room_id;

  insert into public.turn_events (room_id, player_id, kind, turn_version)
  values (p_room_id, null, 'restart', 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------------

revoke all on function public.normalize_answer(text) from public;
revoke all on function public.generate_room_code() from public;
revoke all on function public.next_active_player(uuid, uuid) from public;

grant execute on function public.normalize_answer(text) to authenticated, service_role;
grant execute on function public.is_room_member(uuid) to authenticated;
grant execute on function public.my_player_id(uuid) to authenticated;
grant execute on function public.can_view_card(uuid) to authenticated;
grant execute on function public.can_view_image(text) to authenticated;
grant execute on function public.storage_path_is_mine(text) to authenticated;
grant execute on function public.peek_room(text) to authenticated;
grant execute on function public.create_room(text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.update_nickname(uuid, text) to authenticated;
grant execute on function public.upsert_card(uuid, text, text) to authenticated;
grant execute on function public.set_ready(uuid, boolean) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;
grant execute on function public.kick_player(uuid, uuid) to authenticated;
grant execute on function public.start_game(uuid) to authenticated;
grant execute on function public.advance_turn(uuid, integer) to authenticated;
grant execute on function public.submit_guess(uuid, integer, text) to authenticated;
grant execute on function public.restart_game(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: mudanças filtradas por RLS
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.rooms, public.players, public.turn_events, public.assignments;
