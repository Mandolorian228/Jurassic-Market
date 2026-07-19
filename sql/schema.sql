-- Jurassic Market — схема Supabase
-- Выполните в SQL Editor проекта Supabase.

-- Профили
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_color text not null default '#e63946',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_all"
  on public.profiles for select
  using (true);

create policy "profiles_upsert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- Комнаты
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'lobby'
    check (status in ('lobby', 'playing', 'finished')),
  location_id text not null default 'malta',
  created_at timestamptz not null default now()
);

create index if not exists rooms_code_idx on public.rooms (code);

alter table public.rooms enable row level security;

create policy "rooms_select_authenticated"
  on public.rooms for select
  to authenticated
  using (true);

create policy "rooms_insert_host"
  on public.rooms for insert
  to authenticated
  with check (auth.uid() = host_id);

create policy "rooms_update_host"
  on public.rooms for update
  to authenticated
  using (auth.uid() = host_id);

-- Игроки в комнате
create table if not exists public.room_players (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  seat int not null check (seat >= 0 and seat < 8),
  display_name text not null,
  avatar_color text not null default '#e63946',
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);

alter table public.room_players enable row level security;

create policy "room_players_select"
  on public.room_players for select
  to authenticated
  using (true);

create policy "room_players_insert_self"
  on public.room_players for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "room_players_delete_self_or_host"
  on public.room_players for delete
  to authenticated
  using (
    auth.uid() = user_id
    or auth.uid() = (select host_id from public.rooms r where r.id = room_id)
  );

-- Состояние партии
create table if not exists public.games (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.games enable row level security;

create policy "games_select"
  on public.games for select
  to authenticated
  using (true);

create policy "games_insert_member"
  on public.games for insert
  to authenticated
  with check (
    exists (
      select 1 from public.room_players rp
      where rp.room_id = games.room_id and rp.user_id = auth.uid()
    )
  );

create policy "games_update_member"
  on public.games for update
  to authenticated
  using (
    exists (
      select 1 from public.room_players rp
      where rp.room_id = games.room_id and rp.user_id = auth.uid()
    )
  );

-- Realtime
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.room_players;
