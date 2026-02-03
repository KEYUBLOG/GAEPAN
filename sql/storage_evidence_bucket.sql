-- ⚠️ 이미지가 "안 뜨면" 반드시 확인: 버킷을 Public으로 만들어야 합니다.
-- Supabase 대시보드 → Storage에서 버킷 생성 후,
-- SQL Editor에서 아래 정책을 적용하세요.

-- 1. 버킷 생성: Storage → New bucket → 이름 "evidence"
--    ★ "Public bucket" 반드시 체크 (체크 안 하면 이미지 URL 접근 시 403으로 안 보임)

-- 2. 정책: 누구나 업로드 허용 (기소장 증거 이미지용)
-- Storage → evidence → Policies → New policy
-- Policy name: Allow public upload
-- Allowed operation: INSERT
-- Target roles: (모두 또는 anon)
-- USING expression: (비워두거나 true)

-- 3. 정책: 누구나 읽기 허용 (이미지 URL 공개)
-- Policy name: Allow public read
-- Allowed operation: SELECT
-- Target roles: (모두)
-- USING expression: true

-- SQL로 직접 만들려면 (Supabase 버전에 따라 다를 수 있음):
-- insert into storage.buckets (id, name, public) values ('evidence', 'evidence', true);
-- create policy "Allow anon upload" on storage.objects for insert with (bucket_id = 'evidence');
-- create policy "Allow public read" on storage.objects for select using (bucket_id = 'evidence');
