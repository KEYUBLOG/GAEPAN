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

type BlockedIpRow = {
  ip_address: string;
  created_at: string;
};

export async function GET() {
  try {
    if (!(await isOperatorLoggedIn())) {
      return NextResponse.json({ error: "대법관 권한이 필요합니다." }, { status: 403 });
    }

    const supabase = createSupabaseServiceRoleClient() ?? createSupabaseServerClient();

    const { data, error } = await supabase
      .from("blocked_ips")
      .select("ip_address, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as BlockedIpRow[];

    const results: Array<{
      ip_address: string;
      created_at: string;
      posts: Array<{ id: string; title: string | null; created_at: string | null }>;
    }> = [];

    for (const row of rows) {
      const { data: postsData } = await supabase
        .from("posts")
        .select("id, title, created_at")
        .eq("ip_address", row.ip_address)
        .order("created_at", { ascending: false })
        .limit(5);

      const posts = (postsData ?? []).map((p) => ({
        id: String((p as any).id),
        title: ((p as any).title as string | null) ?? null,
        created_at: ((p as any).created_at as string | null) ?? null,
      }));

      results.push({
        ip_address: row.ip_address,
        created_at: row.created_at,
        posts,
      });
    }

    return NextResponse.json({ blocked: results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await isOperatorLoggedIn())) {
      return NextResponse.json({ error: "대법관 권한이 필요합니다." }, { status: 403 });
    }

    let body: { ip_address?: string } = {};
    try {
      body = (await request.json()) as { ip_address?: string };
    } catch {
      // ignore
    }

    const ip = body.ip_address?.trim();
    if (!ip) {
      return NextResponse.json({ error: "ip_address가 필요합니다." }, { status: 400 });
    }

    const supabase = createSupabaseServiceRoleClient() ?? createSupabaseServerClient();
    const { error } = await supabase.from("blocked_ips").delete().eq("ip_address", ip);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

