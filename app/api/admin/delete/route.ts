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

export async function DELETE(request: Request) {
  try {
    // 대법관 확인
    if (!(await isOperatorLoggedIn())) {
      return NextResponse.json({ error: "대법관 권한이 필요합니다." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // "post" or "comment"
    const id = searchParams.get("id");

    if (!type || !id || (type !== "post" && type !== "comment")) {
      return NextResponse.json({ error: "type(post/comment)와 id가 필요합니다." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();

    if (type === "post") {
      // 관련 댓글, 투표, 신고 삭제
      await supabase.from("comments").delete().eq("post_id", id);
      await supabase.from("votes").delete().eq("post_id", id);
      await supabase.from("vote_events").delete().eq("post_id", id);
      await supabase.from("reports").delete().eq("target_id", id).eq("target_type", "post");
      
      const { error } = await supabase.from("posts").delete().eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (type === "comment") {
      // 관련 신고 삭제
      await supabase.from("reports").delete().eq("target_id", id).eq("target_type", "comment");
      
      const { error } = await supabase.from("comments").delete().eq("id", id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
