import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

function isRlsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /row-level security|policy|RLS/i.test(msg);
}

/** GET: 해당 기소장(post)의 배심원 한마디 목록 (대댓글 포함, parent_id로 계층) */
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
      .select("id, content, created_at, parent_id")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      if (isRlsError(error)) {
        return NextResponse.json(
          { error: "댓글을 불러올 수 없습니다. RLS 설정을 확인해 주세요." },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ comments: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST: 배심원 한마디 작성 (parent_id 있으면 대댓글) */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    if (!postId?.trim()) {
      return NextResponse.json({ error: "post id required" }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as { content?: string; parent_id?: string | null } | null;
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (content.length === 0) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }
    if (content.length > 2000) {
      return NextResponse.json({ error: "content too long (max 2000)" }, { status: 400 });
    }

    const parentId = typeof body?.parent_id === "string" && body.parent_id.trim() ? body.parent_id.trim() : null;

    const supabase = createSupabaseServerClient();
    const insertPayload: { post_id: string; content: string; parent_id?: string } = { post_id: postId, content };
    if (parentId) insertPayload.parent_id = parentId;

    const { data, error } = await supabase
      .from("comments")
      .insert(insertPayload)
      .select("id, content, created_at, parent_id")
      .single();

    if (error) {
      if (isRlsError(error)) {
        return NextResponse.json(
          { error: "댓글을 등록할 수 없습니다. RLS 설정을 확인해 주세요." },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ comment: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
