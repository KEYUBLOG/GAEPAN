/**
 * 조회수 API (IP당 1회)
 *
 * PGRST204 "Could not find the 'ip_address' column" → post_views에 컬럼이 없음.
 * Supabase SQL Editor에서 README.md의 post_views 항목(ip_address 추가 SQL) 실행.
 *
 * 로컬/프록시 미설정 시 IP가 없으면 기록을 안 해서 조회수가 0으로 남음.
 * 개발 환경에서는 fallback IP를 써서 최소 1회는 기록되도록 함.
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

function getClientIp(request: Request): string {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "";
  // 로컬 개발 등에서 IP 헤더가 없으면 조회 기록이 전혀 안 됨. 개발 시에만 fallback 사용.
  if (!ip && process.env.NODE_ENV === "development") {
    return "dev-127.0.0.1";
  }
  return ip || "unknown";
}

/** GET: 해당 게시글 조회수 (IP당 1회로 집계된 수) */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: postId } = await params;
    if (!postId?.trim()) {
      return NextResponse.json({ count: 0 }, { status: 200 });
    }
    const supabase = createSupabaseServerClient();
    const { count, error } = await supabase
      .from("post_views")
      .select("id", { count: "exact", head: true })
      .eq("post_id", postId);
    if (error) {
      console.error("[post_views] count error:", error);
      return NextResponse.json({ count: 0 }, { status: 200 });
    }
    return NextResponse.json({ count: count ?? 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[post_views] GET error:", msg);
    return NextResponse.json({ count: 0 }, { status: 200 });
  }
}

/** POST: 조회 기록 (동일 IP·동일 게시글은 1회만 카운트) */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: postId } = await params;
    if (!postId?.trim()) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const ip = getClientIp(request);
    if (!ip || ip === "unknown") {
      return NextResponse.json({ ok: true, recorded: false });
    }
    const supabase = createSupabaseServerClient();
    const row: Record<string, string> = { post_id: postId, ip_address: ip, viewer_key: ip };
    const { error } = await supabase.from("post_views").upsert(
      row,
      { onConflict: "post_id,ip_address", ignoreDuplicates: true },
    );
    if (error) {
      console.error("[post_views] upsert error:", error.message, error.code);
      return NextResponse.json(
        { ok: false, recorded: false, error: error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, recorded: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[post_views] POST error:", msg);
    return NextResponse.json(
      { ok: false, recorded: false, error: msg },
      { status: 500 },
    );
  }
}
