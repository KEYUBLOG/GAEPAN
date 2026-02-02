import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Database = any; // 필요 시 Supabase 타입 생성기로 교체 가능

let browserClient: SupabaseClient<Database> | null = null;

// 서버: SUPABASE_URL 우선, 없으면 NEXT_PUBLIC_SUPABASE_URL 사용
// 브라우저: NEXT_PUBLIC_SUPABASE_URL만 사용 (NEXT_PUBLIC_ 접두사 변수만 클라이언트에 노출됨)
const getSupabaseUrl = (): string => {
  const url =
    typeof window === "undefined"
      ? process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Supabase URL is not configured. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in .env.local");
  }
  return url;
};

// anon 키 사용 중. RLS(Row Level Security)가 켜져 있으면 policies에서 INSERT 허용이 필요함.
// INSERT가 거부되면 Supabase 대시보드 → Authentication → Policies에서
// posts 테이블에 대해 INSERT 정책을 추가하거나, 해당 테이블 RLS를 끄세요.
const getSupabaseAnonKey = (): string => {
  const key =
    typeof window === "undefined"
      ? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("Supabase anon key is not configured. Set SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  }
  return key;
};

export function createSupabaseServerClient() {
  return createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false },
  });
}

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createClient<Database>(
      getSupabaseUrl(),
      getSupabaseAnonKey(),
      {
        auth: { persistSession: false },
      },
    );
  }
  return browserClient;
}

