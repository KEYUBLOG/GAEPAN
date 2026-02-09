This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## DB 스키마 (추가)

- **posts.likes** (integer, default 0): 발도장(좋아요) 수 캐시.
- **posts.case_number** (integer, optional): 사건 번호. 글쓴 순서대로 1부터 부여. `sql/posts_case_number.sql` 참고.
- **posts.delete_password** (text, optional): 판결문 삭제용 비밀번호 해시. `sql/posts_delete_password.sql` 참고.
- **posts.ip_address** (text, optional): 기소장 작성 시 요청 IP. 비로그인 허용.
- **comments.ip_address** (text, optional): 댓글 작성 시 요청 IP. 비로그인 허용.
- **likes** 테이블: `id`, `ip_address`, `target_type` ('post'|'comment'), `target_id` (uuid).  
  한 IP당 글/댓글당 1회만 발도장 가능. Unique(`ip_address`, `target_type`, `target_id`) 권장.
- **comment_likes** 테이블: `id`, `comment_id`, `ip_address`. 댓글 발도장용. `sql/comment_likes.sql` 참고.
- **reports** 테이블: `id`, `target_type` ('post'|'comment'), `target_id`, `reason`, `reporter`, `created_at` 등. 신고 접수 시 저장. Supabase 대시보드에서 확인. **테이블 생성:** `sql/reports.sql` 실행.
- **post_views** 테이블: 조회수 집계(IP당 1회). 테이블은 있는데 **`ip_address` 컬럼이 없다**는 PGRST204 오류가 나면 Supabase SQL Editor에서 아래 실행:
  ```sql
  ALTER TABLE public.post_views ADD COLUMN IF NOT EXISTS ip_address text;
  UPDATE public.post_views SET ip_address = 'legacy-' || ctid::text WHERE ip_address IS NULL;
  ALTER TABLE public.post_views ALTER COLUMN ip_address SET NOT NULL;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_views_post_id_ip_address_key') THEN
      ALTER TABLE public.post_views ADD CONSTRAINT post_views_post_id_ip_address_key UNIQUE (post_id, ip_address);
    END IF; END $$;
  ```
  (`ctid`는 PostgreSQL 행마다 있는 시스템 컬럼이라 테이블에 id가 없어도 동작합니다.)  
  **테이블 자체가 없을 때**는 아래 전체 실행:
  ```sql
  create table if not exists public.post_views (
    id uuid primary key default gen_random_uuid(),
    post_id uuid not null references public.posts(id) on delete cascade,
    ip_address text not null,
    created_at timestamptz not null default now(),
    unique(post_id, ip_address)
  );
  create index if not exists post_views_post_id_idx on public.post_views(post_id);
  alter table public.post_views enable row level security;
  create policy "post_views_select" on public.post_views for select using (true);
  create policy "post_views_insert" on public.post_views for insert with check (true);
  ```
- **blocked_keywords** 테이블: 대법관이 등록한 차단 키워드. 해당 키워드가 포함된 글/댓글은 작성 불가, 이미 작성된 글/댓글은 표시 시 `***`로 마스킹. **테이블 생성:** Supabase SQL Editor에서 아래 실행:
  ```sql
  create table if not exists public.blocked_keywords (
    id uuid primary key default gen_random_uuid(),
    keyword text not null unique,
    created_at timestamptz not null default now()
  );
  create index if not exists blocked_keywords_keyword_idx on public.blocked_keywords(keyword);
  alter table public.blocked_keywords enable row level security;
  create policy "blocked_keywords_select" on public.blocked_keywords for select using (true);
  create policy "blocked_keywords_insert" on public.blocked_keywords for insert with check (true);
  create policy "blocked_keywords_delete" on public.blocked_keywords for delete using (true);
  ```

사건 번호 컬럼 추가: `sql/posts_case_number.sql` 실행.  
기소장·댓글 IP 컬럼 추가: `sql/ip_address_columns.sql` 실행.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
