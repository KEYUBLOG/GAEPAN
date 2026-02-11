import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getIp } from "@/lib/request-utils";

export const runtime = "nodejs";

/** GET: 청원 상세 조회 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "petition id required" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("petitions")
      .select("id, title, content, category, created_at, agree_count, response_threshold, status")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "청원을 찾을 수 없습니다." }, { status: 404 });
    }

    // 답변 달성률 계산
    const progress = data.response_threshold > 0
      ? Math.min(100, Math.round((data.agree_count / data.response_threshold) * 100))
      : 0;

    // 현재 IP가 이미 동의했는지 확인
    const ip = getIp(request);
    const { data: agreeData } = await supabase
      .from("petition_agrees")
      .select("id")
      .eq("petition_id", id)
      .eq("ip_address", ip)
      .single();

    return NextResponse.json({
      petition: {
        ...data,
        progress,
        hasAgreed: !!agreeData,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE: 청원 삭제 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "petition id required" }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as { password?: string } | null;
    const password = typeof body?.password === "string" ? body.password.trim() : "";

    if (!password) {
      return NextResponse.json({ error: "비밀번호를 입력해주세요." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    
    // 청원 조회 및 비밀번호 확인
    const { data: petition, error: fetchError } = await supabase
      .from("petitions")
      .select("id, password")
      .eq("id", id)
      .single();

    if (fetchError || !petition) {
      return NextResponse.json({ error: "청원을 찾을 수 없습니다." }, { status: 404 });
    }

    // 비밀번호 확인
    if (petition.password !== password) {
      return NextResponse.json({ error: "비밀번호가 일치하지 않습니다." }, { status: 401 });
    }

    // 관련 데이터 삭제 (petition_agrees, petition_comments)
    await supabase.from("petition_agrees").delete().eq("petition_id", id);
    await supabase.from("petition_comments").delete().eq("petition_id", id);

    // 청원 삭제
    const { error: deleteError } = await supabase
      .from("petitions")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
