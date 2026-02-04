-- ⚠️ 경고: public 스키마의 모든 테이블 **안의 데이터만** 삭제합니다.
-- 테이블 구조(컬럼 등)는 그대로 두고, 행(row)만 전부 비웁니다. 실행 후 복구 불가.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
  LOOP
    EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;
