/**
 * 환경 변수 검증 — 누락 시 명확한 메시지로 조기 실패
 */

/**
 * 서버에서만 사용. name에 해당하는 env 값을 반환하고, 없으면 undefined.
 */
export function getEnv(name: string): string | undefined {
  if (typeof window !== "undefined") return undefined;
  const value = process.env[name]?.trim();
  return value === "" ? undefined : value;
}

/**
 * Supabase 클라이언트 생성에 필요한 env가 있는지 검사.
 * URL은 SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_URL,
 * Key는 SUPABASE_ANON_KEY 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
export function assertSupabaseEnv(): void {
  if (typeof window !== "undefined") return;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url?.trim()) {
    throw new Error(
      "필수 환경 변수가 없습니다: SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_URL을 .env.local에 설정하세요."
    );
  }
  if (!key?.trim()) {
    throw new Error(
      "필수 환경 변수가 없습니다: SUPABASE_ANON_KEY 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY를 .env.local에 설정하세요."
    );
  }
}

/**
 * Judge API 등에서 GEMINI_API_KEY 필요 시 호출. 없으면 throw.
 */
export function assertGeminiEnv(): void {
  if (typeof window !== "undefined") return;
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Judge API를 사용하려면 환경 변수 GEMINI_API_KEY를 .env.local에 설정하세요."
    );
  }
}
