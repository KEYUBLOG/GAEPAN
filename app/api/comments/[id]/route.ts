import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { hashPassword } from "@/lib/password";

export const runtime = "nodejs";

/** DELETE: 댓글/대댓글 삭제 (작성 시 입력한 삭제 비밀번호로만 삭제 가능) */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: commentId } = await params;
    if (!commentId?.trim()) {
      return NextResponse.json({ ok: false, error: "comment id required" }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as { password?: string } | null;
    const rawPassword = typeof body?.password === "string" ? body.password.trim() : "";
    if (!rawPassword) {
      return NextResponse.json(
        { ok: false, error: "비밀번호를 입력해 주세요." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { data: comment, error: selectErr } = await supabase
      .from("comments")
      .select("id, delete_password")
      .eq("id", commentId)
      .maybeSingle();

    if (selectErr) {
      return NextResponse.json({ ok: false, error: selectErr.message }, { status: 500 });
    }
    if (!comment) {
      return NextResponse.json({ ok: false, error: "존재하지 않는 댓글입니다." }, { status: 404 });
    }

    // 기존 댓글(delete_password 없음)은 비밀번호 없이 삭제 불가 → 비밀번호 불일치로 처리
    const storedHash = (comment as { delete_password?: string | null }).delete_password;
    if (!storedHash) {
      return NextResponse.json(
        { ok: false, error: "삭제 비밀번호가 설정되지 않은 댓글입니다. 대법관에게 삭제 요청해 주세요." },
        { status: 400 },
      );
    }

    const passwordHash = hashPassword(rawPassword);
    if (storedHash !== passwordHash) {
      return NextResponse.json(
        { ok: false, error: "비밀번호가 올바르지 않습니다." },
        { status: 403 },
      );
    }

    const { error: delErr } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId);

    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
