import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getIp } from "@/lib/request-utils";

export const runtime = "nodejs";

/** GET: 현재 IP가 좋아요(발도장)한 글 ID·댓글 ID 목록 */
export async function GET(request: Request) {
  try {
    const ip = getIp(request);
    const supabase = createSupabaseServerClient();

    const { data: rows, error } = await supabase
      .from("likes")
      .select("target_type, target_id")
      .eq("ip_address", ip);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const postIds: string[] = [];
    const commentIds: string[] = [];
    for (const r of rows ?? []) {
      const id = String(r.target_id ?? "");
      if (r.target_type === "post" && id) postIds.push(id);
      if (r.target_type === "comment" && id) commentIds.push(id);
    }

    return NextResponse.json({ postIds, commentIds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
