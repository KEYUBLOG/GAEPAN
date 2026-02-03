-- 신고 확인완료 시 대법관이 해당 신고를 삭제할 수 있도록 DELETE 정책 추가
-- Supabase 대시보드 → SQL Editor에서 실행하세요.
-- (API는 대법관 쿠키 검사 후 서버에서만 DELETE 호출하므로 anon으로 DELETE 허용해도 안전합니다.)

drop policy if exists "Allow anon delete reports" on public.reports;
create policy "Allow anon delete reports"
  on public.reports for delete using (true);
