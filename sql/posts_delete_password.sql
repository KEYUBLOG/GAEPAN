-- 판결문 삭제용 비밀번호 컬럼
-- Supabase SQL Editor에서 실행하세요.

alter table public.posts
  add column if not exists delete_password text;

