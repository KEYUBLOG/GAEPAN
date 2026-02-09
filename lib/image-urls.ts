/**
 * DB image_url 컬럼: 단일 URL 문자열 또는 JSON 배열 문자열 ["url1","url2"] 저장 가능.
 * 파싱 시 항상 string[] 로 반환 (0~n개).
 */
export function parseImageUrls(imageUrl: string | null | undefined): string[] {
  if (imageUrl == null || imageUrl === "") return [];
  const s = imageUrl.trim();
  if (s === "") return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s) as unknown;
      if (Array.isArray(arr)) {
        return arr.filter((u): u is string => typeof u === "string" && u.length > 0);
      }
    } catch {
      // fallback: single URL
    }
  }
  return [s];
}
