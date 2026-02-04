-- ⚠️ 경고: 이 스크립트는 public 스키마의 모든 테이블을 삭제합니다.
-- 실행 후 데이터 복구가 불가능하므로, 반드시 백업 후 개발/테스트 DB에서만 실행하세요.

-- 방법 1: public 스키마의 모든 테이블을 한 번에 DROP (CASCADE로 FK 무시)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
  LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;
