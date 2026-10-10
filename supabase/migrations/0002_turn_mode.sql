-- Modo da vez: pergunta (só Próximo) ou palpite (só submit_guess), escolhido uma vez por turn_version.

create type public.turn_mode as enum ('question', 'guess');

alter table public.rooms
  add column turn_mode public.turn_mode;

alter table public.turn_events drop constraint turn_events_kind_check;

alter table public.turn_events
  add constraint turn_events_kind_check
  check (
    kind in (
      'start',
      'pass',
      'guess_wrong',
      'guess_right',
      'finish',
      'restart',
      'mode_question',
      'mode_guess'
    )
  );

create or replace function public.choose_turn_mode(
  p_room_id uuid,
  p_turn_version integer,
  p_mode public.turn_mode
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_me uuid;
  v_kind text;
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
  if v_room.turn_mode is not null then
    raise exception 'turn_mode_already_set' using errcode = 'P0001';
  end if;

  v_kind := case p_mode when 'question' then 'mode_question' else 'mode_guess' end;

  update public.rooms set turn_mode = p_mode where id = p_room_id;

  insert into public.turn_events (room_id, player_id, kind, turn_version)
  values (p_room_id, v_me, v_kind, v_room.turn_version);
end;
$$;

-- start_game: limpa turn_mode ao iniciar (corpo idêntico à 0001_init, + turn_mode)
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

  with shuffled as (
    select id, row_number() over (order by random()) - 1 as ord
    from public.players where room_id = p_room_id
  )
  update public.players p
  set turn_order = s.ord, finished_position = null, finished_at = null
  from shuffled s where p.id = s.id;

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
      turn_mode = null,
      started_at = now(),
      finished_at = null,
      expires_at = now() + interval '24 hours'
  where id = p_room_id;

  insert into public.turn_events (room_id, player_id, kind, turn_version)
  values (p_room_id, v_first_player, 'start', 1);
end;
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
  if v_room.turn_mode is null then
    raise exception 'turn_mode_required' using errcode = 'P0001';
  end if;
  if v_room.turn_mode <> 'question' then
    raise exception 'wrong_turn_mode' using errcode = 'P0001';
  end if;

  v_next := public.next_active_player(p_room_id, v_me);

  insert into public.turn_events (room_id, player_id, kind, turn_version)
  values (p_room_id, v_me, 'pass', v_room.turn_version);

  update public.rooms
  set current_player_id = coalesce(v_next, v_me),
      turn_version = turn_version + 1,
      turn_mode = null
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
  if v_room.turn_mode is null then
    raise exception 'turn_mode_required' using errcode = 'P0001';
  end if;
  if v_room.turn_mode <> 'guess' then
    raise exception 'wrong_turn_mode' using errcode = 'P0001';
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
      select id into v_last from public.players where room_id = p_room_id and finished_position is null;
      if v_last is not null then
        update public.players set finished_position = v_position + 1, finished_at = now() where id = v_last;
      end if;
      update public.rooms
      set status = 'finished',
          current_player_id = null,
          finished_at = now(),
          turn_version = turn_version + 1,
          turn_mode = null
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
      turn_version = turn_version + 1,
      turn_mode = null
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
      turn_mode = null,
      round = round + 1,
      started_at = null,
      finished_at = null,
      expires_at = now() + interval '24 hours'
  where id = p_room_id;

  insert into public.turn_events (room_id, player_id, kind, turn_version)
  values (p_room_id, null, 'restart', 0);
end;
$$;

grant execute on function public.choose_turn_mode(uuid, integer, public.turn_mode) to authenticated;
