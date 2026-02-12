/**
 * 선고문(verdict) 본문에서 AI 선고 결론(유죄/무죄)을 파악.
 * ratio와 불일치할 수 있으므로, 표시할 때는 선고문 텍스트를 우선하고 없으면 ratio로 fallback.
 */

/**
 * verdict(및 선택적 rationale)에서 "피고인 유죄" / "피고인 무죄" 결론을 추출.
 * rationale이 주어지면, verdict와 반대일 때 선고문 상세(무죄 표현)를 우선해 표시 일치시킴.
 * @returns "guilty" | "not_guilty" | null (판별 불가 시 null → ratio 사용)
 */
export function getConclusionFromVerdictText(
  verdict: string | null | undefined,
  rationale?: string | null
): "guilty" | "not_guilty" | null {
  const t = (verdict == null || typeof verdict !== "string" ? "" : verdict).trim();
  const r = (rationale == null || typeof rationale !== "string" ? "" : rationale).trim();

  const notGuiltyInVerdict = !!t && /피고인\s*무죄|불기소|원고\s*무죄/i.test(t);
  const guiltyInVerdict = !!t && /유죄|징역\s*\d|벌금\s*\d|사회봉사\s*\d|집행유예/i.test(t);
  const notGuiltyInRationale = !!r && /피고인\s*무죄|불기소|원고\s*무죄/i.test(r);
  const guiltyInRationale = !!r && /유죄\s*\.|징역\s*\d|벌금\s*\d|사회봉사\s*\d|집행유예/i.test(r);

  // 선고문 상세(rationale)에 무죄가 명확히 있으면 무죄 우선 (위 라벨과 본문 불일치 방지)
  if (notGuiltyInRationale && !guiltyInRationale) return "not_guilty";
  if (notGuiltyInVerdict && !guiltyInVerdict) return "not_guilty";
  if (guiltyInRationale || guiltyInVerdict) return "guilty";

  return null;
}

/**
 * 표시용 라벨: 선고문(및 상세 근거)에서 결론을 추출하고, 없으면 ratio(defendant %)로 판단.
 * @param verdict - 선고문(주문) 텍스트
 * @param defendantRatio - 피고인 과실 비율 0~100 (또는 ratio 객체에서 defendant 값)
 * @param rationale - 선고문 상세 근거 (있으면 verdict와 불일치 시 상세 내용을 우선해 라벨 일치)
 * @returns "유죄" | "무죄" | "판결 유보" (50이면 판결 유보)
 */
export function getPrimaryLabelFromVerdictAndRatio(
  verdict: string | null | undefined,
  defendantRatio: number | null | undefined | { plaintiff?: number; defendant?: number },
  rationale?: string | null
): "유죄" | "무죄" | "판결 유보" {
  const fromText = getConclusionFromVerdictText(verdict, rationale);
  if (fromText === "not_guilty") return "무죄";
  if (fromText === "guilty") return "유죄";

  const def =
    defendantRatio != null && typeof defendantRatio === "object"
      ? Number((defendantRatio as { defendant?: number }).defendant)
      : Number(defendantRatio);
  const num = Number.isFinite(def) ? def : 50;
  if (num === 50) return "판결 유보";
  return num > 50 ? "유죄" : "무죄";
}
