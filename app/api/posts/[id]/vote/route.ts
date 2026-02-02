import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

function isRlsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /row-level security|policy|RLS/i.test(msg);
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing post id" }, { status: 400 });
    }

    let body: { type?: string; previousVote?: string | null } = {};
    try {
      body = (await _request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const type = body.type;
    if (type !== "guilty" && type !== "not_guilty") {
      return NextResponse.json(
        { error: "Body must include type: 'guilty' or 'not_guilty'" },
        { status: 400 }
      );
    }

    const previousVote =
      body.previousVote === "guilty" || body.previousVote === "not_guilty"
        ? body.previousVote
        : null;

    const supabase = createSupabaseServerClient();
    const { data: row, error: fetchError } = await supabase
      .from("posts")
      .select("guilty, not_guilty")
      .eq("id", id)
      .single();

    if (fetchError || !row) {
      if (isRlsError(fetchError)) {
        return NextResponse.json(
          { error: "데이터를 불러올 수 없습니다. RLS 설정을 확인해 주세요." },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404 }
      );
    }

    let currentGuilty = Math.max(0, Number(row.guilty) || 0);
    let currentNotGuilty = Math.max(0, Number(row.not_guilty) || 0);

    // 취소: 같은 버튼 다시 클릭 -> 해당 값 -1
    if (previousVote === type) {
      if (type === "guilty") currentGuilty = Math.max(0, currentGuilty - 1);
      else currentNotGuilty = Math.max(0, currentNotGuilty - 1);
    }
    // 변경: 다른 버튼 클릭 -> 이전 -1, 새로 +1
    else if (previousVote) {
      if (previousVote === "guilty") currentGuilty = Math.max(0, currentGuilty - 1);
      else currentNotGuilty = Math.max(0, currentNotGuilty - 1);
      if (type === "guilty") currentGuilty += 1;
      else currentNotGuilty += 1;
    }
    // 신규: +1
    else {
      if (type === "guilty") currentGuilty += 1;
      else currentNotGuilty += 1;
    }

    const { error: updateError } = await supabase
      .from("posts")
      .update({ guilty: currentGuilty, not_guilty: currentNotGuilty })
      .eq("id", id);

    if (updateError) {
      if (isRlsError(updateError)) {
        return NextResponse.json(
          { error: "투표를 반영할 수 없습니다. RLS 설정을 확인해 주세요." },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      guilty: currentGuilty,
      not_guilty: currentNotGuilty,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
