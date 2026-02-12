/**
 * 판례 자동 학습: 검색 결과 캐시 + 성공 키워드 저장
 * - precedent_cache: 동일/유사 쿼리 재검색 방지 (7일 유효)
 * - precedent_keyword_success: 단일어 검색 성공 시 저장 → 다음엔 해당 키워드 우선 시도
 * 테이블이 없으면 조용히 스킵 (에러 시 null/void).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const PREFERRED_KEYWORDS_LIMIT = 10;

function toQueryKey(query: string): string {
  return query.trim().replace(/\s+/g, " ").slice(0, 200);
}

/** 캐시에서 판례 블록 조회. 없거나 만료면 null */
export async function getCachedPrecedents(
  supabase: SupabaseClient,
  queryKey: string
): Promise<string | null> {
  try {
    const key = toQueryKey(queryKey);
    if (!key) return null;
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    const { data, error } = await supabase
      .from("precedent_cache")
      .select("result_text")
      .eq("query_key", key)
      .gte("created_at", cutoff)
      .limit(1)
      .maybeSingle();
    if (error || !data?.result_text) return null;
    return data.result_text as string;
  } catch {
    return null;
  }
}

/** 검색 결과를 캐시에 저장 */
export async function setCachedPrecedents(
  supabase: SupabaseClient,
  queryKey: string,
  resultText: string
): Promise<void> {
  try {
    const key = toQueryKey(queryKey);
    if (!key || !resultText) return;
    await supabase.from("precedent_cache").upsert(
      { query_key: key, result_text: resultText, created_at: new Date().toISOString() },
      { onConflict: "query_key" }
    );
  } catch {
    // ignore
  }
}

/** 최근 성공한 단일 키워드 목록 (우선 시도용) */
export async function getPreferredKeywords(supabase: SupabaseClient): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("precedent_keyword_success")
      .select("keyword")
      .order("created_at", { ascending: false })
      .limit(PREFERRED_KEYWORDS_LIMIT);
    if (error || !Array.isArray(data)) return [];
    const list = data.map((r: { keyword?: string }) => r?.keyword).filter(Boolean) as string[];
    return [...new Set(list)];
  } catch {
    return [];
  }
}

/** 단일어 검색 성공 시 호출 — 다음 검색 시 이 키워드 우선 시도 */
export async function learnKeyword(supabase: SupabaseClient, keyword: string): Promise<void> {
  try {
    const k = (keyword || "").trim();
    if (!k) return;
    await supabase.from("precedent_keyword_success").insert({ keyword: k });
  } catch {
    // ignore
  }
}
