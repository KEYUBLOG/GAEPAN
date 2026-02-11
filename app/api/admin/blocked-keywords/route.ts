import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export const runtime = "nodejs";

async function isOperatorLoggedIn(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("operator_session");
    return session?.value === "authenticated";
  } catch {
    return false;
  }
}

/** GET: 차단 키워드 목록 (대법관만) */
export async function GET() {
  try {
    if (!(await isOperatorLoggedIn())) {
      return NextResponse.json({ error: "대법관 권한이 필요합니다." }, { status: 403 });
    }
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("blocked_keywords")
      .select("id, keyword, created_at")
      .order("keyword", { ascending: true });
    if (error) {
      console.error("[blocked_keywords] list error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ keywords: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST: 차단 키워드 추가 (대법관만) */
export async function POST(request: Request) {
  try {
    if (!(await isOperatorLoggedIn())) {
      return NextResponse.json({ error: "대법관 권한이 필요합니다." }, { status: 403 });
    }
    const body = (await request.json().catch(() => null)) as { keyword?: string } | null;
    const keyword = typeof body?.keyword === "string" ? body.keyword.trim() : "";
    if (!keyword) {
      return NextResponse.json({ error: "키워드를 입력하세요." }, { status: 400 });
    }
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("blocked_keywords")
      .insert({ keyword } as any)
      .select("id, keyword, created_at")
      .single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "이미 등록된 키워드입니다." }, { status: 400 });
      }
      console.error("[blocked_keywords] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ keyword: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE: 차단 키워드 제거 (대법관만), body: { keyword: string } */
export async function DELETE(request: Request) {
  try {
    if (!(await isOperatorLoggedIn())) {
      return NextResponse.json({ error: "대법관 권한이 필요합니다." }, { status: 403 });
    }
    const body = (await request.json().catch(() => null)) as { keyword?: string } | null;
    const keyword = typeof body?.keyword === "string" ? body.keyword.trim() : "";
    if (!keyword) {
      return NextResponse.json({ error: "키워드를 지정하세요." }, { status: 400 });
    }
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("blocked_keywords").delete().eq("keyword", keyword);
    if (error) {
      console.error("[blocked_keywords] delete error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
