import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

async function checkOperatorAuth(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("operator_session");
    return session?.value === "authenticated";
  } catch {
    return false;
  }
}

/** 대법관 확인완료: 해당 신고를 삭제해 목록에서 제거 */
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const isOperator = await checkOperatorAuth();
    if (!isOperator) {
      return NextResponse.json({ error: "대법관 권한이 필요합니다." }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "신고 ID가 필요합니다." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("reports").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
