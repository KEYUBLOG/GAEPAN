/**
 * API 라우트 공통: IP 추출, RLS 에러 판별
 */

/** 요청에서 클라이언트 IP 추출 (프록시/ Vercel 등 고려) */
export function getIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Supabase RLS/정책 관련 에러인지 판별 */
export function isRlsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /row-level security|policy|RLS/i.test(msg);
}
