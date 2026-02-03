-- 신고 내역 저장 테이블 (reports)
-- Supabase 대시보드 → SQL Editor에서 실행하세요.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  reason text,
  reporter text default 'anonymous',
  ai_decision text,
  created_at timestamptz default now()
);

-- RLS: anon이 신고 INSERT 가능하도록
alter table public.reports enable row level security;

drop policy if exists "Allow anon insert reports" on public.reports;
create policy "Allow anon insert reports"
  on public.reports for insert with check (true);

-- 관리자 등이 Supabase 대시보드에서 조회할 수 있도록 SELECT 허용 (선택)
drop policy if exists "Allow anon select reports" on public.reports;
create policy "Allow anon select reports"
  on public.reports for select using (true);
