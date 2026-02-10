import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

async function isBlockedIp(ip: string) {
  if (!ip || ip === "unknown") return false;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("blocked_ips")
    .select("id")
    .eq("ip_address", ip)
    .maybeSingle();
  if (error) {
    console.error("[GAEPAN] blocked_ips check error (vote):", error);
    return false;
  }
  return !!data;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: postId } = await params;
    if (!postId?.trim()) {
      return NextResponse.json({ error: "Missing post id" }, { status: 400 });
    }

    let body: { type?: string } = {};
    try {
      body = (await request.json()) as { type?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const type = body.type;
    if (type !== "guilty" && type !== "not_guilty") {
      return NextResponse.json(
        { error: "Body must include type: 'guilty' or 'not_guilty'" },
        { status: 400 },
      );
    }

    // IP 기준 제한
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-real-ip") ||
      "unknown";

    if (await isBlockedIp(ip)) {
      return NextResponse.json(
        { error: "차단된 사용자입니다. 투표를 진행할 수 없습니다." },
        { status: 403 },
      );
    }

    const supabase = createSupabaseServerClient();

    const { data: existing, error: existingError } = await supabase
      .from("votes")
      .select("id, choice")
      .eq("post_id", postId)
      .eq("ip_address", ip)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const { data: row, error: fetchError } = await supabase
      .from("posts")
      .select("guilty, not_guilty, title, ip_address")
      .eq("id", postId)
      .single();

    if (fetchError || !row) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    let currentGuilty = Number(row.guilty) || 0;
    let currentNotGuilty = Number(row.not_guilty) || 0;

    let nextChoice: "guilty" | "not_guilty" | null = type;

    if (!existing) {
      // 최초 투표: 선택한 방향으로 +1
      if (type === "guilty") currentGuilty += 1;
      else currentNotGuilty += 1;

      const { error: insertError } = await supabase
        .from("votes")
        .insert({ post_id: postId, ip_address: ip, choice: type });
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      await supabase.from("vote_events").insert({
        post_id: postId,
        post_title: (row as { title?: string })?.title ?? null,
        vote_type: type,
        voter_display: "익명 배심원(Lv.1)",
      });
    } else if (existing.choice === type) {
      // 같은 버튼 재클릭 → 투표 취소
      if (type === "guilty" && currentGuilty > 0) currentGuilty -= 1;
      if (type === "not_guilty" && currentNotGuilty > 0) currentNotGuilty -= 1;
      nextChoice = null;

      const { error: deleteError } = await supabase
        .from("votes")
        .delete()
        .eq("id", existing.id);
      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }
    } else {
      // 다른 쪽으로 변경
      if (existing.choice === "guilty" && currentGuilty > 0) currentGuilty -= 1;
      if (existing.choice === "not_guilty" && currentNotGuilty > 0) currentNotGuilty -= 1;
      if (type === "guilty") currentGuilty += 1;
      if (type === "not_guilty") currentNotGuilty += 1;
      nextChoice = type;

      const { error: updateVoteError } = await supabase
        .from("votes")
        .update({ choice: type })
        .eq("id", existing.id);
      if (updateVoteError) {
        return NextResponse.json({ error: updateVoteError.message }, { status: 500 });
      }
      await supabase.from("vote_events").insert({
        post_id: postId,
        post_title: (row as { title?: string })?.title ?? null,
        vote_type: type,
        voter_display: "익명 배심원(Lv.1)",
      });
    }

    const { error: updateError } = await supabase
      .from("posts")
      .update({ guilty: currentGuilty, not_guilty: currentNotGuilty })
      .eq("id", postId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      guilty: currentGuilty,
      not_guilty: currentNotGuilty,
      currentVote: nextChoice,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

