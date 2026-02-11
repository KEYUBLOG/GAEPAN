import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getIp, isRlsError } from "@/lib/request-utils";
import { jsonSuccess, jsonError } from "@/lib/api-response";

export const runtime = "nodejs";

type TargetType = "post" | "comment";

const MAX_REASON_LENGTH = 500;

// 신고 요청: 단순히 신고 내역만 저장 (Supabase 대시보드에서 확인)
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { target_type?: TargetType; target_id?: string; reason?: string }
      | null;

    if (!body || (body.target_type !== "post" && body.target_type !== "comment") || !body.target_id) {
      console.error("[POST /api/reports] Invalid body:", body);
      return NextResponse.json(jsonError("Invalid body"), { status: 400 });
    }

    const reason =
      typeof body.reason === "string"
        ? body.reason.trim().slice(0, MAX_REASON_LENGTH)
        : null;

    const ip = getIp(request);
    console.log("[POST /api/reports] 신고 접수 시도:", {
      target_type: body.target_type,
      target_id: body.target_id,
      reason: reason?.slice(0, 80),
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
          jsonError("대상을 찾을 수 없습니다. RLS 설정을 확인해 주세요."),
          { status: 403 },
        );
      }
      return NextResponse.json(jsonError("Not found"), { status: 404 });
    }

    // reports 테이블에 실제로 존재하는 필드만 사용 (reason 길이 제한으로 과다 입력·저장 남용 방지)
    const insertPayload = {
      target_type: body.target_type,
      target_id: body.target_id,
      reason,
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
          jsonError("신고 접수에 실패했습니다. reports 테이블 RLS 설정을 확인해 주세요."),
          { status: 403 },
        );
      }
      return NextResponse.json(
        jsonError(insertErr.message || "신고 접수에 실패했습니다."),
        { status: 500 },
      );
    }

    console.log("[POST /api/reports] 신고 접수 성공:", insertedData);

    return NextResponse.json(jsonSuccess());
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[POST /api/reports] Unexpected error:", e);
    return NextResponse.json(jsonError(msg), { status: 500 });
  }
}

