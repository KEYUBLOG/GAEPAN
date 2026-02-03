import { NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export const runtime = "nodejs";

function hashPassword(pw: string): string {
  return crypto.createHash("sha256").update(pw).digest("hex");
}

function isRlsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /row-level security|policy|RLS/i.test(msg);
}

function getIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** GET: 해당 기소장(post)의 배심원 한마디 목록 + 현재 IP 기준 발도장한 댓글 ID 목록 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    if (!postId?.trim()) {
      return NextResponse.json({ error: "post id required" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("comments")
      .select("id, content, created_at, parent_id, is_hidden, author_id, is_operator")
      .eq("post_id", postId)
      .neq("is_hidden", true)
      .order("created_at", { ascending: true });

    if (error) {
      if (isRlsError(error)) {
        return NextResponse.json(
          { error: "댓글을 불러올 수 없습니다. RLS 설정을 확인해 주세요." },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const comments = (data ?? []) as Array<{ id: string; content?: string; created_at?: string; parent_id?: string | null; is_hidden?: boolean; author_id?: string | null; ip_address?: string | null; is_operator?: boolean }>;
    const commentIds = comments.map((c) => c.id).filter(Boolean);

    // comment_likes에서 댓글별 좋아요 수 계산 (comments.likes 컬럼 미사용)
    const likeCountByCommentId: Record<string, number> = {};
    let likedCommentIds: string[] = [];
    if (commentIds.length > 0) {
      const ip = getIp(request);
      const { data: likeRows } = await supabase
        .from("comment_likes")
        .select("comment_id")
        .in("comment_id", commentIds);
      const allLikeRows = likeRows ?? [];
      for (const id of commentIds) likeCountByCommentId[id] = 0;
      for (const r of allLikeRows) {
        const cid = String((r as { comment_id: string }).comment_id);
        likeCountByCommentId[cid] = (likeCountByCommentId[cid] ?? 0) + 1;
      }
      const { data: myLikeRows } = await supabase
        .from("comment_likes")
        .select("comment_id")
        .eq("ip_address", ip)
        .in("comment_id", commentIds);
      likedCommentIds = (myLikeRows ?? []).map((r: { comment_id: string }) => String(r.comment_id));
    }

    const commentsWithLikes = comments.map((c) => ({
      ...c,
      likes: likeCountByCommentId[c.id] ?? 0,
      is_operator: c.is_operator === true, // DB에 저장된 is_operator 플래그 사용
    }));

    return NextResponse.json({ comments: commentsWithLikes, likedCommentIds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST: 배심원 한마디 작성 (parent_id 있으면 대댓글). 로그인 불필요, IP 기반(비로그인) 허용 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    if (!postId?.trim()) {
      return NextResponse.json({ error: "post id required" }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as { content?: string; parent_id?: string | null; password?: string } | null;
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (content.length === 0) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }
    if (content.length > 2000) {
      return NextResponse.json({ error: "content too long (max 2000)" }, { status: 400 });
    }

    const rawPassword = typeof body?.password === "string" ? body.password.trim() : "";
    if (rawPassword.length === 0) {
      return NextResponse.json({ error: "삭제 비밀번호를 입력해 주세요." }, { status: 400 });
    }
    if (rawPassword.length > 20) {
      return NextResponse.json({ error: "삭제 비밀번호는 20자 이내로 입력해 주세요." }, { status: 400 });
    }

    const parentId = typeof body?.parent_id === "string" && body.parent_id.trim() ? body.parent_id.trim() : null;
    const ip = getIp(request);
    const passwordHash = hashPassword(rawPassword);

    // 운영자 세션 확인
    const cookieStore = await cookies();
    const operatorSession = cookieStore.get("operator_session");
    const isOperator = operatorSession?.value === "authenticated";

    const supabase = createSupabaseServerClient();
    const insertPayload: { post_id: string; content: string; parent_id?: string; ip_address?: string; is_operator?: boolean; delete_password?: string } = {
      post_id: postId,
      content,
      ip_address: ip,
      is_operator: isOperator,
      delete_password: passwordHash,
    };
    if (parentId) insertPayload.parent_id = parentId;

    const { data, error } = await supabase
      .from("comments")
      .insert(insertPayload)
      .select("id, content, created_at, parent_id, author_id, ip_address, is_operator")
      .single();

    if (error) {
      if (isRlsError(error)) {
        return NextResponse.json(
          { error: "댓글을 등록할 수 없습니다. RLS 설정을 확인해 주세요." },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const comment = data ? { ...data, likes: 0 } : data;
    return NextResponse.json({ comment });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

