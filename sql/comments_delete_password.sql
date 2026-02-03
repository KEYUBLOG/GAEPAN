-- 댓글/대댓글 삭제용 비밀번호 컬럼 (SHA256 해시 저장)
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS delete_password text;
