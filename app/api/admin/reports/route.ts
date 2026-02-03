import { NextResponse } from "next/server";
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

export async function GET() {
  try {
    const isOperator = await checkOperatorAuth();
    if (!isOperator) {
      return NextResponse.json({ error: "대법관 권한이 필요합니다." }, { status: 403 });
    }

    const supabase = createSupabaseServerClient();

    // 신고된 글과 댓글 조회
    const { data: reports, error } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 각 신고에 대해 실제 게시글/댓글 정보 가져오기
    const reportsWithDetails = await Promise.all(
      (reports || []).map(async (report) => {
        try {
          if (report.target_type === "post") {
            const { data: post, error: postError } = await supabase
              .from("posts")
              .select("id, title, content, created_at, author_id")
              .eq("id", report.target_id)
              .maybeSingle();
            if (postError) {
              console.error(`[Admin Reports] Post fetch error for ${report.target_id}:`, postError);
            }
            return { ...report, target: post ?? null };
          } else {
            const { data: comment, error: commentError } = await supabase
              .from("comments")
              .select("id, content, created_at, post_id, author_id")
              .eq("id", report.target_id)
              .maybeSingle();
            if (commentError) {
              console.error(`[Admin Reports] Comment fetch error for ${report.target_id}:`, commentError);
            }
            // 댓글이 속한 게시글 정보도 가져오기
            let postTitle = null;
            if (comment?.post_id) {
              const { data: post } = await supabase
                .from("posts")
                .select("id, title")
                .eq("id", comment.post_id)
                .maybeSingle();
              postTitle = post?.title ?? null;
            }
            return { ...report, target: comment ?? null, post_title: postTitle };
          }
        } catch (err) {
          console.error(`[Admin Reports] Error processing report ${report.id}:`, err);
          return { ...report, target: null };
        }
      })
    );

    return NextResponse.json({ reports: reportsWithDetails });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
