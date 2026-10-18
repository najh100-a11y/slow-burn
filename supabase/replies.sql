-- 나눔판 답글 기능
-- 이미 setup.sql을 실행해 둔 경우, Supabase 대시보드 > SQL Editor에 이 파일을 통째로 붙여 넣고 한 번 실행하세요.
-- 고칠 값은 없습니다. 여러 번 실행해도 괜찮습니다.
-- 답글도 표에 직접 접근할 수 없고, 모임 코드를 확인하는 아래 함수들을 통해서만 읽고 씁니다.

create table if not exists public.bookclub_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.bookclub_notes(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  display_name text check (display_name is null or char_length(display_name) <= 30),
  device_id text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bookclub_replies_note_idx on public.bookclub_replies (note_id);
alter table public.bookclub_replies enable row level security;
revoke all on public.bookclub_replies from anon, authenticated;

-- 답글 달기 (숨겨진 글에는 달 수 없음)
create or replace function public.bookclub_reply(
  p_code text, p_note uuid, p_body text, p_name text, p_device text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.bookclub_code_ok(p_code) then raise exception 'invalid code'; end if;
  if not exists (select 1 from public.bookclub_notes where id = p_note and not hidden) then
    raise exception 'note not found';
  end if;
  insert into public.bookclub_replies (note_id, body, display_name, device_id)
  values (p_note, trim(p_body), nullif(trim(coalesce(p_name, '')), ''), p_device)
  returning id into new_id;
  return new_id;
end; $$;

-- 한 회차의 답글을 한꺼번에 읽기 (먼저 쓴 순서)
create or replace function public.bookclub_list_replies(p_code text, p_session text, p_device text)
returns table (id uuid, note_id uuid, body text, display_name text, mine boolean, created_at timestamptz)
language plpgsql security definer set search_path = public stable as $$
begin
  if not public.bookclub_code_ok(p_code) then raise exception 'invalid code'; end if;
  return query
    select r.id, r.note_id, r.body, r.display_name, (r.device_id = p_device), r.created_at
    from public.bookclub_replies r
    join public.bookclub_notes n on n.id = r.note_id
    where n.session_id = p_session and not n.hidden and not r.hidden
    order by r.created_at asc;
end; $$;

-- 내 답글 지우기 (쓴 휴대폰에서만)
create or replace function public.bookclub_delete_reply(p_code text, p_reply uuid, p_device text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.bookclub_code_ok(p_code) then raise exception 'invalid code'; end if;
  delete from public.bookclub_replies where id = p_reply and device_id = p_device;
  return found;
end; $$;

-- 인도자가 답글 숨기기
create or replace function public.bookclub_hide_reply(p_code text, p_pin text, p_reply uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.bookclub_check_leader(p_code, p_pin) then return false; end if;
  update public.bookclub_replies set hidden = true where id = p_reply;
  return found;
end; $$;

grant execute on function
  public.bookclub_reply(text, uuid, text, text, text),
  public.bookclub_list_replies(text, text, text),
  public.bookclub_delete_reply(text, uuid, text),
  public.bookclub_hide_reply(text, text, uuid)
to anon;

-- Data API가 새 함수들을 바로 알아보도록 새로 고침
notify pgrst, 'reload schema';

-- 숨긴 답글을 되살리려면: update public.bookclub_replies set hidden = false where id = '답글의 id';
