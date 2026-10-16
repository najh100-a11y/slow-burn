-- 『1도의 가격』 함께 읽기: 열리는 날 조정 기능 추가
-- 이미 setup.sql을 실행한 프로젝트에서, SQL Editor에 붙여 넣고 한 번만 실행하세요.
-- 고칠 값은 없습니다. 그대로 실행하면 됩니다.

create table if not exists public.bookclub_schedule (
  session_id text primary key,
  read_opens date,
  board_opens date,
  all_opens date,
  updated_at timestamptz not null default now()
);
alter table public.bookclub_schedule enable row level security;
revoke all on public.bookclub_schedule from anon, authenticated;

-- 누구나 일정을 읽을 수 있음 (날짜만 담겨 있음)
create or replace function public.bookclub_get_schedule()
returns table (session_id text, read_opens date, board_opens date, all_opens date)
language sql security definer set search_path = public stable as $$
  select s.session_id, s.read_opens, s.board_opens, s.all_opens from public.bookclub_schedule s;
$$;

-- 인도자만 일정을 바꿀 수 있음 (모임 코드와 인도자 PIN 확인). 세 날짜를 모두 비우면 기본 일정으로 돌아감
create or replace function public.bookclub_set_schedule(
  p_code text, p_pin text, p_session text, p_read date, p_board date, p_all date
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.bookclub_check_leader(p_code, p_pin) then return false; end if;
  if p_read is null and p_board is null and p_all is null then
    delete from public.bookclub_schedule where session_id = p_session;
  else
    insert into public.bookclub_schedule (session_id, read_opens, board_opens, all_opens, updated_at)
    values (p_session, p_read, p_board, p_all, now())
    on conflict (session_id) do update
      set read_opens = excluded.read_opens, board_opens = excluded.board_opens,
          all_opens = excluded.all_opens, updated_at = now();
  end if;
  return true;
end; $$;

grant execute on function public.bookclub_get_schedule() to anon;
grant execute on function public.bookclub_set_schedule(text, text, text, date, date, date) to anon;

notify pgrst, 'reload schema';
