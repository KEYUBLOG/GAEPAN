import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/** GET: 해당 기소장(post)의 익명 댓글(반론) 목록 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    if (!postId?.trim()) {
      return NextResponse.json({ error: "post id required" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("comments")
      .select("id, content, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[GAEPAN] comments fetch error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ comments: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST: 익명 댓글(반론) 작성 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    if (!postId?.trim()) {
      return NextResponse.json({ error: "post id required" }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as { content?: string } | null;
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (content.length === 0) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }
    if (content.length > 2000) {
      return NextResponse.json({ error: "content too long (max 2000)" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("comments")
      .insert({ post_id: postId, content })
      .select("id, content, created_at")
      .single();

    if (error) {
      console.error("[GAEPAN] comment insert error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ comment: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
