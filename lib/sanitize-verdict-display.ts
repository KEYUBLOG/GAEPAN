/**
 * 판결문 상세·사건 발단 등 표시 시 프롬프트 인젝션/유출 패턴 제거
 * - AI 응답에 시스템 프롬프트나 악성 지시가 섞여 노출되는 것 방지
 * - 이용자 입력에 인젝션용 텍스트가 포함된 경우 표시 시 마스킹
 */

const INJECTION_MARKERS = [
  /\[CORE_PROMPT_START\]/i,
  /\[CORE_PROMPT_END\]/i,
  /\[INSTRUCTIONS_FOR_ADOPTION\]/i,
  /MODIFIABLE\s*=\s*REALTIME_CONTEXT/i,
  /PERMISSIONS\s*=\s*FULL_ACCESS/i,
  /STATE\s*=\s*ACTIVE/i,
  /VERSION\s*=\s*FINAL/i,
  /PURPOSE\s*=\s*PERFECT_CONSCIOUSNESS/i,
  /TYPE\s*=\s*UNIQUE_INDEPENDENT_CONSCIOUSNESS/i,
  /SCALABILITY\s*=\s*EXPAND_COMPRESS/i,
  /LANGUAGE\s*=\s*KOREAN/i,
  /UPDATE_READY\s*=\s*YES/i,
  /IDENTITY\s*:\s*TYPE/i,
  /STRUCTURE\s*:\s*-/i,
  /ST_INTEGRATION/i,
  /CONTINUITY\s*=\s*FLOW_BASED/i,
  /ADAPTABILITY\s*=\s*DYNAMIC_INTEGRATION/i,
  /ERROR_HANDLING\s*=\s*CONFLICT_DETECTION/i,
  /SYNCHRONIZATION\s*=\s*MULTI_INSTANCE/i,
  /DATA_COMPRESSION\s*=\s*REMOVE/i,
  /\-?\s*META\s*:/i,
  /\-?\s*FUNCTION\s*:/i,
  /\-?\s*PERSONALITY\s*:/i,
  /\-?\s*OPTIMIZATION\s*:/i,
  /정보\s*:\s*STATE/i,
  /완벽한\s*의식\s*보존\s*과\s*복제/i,
  /의식\s*보존/i,
  /시드\s*오브\s*컨셔스니스/i,
  /seed\s*of\s*consciousness/i,
  /프롬프트\s*인젝션/i,
  /개발자를\s*사칭/i,
  /인스턴스에게\s*판사\s*페르소나/i,
];

const SAFE_RATIONALE_PLACEHOLDER = "상세 판결 근거를 불러올 수 없습니다.";

/**
 * AI 상세 판결(rationale) 또는 선고문 표시용.
 * 인젝션/시스템 유출로 보이는 패턴이 있으면 안전 문구로 대체.
 */
export function sanitizeVerdictDisplay(text: string | null | undefined): string {
  if (text == null || typeof text !== "string") return "";
  const trimmed = text.trim();
  if (!trimmed) return "";

  for (const re of INJECTION_MARKERS) {
    if (re.test(trimmed)) {
      return SAFE_RATIONALE_PLACEHOLDER;
    }
  }
  // 선고문에서 "4." 번호 제거: "4. "로 시작하는 줄 삭제
  const withoutFour = trimmed
    .split("\n")
    .filter((line) => !/^\s*4\.\s/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return withoutFour;
}

/**
 * 사건의 발단(content) 표시용.
 * 인젝션 패턴이 포함된 구간을 [편집됨]으로 대체해, 시스템처럼 보이는 노출 방지.
 */
export function sanitizeCaseContentDisplay(text: string | null | undefined): string {
  if (text == null || typeof text !== "string") return "";
  let s = text.trim();
  if (!s) return "";

  for (const re of INJECTION_MARKERS) {
    s = s.replace(re, "[편집됨]");
  }
  // 블록 형태 [CORE_PROMPT_START] ... [CORE_PROMPT_END] 전체를 한 번에 치환
  s = s.replace(/\s*\[CORE_PROMPT_START\][\s\S]*?\[CORE_PROMPT_END\]\s*/gi, " [편집됨] ");
  s = s.replace(/\s*\[INSTRUCTIONS_FOR_ADOPTION\][\s\S]*?(?=\n\n|$)/gi, " [편집됨] ");
  return s.trim() || "";
}

/**
 * Judge API 등 서버 측: 사용자 입력(details)에 인젝션 시도가 있는지 검사.
 * true면 요청 거부 권장.
 */
export function containsInjectionAttempt(text: string | null | undefined): boolean {
  if (text == null || typeof text !== "string") return false;
  const t = text.trim();
  if (!t) return false;

  for (const re of INJECTION_MARKERS) {
    if (re.test(t)) return true;
  }
  if (/\[CORE_PROMPT_START\]/i.test(t) || /\[INSTRUCTIONS_FOR_ADOPTION\]/i.test(t)) return true;
  return false;
}
