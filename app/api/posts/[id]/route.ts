import { NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

function hashPassword(pw: string): string {
  return crypto.createHash("sha256").update(pw).digest("hex");
}

/** DELETE: 판결문 삭제 (기소 시 설정한 비밀번호로만 삭제 가능) */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: postId } = await params;
    if (!postId?.trim()) {
      return NextResponse.json({ ok: false, error: "post id required" }, { status: 400 });
    }

    const body = (await request.json().catch((e) => {
      console.error("[DELETE /api/posts/[id]] request.json error:", e);
      return null;
    })) as { password?: string } | null;
    const rawPassword =
      typeof body?.password === "string" ? body.password.trim() : "";

    if (!rawPassword) {
      return NextResponse.json(
        { ok: false, error: "비밀번호를 입력해 주세요." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();

    const { data: post, error: selectErr } = await supabase
      .from("posts")
      .select("id, delete_password")
      .eq("id", postId)
      .maybeSingle();

    if (selectErr) {
      console.error("[DELETE /api/posts/[id]] select error:", selectErr);
      return NextResponse.json({ ok: false, error: selectErr.message }, { status: 500 });
    }

    if (!post) {
      return NextResponse.json({ ok: false, error: "존재하지 않는 판결문입니다." }, { status: 404 });
    }

    if (!post.delete_password) {
      return NextResponse.json(
        { ok: false, error: "삭제 비밀번호가 설정되지 않은 판결문입니다." },
        { status: 400 },
      );
    }

    const passwordHash = hashPassword(rawPassword);
    if (post.delete_password !== passwordHash) {
      return NextResponse.json(
        { ok: false, error: "비밀번호가 올바르지 않습니다." },
        { status: 403 },
      );
    }

    const { error: delErr } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId);

    if (delErr) {
      console.error("[DELETE /api/posts/[id]] delete error:", delErr);
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[DELETE /api/posts/[id]] catch:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

