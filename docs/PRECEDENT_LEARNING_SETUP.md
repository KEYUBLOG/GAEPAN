# 판례 자동 학습 — DB 테이블 생성

Supabase SQL Editor에서 아래 SQL을 실행하세요.

```sql
-- 판례 검색 결과 캐시 (7일 유효)
CREATE TABLE IF NOT EXISTS precedent_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_key TEXT NOT NULL UNIQUE,
  result_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_precedent_cache_query_key ON precedent_cache (query_key);
CREATE INDEX IF NOT EXISTS idx_precedent_cache_created_at ON precedent_cache (created_at);

-- 단일어 검색 성공 시 저장 (다음 검색 시 해당 키워드 우선)
CREATE TABLE IF NOT EXISTS precedent_keyword_success (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_precedent_keyword_success_created_at ON precedent_keyword_success (created_at DESC);

ALTER TABLE precedent_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE precedent_keyword_success ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "precedent_cache allow anon" ON precedent_cache;
CREATE POLICY "precedent_cache allow anon" ON precedent_cache FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "precedent_keyword_success allow anon" ON precedent_keyword_success;
CREATE POLICY "precedent_keyword_success allow anon" ON precedent_keyword_success FOR ALL USING (true) WITH CHECK (true);
```

테이블이 없어도 앱은 동작하며, 캐시/학습만 비활성화됩니다.
