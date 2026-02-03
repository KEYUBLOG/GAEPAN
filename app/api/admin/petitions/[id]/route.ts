import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export const runtime = "nodejs";

async function isOperatorLoggedIn(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("operator_session");
    return session?.value === "authenticated";
  } catch {
    return false;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 대법관 확인
    if (!(await isOperatorLoggedIn())) {
      return NextResponse.json({ error: "대법관 권한이 필요합니다." }, { status: 403 });
    }

    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "petition id required" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    
    // 관련 데이터 삭제
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

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
