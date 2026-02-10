import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase";
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

type BlockBody = {
  targetType?: "post" | "comment";
  id?: string;
};

export async function POST(request: Request) {
  try {
    if (!(await isOperatorLoggedIn())) {
      return NextResponse.json({ error: "대법관 권한이 필요합니다." }, { status: 403 });
    }

    let body: BlockBody = {};
    try {
      body = (await request.json()) as BlockBody;
    } catch {
      // ignore, treat as empty
    }

    const targetType = body.targetType;
    const id = body.id?.trim();

    if (!targetType || !id || (targetType !== "post" && targetType !== "comment")) {
      return NextResponse.json(
        { error: "targetType(post|comment)과 id가 필요합니다." },
        { status: 400 },
      );
    }

    // RLS를 우회해 posts/blocked_ips 접근. service role 없으면 anon 사용(RLS 정책 필요)
    const supabase = createSupabaseServiceRoleClient() ?? createSupabaseServerClient();

    // 1) 대상의 IP 찾기
    let ip: string | null = null;
    if (targetType === "post") {
      const { data, error } = await supabase
        .from("posts")
        .select("ip_address")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      ip = (data as { ip_address?: string | null } | null)?.ip_address ?? null;
    } else {
      const { data, error } = await supabase
        .from("comments")
        .select("ip_address")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      ip = (data as { ip_address?: string | null } | null)?.ip_address ?? null;
    }

    if (!ip || ip === "unknown") {
      return NextResponse.json(
        { error: "차단할 IP 정보를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 2) blocked_ips에 upsert (service role 사용 시 RLS 우회)
    const { error: upsertError } = await supabase
      .from("blocked_ips")
      .upsert(
        { ip_address: ip },
        { onConflict: "ip_address" },
      );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

