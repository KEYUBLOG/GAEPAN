import { NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase";
import { containsBlockedKeyword, maskBlockedKeywords } from "@/lib/blocked-keywords";
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

async function isBlockedIp(ip: string) {
  if (!ip || ip === "unknown") return false;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("blocked_ips")
    .select("id")
    .eq("ip_address", ip)
    .maybeSingle();
  if (error) {
    console.error("[GAEPAN] blocked_ips check error (comments):", error);
    return false;
  }
  return !!data;
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

    // 게시글 작성자 IP (작성자 표시용, 클라이언트에는 노출하지 않음)
    const { data: postRow } = await supabase
      .from("posts")
      .select("ip_address")
      .eq("id", postId)
      .maybeSingle();
    const postAuthorIp = (postRow as { ip_address?: string | null } | null)?.ip_address ?? null;

    const { data, error } = await supabase
      .from("comments")
      .select("id, content, created_at, parent_id, is_hidden, author_id, is_operator, ip_address")
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

    const commentsRaw = (data ?? []) as Array<{ id: string; content?: string; created_at?: string; parent_id?: string | null; is_hidden?: boolean; author_id?: string | null; ip_address?: string | null; is_operator?: boolean }>;

    // 차단된 IP 목록 조회 후 해당 IP가 작성한 댓글은 숨김 처리
    const { data: blockedRows } = await supabase
      .from("blocked_ips")
      .select("ip_address");
    const blockedSet = new Set(
      (blockedRows ?? [])
        .map((r) => (r as { ip_address?: string | null }).ip_address)
        .filter((ip): ip is string => typeof ip === "string" && ip.length > 0),
    );

    const comments = commentsRaw.filter(
      (c) => !c.ip_address || !blockedSet.has(String(c.ip_address)),
    );

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

    const { data: keywordRows } = await supabase.from("blocked_keywords").select("keyword");
    const blockedKeywords = ((keywordRows ?? []) as { keyword: string }[]).map((r) => r.keyword).filter(Boolean);

    const commentsWithLikes = comments.map((c) => {
      const isPostAuthor = !!(
        postAuthorIp &&
        c.ip_address &&
        String(c.ip_address) === String(postAuthorIp)
      );
      const rawContent = c.content ?? "";
      const content = blockedKeywords.length > 0 ? maskBlockedKeywords(rawContent, blockedKeywords) : rawContent;
      return {
        id: c.id,
        content,
        created_at: c.created_at,
        parent_id: c.parent_id,
        author_id: c.author_id,
        is_operator: c.is_operator === true,
        is_post_author: isPostAuthor,
        ip_address: c.ip_address ?? null,
        likes: likeCountByCommentId[c.id] ?? 0,
      };
    });

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

    if (await isBlockedIp(ip)) {
      return NextResponse.json(
        { error: "차단된 사용자입니다. 댓글을 작성할 수 없습니다." },
        { status: 403 },
      );
    }
    const supabaseForKeywords = createSupabaseServerClient();
    const { data: keywordRows } = await supabaseForKeywords.from("blocked_keywords").select("keyword");
    const blockedKeywords = ((keywordRows ?? []) as { keyword: string }[]).map((r) => r.keyword).filter(Boolean);
    if (blockedKeywords.length > 0 && containsBlockedKeyword(content, blockedKeywords)) {
      return NextResponse.json(
        { error: "차단된 키워드가 포함되어 있습니다. 내용을 수정해 주세요." },
        { status: 400 },
      );
    }
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

    // 글 작성자 IP는 알림용으로 service role로 조회 (RLS로 가려질 수 있음)
    const supabaseForNotif = createSupabaseServiceRoleClient() ?? supabase;
    const { data: postRow, error: postRowError } = await supabaseForNotif
      .from("posts")
      .select("ip_address, title")
      .eq("id", postId)
      .maybeSingle();
    if (postRowError) {
      console.error("[GAEPAN] 알림용 posts 조회 실패:", postRowError.message, { postId });
    }
    const row = postRow as { ip_address?: string | null; ipAddress?: string | null; title?: string | null } | null;
    const postAuthorIp = row?.ip_address ?? row?.ipAddress ?? null;
    const postTitle = row?.title ?? null;
    const isPostAuthor = !!(postAuthorIp && data?.ip_address && String(data.ip_address) === String(postAuthorIp));

    // 알림: 본인 글이 아닐 때 글 작성자에게 댓글 알림 / 대댓글일 때 부모 댓글 작성자에게 알림
    if (data?.id) {
      if (!parentId) {
        if (!postAuthorIp) {
          console.warn("[GAEPAN] 알림 스킵: 글 작성자 IP 없음 (post_id=" + postId + "). posts.ip_address 확인.");
        } else if (String(postAuthorIp) !== String(ip)) {
          const { error: notifErr } = await supabaseForNotif.from("notifications").insert({
            recipient_ip: postAuthorIp,
            type: "comment_on_post",
            post_id: postId,
            comment_id: data.id,
            actor_display: "누군가",
            payload: { post_title: postTitle },
          });
          if (notifErr) {
            console.error("[GAEPAN] notifications insert (comment_on_post) failed:", notifErr.message, { postId, recipient_ip: postAuthorIp });
          }
        }
      } else {
        const { data: parentRow } = await supabaseForNotif
          .from("comments")
          .select("ip_address")
          .eq("id", parentId)
          .maybeSingle();
        const pr = parentRow as { ip_address?: string | null; ipAddress?: string | null } | null;
        const parentAuthorIp = pr?.ip_address ?? pr?.ipAddress ?? null;
        if (parentAuthorIp && String(parentAuthorIp) !== String(ip)) {
          const { error: notifErr } = await supabaseForNotif.from("notifications").insert({
            recipient_ip: parentAuthorIp,
            type: "reply_on_comment",
            post_id: postId,
            comment_id: data.id,
            actor_display: "누군가",
            payload: { post_title: postTitle },
          });
          if (notifErr) {
            console.error("[GAEPAN] notifications insert (reply_on_comment) failed:", notifErr.message, { postId, recipient_ip: parentAuthorIp });
          }
        }
      }
    }

    const comment = data
      ? {
          id: data.id,
          content: data.content,
          created_at: data.created_at,
          parent_id: data.parent_id,
          author_id: data.author_id,
          is_operator: data.is_operator === true,
          is_post_author: isPostAuthor,
          ip_address: data.ip_address ?? null,
          likes: 0,
        }
      : data;
    return NextResponse.json({ comment });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
