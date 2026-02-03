-- posts 테이블에 trial_type 컬럼 추가 (기소하기/재판 시 선택)
-- DEFENSE: 무죄 주장(항변), ACCUSATION: 유죄 주장(기소)
-- Supabase SQL Editor에서 실행하세요.

ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS trial_type text
CHECK (trial_type IS NULL OR trial_type IN ('DEFENSE', 'ACCUSATION'));

COMMENT ON COLUMN public.posts.trial_type IS 'DEFENSE=항변(무죄 주장), ACCUSATION=기소(유죄 주장)';
