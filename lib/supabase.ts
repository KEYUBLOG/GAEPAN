import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseEnv } from "@/lib/env";

// Database 제네릭 미지정: 커스텀 타입이 Supabase와 맞지 않을 때 insert/update 'never' 오류 방지
let browserClient: SupabaseClient | null = null;

// 서버: SUPABASE_URL 우선, 없으면 NEXT_PUBLIC_SUPABASE_URL 사용
// 브라우저: NEXT_PUBLIC_SUPABASE_URL만 사용 (NEXT_PUBLIC_ 접두사 변수만 클라이언트에 노출됨)
const getSupabaseUrl = (): string => {
  if (typeof window === "undefined") assertSupabaseEnv();
  const url =
    typeof window === "undefined"
      ? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url?.trim()) {
    throw new Error("Supabase URL is not configured. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in .env.local");
  }
  return url;
};

// anon 키 사용 중. RLS(Row Level Security)가 켜져 있으면 policies에서 INSERT 허용이 필요함.
const getSupabaseAnonKey = (): string => {
  const key =
    typeof window === "undefined"
      ? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key?.trim()) {
    throw new Error("Supabase anon key is not configured. Set SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  }
  return key;
};

export function createSupabaseServerClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false },
  });
}

/** 서버 전용. 조회수 증가 등 RLS를 우회해야 할 때 사용. env에 SUPABASE_SERVICE_ROLE_KEY 설정 필요. */
export function createSupabaseServiceRoleClient(): SupabaseClient | null {
  if (typeof window !== "undefined") return null;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY_SECRET?.trim();
  if (!key) return null;
  return createClient(getSupabaseUrl(), key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createClient(
      getSupabaseUrl(),
      getSupabaseAnonKey(),
      { auth: { persistSession: false } },
    );
  }
  return browserClient;
}

