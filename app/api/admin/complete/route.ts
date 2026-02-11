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

/** POST: 대법관이 재판을 즉시 완료 (voting_ended_at 설정) */
export async function POST(request: Request) {
  try {
    if (!(await isOperatorLoggedIn())) {
      return NextResponse.json({ error: "대법관 권한이 필요합니다." }, { status: 403 });
    }

    let body: { post_id?: string } = {};
    try {
      body = (await request.json()) as { post_id?: string };
    } catch {
      return NextResponse.json({ error: "JSON body가 필요합니다." }, { status: 400 });
    }

    const postId = typeof body.post_id === "string" ? body.post_id.trim() : "";
    if (!postId) {
      return NextResponse.json({ error: "post_id가 필요합니다." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select("id")
      .eq("id", postId)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!post) {
      return NextResponse.json({ error: "해당 게시글을 찾을 수 없습니다." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("posts")
      .update({ voting_ended_at: now } as any)
      .eq("id", postId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, voting_ended_at: now });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
