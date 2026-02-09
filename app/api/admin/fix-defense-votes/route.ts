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

/**
 * POST: 기존 DEFENSE 사건의 투표 방향을 ACCUSATION 기준으로 보정.
 * - posts: guilty ↔ not_guilty 스왑, trial_type → ACCUSATION
 * - votes: choice guilty ↔ not_guilty 스왑
 */
export async function POST() {
  try {
    if (!(await isOperatorLoggedIn())) {
      return NextResponse.json({ error: "대법관 권한이 필요합니다." }, { status: 403 });
    }

    const supabase = createSupabaseServerClient();

    const { data: defensePosts, error: listError } = await supabase
      .from("posts")
      .select("id, guilty, not_guilty")
      .eq("trial_type", "DEFENSE");

    if (listError) {
      console.error("[fix-defense-votes] list error:", listError);
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    if (!defensePosts?.length) {
      return NextResponse.json({ ok: true, fixed: 0, message: "DEFENSE 사건 없음" });
    }

    let fixed = 0;
    for (const post of defensePosts) {
      const postId = post.id;
      const newGuilty = Number(post.not_guilty) || 0;
      const newNotGuilty = Number(post.guilty) || 0;

      const { error: updatePostError } = await supabase
        .from("posts")
        .update({
          guilty: newGuilty,
          not_guilty: newNotGuilty,
          trial_type: "ACCUSATION",
        })
        .eq("id", postId);

      if (updatePostError) {
        console.error("[fix-defense-votes] update post error:", postId, updatePostError);
        continue;
      }
      fixed += 1;

      const { data: votes, error: votesError } = await supabase
        .from("votes")
        .select("id, choice")
        .eq("post_id", postId);

      if (votesError || !votes?.length) continue;

      for (const v of votes) {
        const newChoice = v.choice === "guilty" ? "not_guilty" : "guilty";
        await supabase.from("votes").update({ choice: newChoice }).eq("id", v.id);
      }
    }

    return NextResponse.json({ ok: true, fixed, total: defensePosts.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[fix-defense-votes] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
