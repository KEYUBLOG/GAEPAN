-- 실시간 재판소(Live Feed)용 투표 이벤트 테이블
-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.vote_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  post_title text,
  vote_type text not null check (vote_type in ('guilty', 'not_guilty')),
  voter_display text default '익명 배심원(Lv.1)',
  created_at timestamptz default now()
);

create index if not exists vote_events_created_at_idx on public.vote_events(created_at desc);

alter table public.vote_events enable row level security;

drop policy if exists "Allow anon select vote_events" on public.vote_events;
create policy "Allow anon select vote_events"
  on public.vote_events for select using (true);

drop policy if exists "Allow service insert vote_events" on public.vote_events;
-- API(service role)에서 insert 하므로 anon insert 허용 (실제로는 서버에서 호출)
create policy "Allow anon insert vote_events"
  on public.vote_events for insert with check (true);
