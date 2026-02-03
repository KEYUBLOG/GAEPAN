-- 사건 번호 (글쓴 순서대로 1부터)
-- Supabase SQL Editor에서 실행하세요.

alter table public.posts
  add column if not exists case_number integer;

-- 기존 행에 순서대로 번호 부여 (created_at 기준)
with ordered as (
  select id, row_number() over (order by created_at asc nulls last) as rn
  from public.posts
)
update public.posts p
set case_number = ordered.rn
from ordered
where p.id = ordered.id and p.case_number is null;
