import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** GET: 현재 IP(본인)가 받은 알림 목록, 최신순 (RLS 우회용 service role 사용) */
export async function GET(request: Request) {
  try {
    const ip = getIp(request);
    const supabase = createSupabaseServiceRoleClient() ?? createSupabaseServerClient();

    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, post_id, comment_id, actor_display, payload, created_at")
      .eq("recipient_ip", ip)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = (data ?? []).map((row: { id: string; type: string; post_id?: string | null; comment_id?: string | null; actor_display?: string | null; payload?: unknown; created_at: string }) => ({
      id: row.id,
      type: row.type,
      postId: row.post_id ?? null,
      commentId: row.comment_id ?? null,
      actorDisplay: row.actor_display ?? null,
      payload: row.payload ?? null,
      createdAt: row.created_at,
    }));

    return NextResponse.json({ notifications: list });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
