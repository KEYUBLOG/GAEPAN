import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/** GET: 여러 post_id에 대한 댓글 수 (is_hidden 아닌 것만). query: ids=id1,id2,id3 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");
    if (!idsParam?.trim()) {
      return NextResponse.json({ counts: {} }, { status: 200 });
    }
    const ids = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (ids.length === 0) {
      return NextResponse.json({ counts: {} }, { status: 200 });
    }
    if (ids.length > 200) {
      return NextResponse.json({ error: "Too many ids" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("comments")
      .select("post_id")
      .in("post_id", ids)
      .neq("is_hidden", true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const counts: Record<string, number> = {};
    for (const id of ids) counts[id] = 0;
    for (const row of (data ?? []) as { post_id: string }[]) {
      if (row.post_id && ids.includes(row.post_id)) {
        counts[row.post_id] = (counts[row.post_id] ?? 0) + 1;
      }
    }
    return NextResponse.json({ counts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
