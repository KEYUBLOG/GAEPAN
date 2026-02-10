# 알림 기능 설정

Supabase SQL Editor에서 아래 스크립트를 **순서대로** 한 번씩 실행해 주세요.

## 1. posts에 작성자 IP 컬럼 추가 (필수)

알림은 "글 작성자 IP"로 보내므로, `posts` 테이블에 `ip_address`가 없으면 먼저 추가해야 합니다.

```sql
-- 작성자 IP 없으면 알림이 생성되지 않음
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS ip_address text;

COMMENT ON COLUMN public.posts.ip_address IS '글 작성자 IP (알림 수신자 식별용)';
```

기존 글은 `ip_address`가 null일 수 있습니다. **이후 기소장으로 새로 작성된 글**부터 IP가 저장되고, 그 글에 댓글/투표가 오면 알림이 갑니다.

## 2. notifications 테이블 생성

```sql
-- 알림: 본인 글에 댓글/투표, 본인 댓글에 대댓글/발도장 시 수신 (IP 기준)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_ip text not null,
  type text not null check (type in ('comment_on_post', 'vote_on_post', 'reply_on_comment', 'like_on_comment')),
  post_id uuid references public.posts(id) on delete set null,
  comment_id uuid references public.comments(id) on delete set null,
  actor_display text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient_created
  on public.notifications (recipient_ip, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Allow anon read own notifications" on public.notifications;
create policy "Allow anon read own notifications"
  on public.notifications for select using (true);

drop policy if exists "Allow anon insert notifications" on public.notifications;
create policy "Allow anon insert notifications"
  on public.notifications for insert with check (true);

drop policy if exists "Allow anon delete own notifications" on public.notifications;
create policy "Allow anon delete own notifications"
  on public.notifications for delete using (true);
```
