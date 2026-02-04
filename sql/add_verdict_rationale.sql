-- 기소 후 AI 판결문의 상세 설명(ratio.rationale) 저장용
-- 예: "원고는 과음으로 인해 정상적인 판단과 행동이 불가능한 상태를 자초했으며..."
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS verdict_rationale text;

COMMENT ON COLUMN posts.verdict_rationale IS 'AI 판결 상세 이유문 (judge API verdict.ratio.rationale)';
