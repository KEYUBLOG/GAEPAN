import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/** GET: 청원 리스트 조회 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "ongoing"; // ongoing | completed

    const supabase = createSupabaseServerClient();
    const query = supabase
      .from("petitions")
      .select("id, title, content, category, created_at, agree_count, response_threshold, status")
      .order("created_at", { ascending: false });

    if (status === "ongoing") {
      query.eq("status", "ongoing");
    } else if (status === "completed") {
      query.eq("status", "completed");
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 답변 달성률 계산
    const petitionsWithProgress = (data ?? []).map((p: any) => {
      const progress = p.response_threshold > 0 
        ? Math.min(100, Math.round((p.agree_count / p.response_threshold) * 100))
        : 0;
      return {
        ...p,
        progress,
      };
    });

    return NextResponse.json({ petitions: petitionsWithProgress });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST: 청원 작성 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as {
      title?: string;
      content?: string;
      category?: string;
      password?: string;
    } | null;

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    const category = typeof body?.category === "string" ? body.category.trim() : "";
    const password = typeof body?.password === "string" ? body.password.trim() : "";

    if (!title || title.length === 0) {
      return NextResponse.json({ error: "제목을 입력해주세요." }, { status: 400 });
    }
    if (!content || content.length === 0) {
      return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
    }
    if (!category || !["기능제안", "카테고리", "기타"].includes(category)) {
      return NextResponse.json({ error: "올바른 카테고리를 선택해주세요." }, { status: 400 });
    }
    if (!password || password.length === 0) {
      return NextResponse.json({ error: "삭제 비밀번호를 입력해주세요." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("petitions")
      .insert({
        title,
        content,
        category,
        password,
        agree_count: 0,
        response_threshold: 50, // 기본값 50
        status: "ongoing",
      })
      .select("id, title, content, category, created_at, agree_count, response_threshold, status")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ petition: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
