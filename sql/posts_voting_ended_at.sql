-- 재판 즉시 완료(대법관) 시 사용. 있으면 투표 종료로 간주.
ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS voting_ended_at timestamptz;

COMMENT ON COLUMN public.posts.voting_ended_at IS '대법관이 재판 완료한 시각. NULL이면 created_at + 24h 기준으로만 종료 여부 판단';
