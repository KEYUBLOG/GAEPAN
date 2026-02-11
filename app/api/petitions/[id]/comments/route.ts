import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { isRlsError } from "@/lib/request-utils";
import { cookies } from "next/headers";

export const runtime = "nodejs";

/** GET: 청원 댓글 조회 (대법관 답변 포함) */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "petition id required" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("petition_comments")
      .select("id, content, created_at, is_operator")
      .eq("petition_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      if (isRlsError(error)) {
        return NextResponse.json(
          { error: "댓글을 불러올 수 없습니다." },
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

/** POST: 청원 댓글 작성 (대법관 전용) */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "petition id required" }, { status: 400 });
    }

    // 대법관 세션 확인
    const cookieStore = await cookies();
    const operatorSession = cookieStore.get("operator_session");
    const isOperator = operatorSession?.value === "authenticated";

    if (!isOperator) {
      return NextResponse.json({ error: "대법관만 답변할 수 있습니다." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as { content?: string } | null;
    const content = typeof body?.content === "string" ? body.content.trim() : "";

    if (content.length === 0) {
      return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
    }
    if (content.length > 2000) {
      return NextResponse.json({ error: "내용이 너무 깁니다 (최대 2000자)" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("petition_comments")
      .insert({
        petition_id: id,
        content,
        is_operator: true,
      })
      .select("id, content, created_at, is_operator")
      .single();

    if (error) {
      if (isRlsError(error)) {
        return NextResponse.json(
          { error: "답변을 등록할 수 없습니다." },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 청원 상태를 '답변 완료'로 변경
    await supabase
      .from("petitions")
      .update({ status: "completed" })
      .eq("id", id);

    return NextResponse.json({ comment: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
