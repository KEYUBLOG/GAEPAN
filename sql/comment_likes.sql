-- 댓글 발도장용 테이블 (comment_likes)
-- Supabase 대시보드 → SQL Editor에서 이 파일 내용을 붙여넣고 실행하세요.

create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  ip_address text not null,
  unique(comment_id, ip_address)
);

-- RLS가 켜져 있으면 anon이 읽기/쓰기 가능하도록 (비로그인 발도장용)
alter table public.comment_likes enable row level security;

drop policy if exists "Allow anon read comment_likes" on public.comment_likes;
create policy "Allow anon read comment_likes"
  on public.comment_likes for select using (true);

drop policy if exists "Allow anon insert comment_likes" on public.comment_likes;
create policy "Allow anon insert comment_likes"
  on public.comment_likes for insert with check (true);

drop policy if exists "Allow anon delete comment_likes" on public.comment_likes;
create policy "Allow anon delete comment_likes"
  on public.comment_likes for delete using (true);
