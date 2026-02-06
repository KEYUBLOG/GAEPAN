import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

function getIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function isBlockedIp(ip: string) {
  if (!ip || ip === "unknown") return false;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("blocked_ips")
    .select("id")
    .eq("ip_address", ip)
    .maybeSingle();
  if (error) {
    console.error("[GAEPAN] blocked_ips check error (post like):", error);
    return false;
  }
  return !!data;
}

/** POST: 판결문(게시글) 발도장 토글. 한 사람(IP)당 1회만 가능, 재클릭 시 취소 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    if (!postId?.trim()) {
      return NextResponse.json({ error: "Missing post id" }, { status: 400 });
    }

    const ip = getIp(request);

    if (await isBlockedIp(ip)) {
      return NextResponse.json(
        { error: "차단된 사용자입니다. 발도장을 남길 수 없습니다." },
        { status: 403 },
      );
    }

    const supabase = createSupabaseServerClient();

    const { data: existing, error: findErr } = await supabase
      .from("likes")
      .select("id")
      .eq("target_type", "post")
      .eq("target_id", postId)
      .eq("ip_address", ip)
      .maybeSingle();

    if (findErr) {
      return NextResponse.json({ error: findErr.message }, { status: 500 });
    }

    const { data: row, error: postErr } = await supabase
      .from("posts")
      .select("likes")
      .eq("id", postId)
      .single();

    if (postErr || !row) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const currentLikes = Number(row.likes) ?? 0;
    let newLikes: number;
    let liked: boolean;

    if (existing) {
      const { error: delErr } = await supabase
        .from("likes")
        .delete()
        .eq("id", existing.id);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }
      newLikes = Math.max(0, currentLikes - 1);
      liked = false;
    } else {
      const { error: insErr } = await supabase.from("likes").insert({
        ip_address: ip,
        target_type: "post",
        target_id: postId,
      });
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
      newLikes = currentLikes + 1;
      liked = true;
    }

    const { error: updateErr } = await supabase
      .from("posts")
      .update({ likes: newLikes })
      .eq("id", postId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ likes: newLikes, liked });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
