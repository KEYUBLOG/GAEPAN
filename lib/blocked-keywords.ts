/**
 * 차단 키워드 검사/마스킹
 * - containsBlockedKeyword: 글/댓글 작성 시 서버에서 사용
 * - maskBlockedKeywords: 이미 작성된 글/댓글 표시 시 클라이언트에서 사용
 */

export function containsBlockedKeyword(text: string, keywords: string[]): boolean {
  if (!text || !keywords.length) return false;
  const lower = text.toLowerCase();
  for (const kw of keywords) {
    if (!kw.trim()) continue;
    if (lower.includes(kw.trim().toLowerCase())) return true;
  }
  return false;
}

const MASK = "***";

export function maskBlockedKeywords(text: string, keywords: string[]): string {
  if (!text || !keywords.length) return text;
  let result = text;
  for (const kw of keywords) {
    if (!kw.trim()) continue;
    const re = new RegExp(escapeRegex(kw.trim()), "gi");
    result = result.replace(re, MASK);
  }
  return result;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
