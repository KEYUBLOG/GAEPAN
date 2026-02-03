import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

type TargetType = "post" | "comment";

function isRlsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /row-level security|policy|RLS/i.test(msg);
}

/** IP 추출 */
function getIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

// 신고 요청: 단순히 신고 내역만 저장 (Supabase 대시보드에서 확인)
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { target_type?: TargetType; target_id?: string; reason?: string }
      | null;

    if (!body || (body.target_type !== "post" && body.target_type !== "comment") || !body.target_id) {
      console.error("[POST /api/reports] Invalid body:", body);
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const ip = getIp(request);
    console.log("[POST /api/reports] 신고 접수 시도:", {
      target_type: body.target_type,
      target_id: body.target_id,
      reason: body.reason,
      ip,
    });

    const supabase = createSupabaseServerClient();
    const table = body.target_type === "post" ? "posts" : "comments";

    const { data: target, error: fetchError } = await supabase
      .from(table)
      .select("id")
      .eq("id", body.target_id)
      .single();

    if (fetchError || !target) {
      console.error("[POST /api/reports] Target fetch error:", fetchError);
      if (isRlsError(fetchError)) {
        return NextResponse.json(
          { error: "대상을 찾을 수 없습니다. RLS 설정을 확인해 주세요." },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // reports 테이블에 실제로 존재하는 필드만 사용
    const insertPayload = {
      target_type: body.target_type,
      target_id: body.target_id,
      reason: body.reason ?? null,
      ai_decision: null,
    };

    console.log("[POST /api/reports] Insert payload:", insertPayload);
    console.log("[POST /api/reports] IP (로그용):", ip);

    const { data: insertedData, error: insertErr } = await supabase
      .from("reports")
      .insert(insertPayload)
      .select();

    if (insertErr) {
      console.error("[POST /api/reports] Insert error:", insertErr);
      console.error("[POST /api/reports] Insert error details:", JSON.stringify(insertErr, null, 2));
      if (isRlsError(insertErr)) {
        return NextResponse.json(
          { error: "신고 접수에 실패했습니다. reports 테이블 RLS 설정을 확인해 주세요." },
          { status: 403 },
        );
      }
      return NextResponse.json(
        { error: insertErr.message || "신고 접수에 실패했습니다." },
        { status: 500 },
      );
    }

    console.log("[POST /api/reports] 신고 접수 성공:", insertedData);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[POST /api/reports] Unexpected error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

