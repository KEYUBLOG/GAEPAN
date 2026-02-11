import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getIp } from "@/lib/request-utils";
import { isBlockedIp } from "@/lib/blocked-ip";

export const runtime = "nodejs";

/**
 * POST: 댓글 발도장 토글 (Upsert 방식)
 * - comment_likes 테이블: (comment_id, ip_address) 기준
 * - 이미 있으면 DELETE(취소), 없으면 INSERT(추가)
 * - 좋아요 수는 comment_likes 행 개수로 계산 (comments.likes 컬럼 직접 수정 안 함)
 *
 * Supabase 테이블/컬럼:
 * - comment_likes: id, comment_id, ip_address (unique(comment_id, ip_address) 권장)
 * - comments: id, ... (존재 여부 확인용)
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: commentId } = await params;
    if (!commentId?.trim()) {
      return NextResponse.json({ error: "Missing comment id" }, { status: 400 });
    }

    const ip = getIp(_request);

    if (await isBlockedIp(ip)) {
      return NextResponse.json(
        { error: "차단된 사용자입니다. 댓글에 발도장을 남길 수 없습니다." },
        { status: 403 },
      );
    }

    const supabase = createSupabaseServerClient();

    // 1) 댓글 존재 여부 및 작성자 IP, post_id 확인
    const { data: commentRow, error: commentErr } = await supabase
      .from("comments")
      .select("id, ip_address, post_id")
      .eq("id", commentId)
      .maybeSingle();

    if (commentErr) {
      console.error("[POST /api/comments/[id]/like] comments select:", commentErr);
      return NextResponse.json({ error: commentErr.message }, { status: 500 });
    }
    if (!commentRow) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    // 2) comment_likes에서 (comment_id, ip_address) 존재 여부
    const { data: existing, error: findErr } = await supabase
      .from("comment_likes")
      .select("id")
      .eq("comment_id", commentId)
      .eq("ip_address", ip)
      .maybeSingle();

    if (findErr) {
      console.error("[POST /api/comments/[id]/like] comment_likes select:", findErr);
      return NextResponse.json({ error: findErr.message }, { status: 500 });
    }

    // 3) 토글: 있으면 DELETE, 없으면 INSERT
    if (existing) {
      const { error: delErr } = await supabase
        .from("comment_likes")
        .delete()
        .eq("id", existing.id);

      if (delErr) {
        console.error("[POST /api/comments/[id]/like] comment_likes delete:", delErr);
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }
    } else {
      const { error: insErr } = await supabase.from("comment_likes").insert({
        comment_id: commentId,
        ip_address: ip,
      });

      if (insErr) {
        console.error("[POST /api/comments/[id]/like] comment_likes insert:", insErr);
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    // 4) 좋아요 수 = comment_likes 행 개수 (data.length 사용, count 헤더 의존 제거)
    const { data: likeRows, error: countErr } = await supabase
      .from("comment_likes")
      .select("id")
      .eq("comment_id", commentId);

    if (countErr) {
      console.error("[POST /api/comments/[id]/like] comment_likes count select:", countErr);
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }

    const likes = Array.isArray(likeRows) ? Math.max(0, likeRows.length) : 0;
    const liked = !existing;

    return NextResponse.json({ likes, liked });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[POST /api/comments/[id]/like] catch:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
