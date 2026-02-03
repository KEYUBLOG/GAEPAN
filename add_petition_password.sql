-- petitions 테이블에 password 컬럼 추가
-- 청원 삭제 시 사용할 비밀번호

ALTER TABLE petitions
ADD COLUMN IF NOT EXISTS password TEXT NOT NULL DEFAULT '';

-- 기존 데이터는 빈 문자열로 설정됨 (하위 호환성)
-- 새로 작성되는 청원은 반드시 password를 입력해야 함
