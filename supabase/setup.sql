-- 『1도의 가격』 함께 읽기: 나눔판(함께 보기) 설정
-- Supabase 대시보드 > SQL Editor에 통째로 붙여 넣고 실행하세요.
-- 맨 아래 INSERT 문의 모임 코드와 인도자 PIN은 꼭 바꿔서 실행하세요.
-- 표에는 앱이 직접 접근할 수 없고, 아래 함수들을 통해서만 읽고 씁니다.
-- 함수마다 모임 코드를 확인하므로, 코드를 모르는 사람은 나눔판을 보거나 쓸 수 없습니다.

-- 1. 설정 (모임 코드, 인도자 PIN)
create table if not exists public.bookclub_settings (
  id int primary key default 1 check (id = 1),
  join_code text not null,
  leader_pin text not null
);
alter table public.bookclub_settings enable row level security;

-- 2. 나눔판 문장
create table if not exists public.bookclub_notes (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  kind text not null check (kind in ('moved', 'doubt')),
  body text not null check (char_length(body) between 1 and 1000),
  page text check (page is null or char_length(page) <= 20),
  display_name text check (display_name is null or char_length(display_name) <= 30),
  device_id text not null,
  likes int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bookclub_notes_session_idx on public.bookclub_notes (session_id);
alter table public.bookclub_notes enable row level security;

-- 3. 나도요
create table if not exists public.bookclub_likes (
  note_id uuid not null references public.bookclub_notes(id) on delete cascade,
  device_id text not null,
  primary key (note_id, device_id)
);
alter table public.bookclub_likes enable row level security;

revoke all on public.bookclub_settings, public.bookclub_notes, public.bookclub_likes from anon, authenticated;

-- 4. 함수
create or replace function public.bookclub_code_ok(p_code text) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.bookclub_settings where id = 1 and join_code = p_code);
$$;

create or replace function public.bookclub_check_code(p_code text) returns boolean
language sql security definer set search_path = public stable as $$
  select public.bookclub_code_ok(p_code);
$$;

create or replace function public.bookclub_check_leader(p_code text, p_pin text) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.bookclub_settings where id = 1 and join_code = p_code and leader_pin = p_pin);
$$;

create or replace function public.bookclub_post(
  p_code text, p_session text, p_kind text, p_body text, p_page text, p_name text, p_device text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.bookclub_code_ok(p_code) then raise exception 'invalid code'; end if;
  insert into public.bookclub_notes (session_id, kind, body, page, display_name, device_id)
  values (p_session, p_kind, trim(p_body), nullif(trim(coalesce(p_page, '')), ''), nullif(trim(coalesce(p_name, '')), ''), p_device)
  returning id into new_id;
  return new_id;
end; $$;

create or replace function public.bookclub_list(p_code text, p_session text, p_device text)
returns table (id uuid, kind text, body text, page text, display_name text, likes int, liked boolean, mine boolean, created_at timestamptz)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.bookclub_code_ok(p_code) then raise exception 'invalid code'; end if;
  return query
    select n.id, n.kind, n.body, n.page, n.display_name, n.likes,
           exists (select 1 from public.bookclub_likes l where l.note_id = n.id and l.device_id = p_device),
           (n.device_id = p_device),
           n.created_at
    from public.bookclub_notes n
    where n.session_id = p_session and not n.hidden
    order by n.likes desc, n.created_at asc;
end; $$;

create or replace function public.bookclub_count(p_code text, p_session text) returns int
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.bookclub_code_ok(p_code) then raise exception 'invalid code'; end if;
  return (select count(*)::int from public.bookclub_notes where session_id = p_session and not hidden);
end; $$;

create or replace function public.bookclub_toggle_like(p_code text, p_note uuid, p_device text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.bookclub_code_ok(p_code) then raise exception 'invalid code'; end if;
  if exists (select 1 from public.bookclub_likes where note_id = p_note and device_id = p_device) then
    delete from public.bookclub_likes where note_id = p_note and device_id = p_device;
  else
    insert into public.bookclub_likes (note_id, device_id) values (p_note, p_device);
  end if;
  update public.bookclub_notes
     set likes = (select count(*) from public.bookclub_likes where note_id = p_note)
   where id = p_note
  returning likes into n;
  return n;
end; $$;

create or replace function public.bookclub_delete_mine(p_code text, p_note uuid, p_device text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.bookclub_code_ok(p_code) then raise exception 'invalid code'; end if;
  delete from public.bookclub_notes where id = p_note and device_id = p_device;
  return found;
end; $$;

create or replace function public.bookclub_hide(p_code text, p_pin text, p_note uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.bookclub_check_leader(p_code, p_pin) then return false; end if;
  update public.bookclub_notes set hidden = true where id = p_note;
  return found;
end; $$;

grant execute on function
  public.bookclub_check_code(text),
  public.bookclub_check_leader(text, text),
  public.bookclub_post(text, text, text, text, text, text, text),
  public.bookclub_list(text, text, text),
  public.bookclub_count(text, text),
  public.bookclub_toggle_like(text, uuid, text),
  public.bookclub_delete_mine(text, uuid, text),
  public.bookclub_hide(text, text, uuid)
to anon;

-- 5. 모임 코드와 인도자 PIN (바꿔서 실행하세요. 나중에 바꿀 때도 이 문장만 다시 실행하면 됩니다)
insert into public.bookclub_settings (id, join_code, leader_pin)
values (1, '여기에모임코드', '여기에인도자PIN')
on conflict (id) do update set join_code = excluded.join_code, leader_pin = excluded.leader_pin;

-- 숨긴 글을 되살리려면: update public.bookclub_notes set hidden = false where id = '글의 id';
-- 모임이 모두 끝난 뒤 나눔판을 비우려면: delete from public.bookclub_notes;
