-- 게시글 카테고리 컬럼 (글쓰기 시 선택, 메인 필터용)
-- Supabase SQL Editor에서 실행하세요.

alter table public.posts
  add column if not exists category text;

-- 선택: 기존 행을 '기타'로 채우려면 아래 주석 해제
-- update public.posts set category = '기타' where category is null;
