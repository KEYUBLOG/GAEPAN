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
    console.error("[GAEPAN] blocked_ips check error (petition agree):", error);
    return false;
  }
  return !!data;
}

/** POST: 청원 동의하기 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "petition id required" }, { status: 400 });
    }

    const ip = getIp(request);

    if (await isBlockedIp(ip)) {
      return NextResponse.json(
        { error: "차단된 사용자입니다. 청원에 동의할 수 없습니다." },
        { status: 403 },
      );
    }

    const supabase = createSupabaseServerClient();

    // 이미 동의했는지 확인
    const { data: existing } = await supabase
      .from("petition_agrees")
      .select("id")
      .eq("petition_id", id)
      .eq("ip_address", ip)
      .single();

    if (existing) {
      return NextResponse.json({ error: "이미 동의하셨습니다." }, { status: 400 });
    }

    // 동의 기록 추가
    const { error: agreeError } = await supabase
      .from("petition_agrees")
      .insert({
        petition_id: id,
        ip_address: ip,
      });

    if (agreeError) {
      return NextResponse.json({ error: agreeError.message }, { status: 500 });
    }

    // 동의 수 증가
    const { data: petition } = await supabase
      .from("petitions")
      .select("agree_count, response_threshold")
      .eq("id", id)
      .single();

    if (petition) {
      const newCount = (petition.agree_count || 0) + 1;
      await supabase
        .from("petitions")
        .update({ agree_count: newCount })
        .eq("id", id);

      // 50개 이상이면 황금 테두리 표시를 위한 플래그 (프론트엔드에서 계산)
      return NextResponse.json({
        success: true,
        agreeCount: newCount,
        isHighlighted: newCount >= 50,
      });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
