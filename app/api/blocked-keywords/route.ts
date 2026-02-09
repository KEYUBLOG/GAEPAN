import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/** GET: 차단 키워드 목록 (공개, 글/댓글 마스킹용) */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("blocked_keywords")
      .select("keyword")
      .order("keyword", { ascending: true });
    if (error) {
      console.error("[blocked_keywords] public list error:", error);
      return NextResponse.json({ keywords: [] });
    }
    const keywords = ((data ?? []) as { keyword: string }[]).map((r) => r.keyword).filter(Boolean);
    return NextResponse.json({ keywords });
  } catch (e) {
    console.error("[blocked_keywords] GET error:", e);
    return NextResponse.json({ keywords: [] });
  }
}
