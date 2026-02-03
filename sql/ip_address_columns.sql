-- 기소장·댓글 IP 기반 저장 (비로그인 작성 허용)
-- Supabase 대시보드 → SQL Editor에서 실행하세요.

-- 기소장(posts): 작성 시 요청 IP 저장
alter table public.posts
  add column if not exists ip_address text;

-- 댓글(comments): 작성 시 요청 IP 저장
alter table public.comments
  add column if not exists ip_address text;
