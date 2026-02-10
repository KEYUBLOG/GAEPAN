/**
 * 판결문(verdict) 문자열에서 실제 선고 내용만 추출.
 * 예: "징역 n년", "사회봉사 n시간", "벌금 n원", "피고인 무죄. 불기소." 등
 */
export function extractSentenceFromVerdict(verdict: string): string {
  if (!verdict || typeof verdict !== "string") return "";
  const t = verdict.trim();
  const prefix = "선고한다.";
  const i = t.indexOf(prefix);
  if (i >= 0) {
    let rest = t.slice(i + prefix.length).trim();
    const ratioIdx = rest.search(/\s*과실비율/);
    if (ratioIdx >= 0) rest = rest.slice(0, ratioIdx).trim();
    return rest || t;
  }
  return t;
}
