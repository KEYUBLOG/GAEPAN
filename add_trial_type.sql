-- posts 테이블에 trial_type 컬럼 추가
-- Enum: 'DEFENSE' (무죄 주장/항변), 'ACCUSATION' (유죄 주장/기소)

ALTER TABLE posts
ADD COLUMN IF NOT EXISTS trial_type TEXT CHECK (trial_type IN ('DEFENSE', 'ACCUSATION')) DEFAULT NULL;

-- 기존 데이터는 NULL로 유지 (하위 호환성)
-- 새로 작성되는 게시글은 반드시 trial_type을 선택해야 함
