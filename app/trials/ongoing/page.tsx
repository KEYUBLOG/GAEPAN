"use client";

import React, { Suspense, useEffect, useState, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/app/components/Logo";
import { CoupangBanner } from "@/app/components/CoupangBanner";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { maskCommentIp } from "@/lib/comment";
import { useBlockedKeywords } from "@/lib/useBlockedKeywords";
import { parseImageUrls } from "@/lib/image-urls";
import { sanitizeVerdictDisplay, sanitizeCaseContentDisplay } from "@/lib/sanitize-verdict-display";

const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;

function isVotingOpen(createdAt: string | null, votingEndedAt?: string | null): boolean {
  if (votingEndedAt) return false;
  if (!createdAt) return false;
  return Date.now() < new Date(createdAt).getTime() + TRIAL_DURATION_MS;
}

function getVotingEndsAt(createdAt: string | null): number {
  if (!createdAt) return 0;
  return new Date(createdAt).getTime() + TRIAL_DURATION_MS;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "재판 종료";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function isUrgent(createdAt: string | null): boolean {
  const rem = Math.max(0, getVotingEndsAt(createdAt) - Date.now());
  return rem > 0 && rem < 3 * 60 * 60 * 1000;
}

function toRatioNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.round(Number(value));
    return n >= 0 && n <= 100 ? n : null;
  }
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n) : null;
  }
  return null;
}

type PostPreview = {
  id: string;
  title: string;
  plaintiff: string | null;
  defendant: string | null;
  content: string | null;
  verdict: string;
  verdict_rationale: string;
  ratio: number | null;
  created_at: string | null;
  guilty: number;
  not_guilty: number;
  image_url: string | null;
  author_id: string | null;
  case_number: number | null;
  category: string | null;
  trial_type: "DEFENSE" | "ACCUSATION" | null;
  voting_ended_at: string | null;
  ip_address?: string | null;
};

type Comment = {
  id: string;
  content: string;
  created_at: string | null;
  parent_id: string | null;
  author_id: string | null;
  likes: number;
  is_operator?: boolean;
  is_post_author?: boolean;
  ip_address?: string | null;
};

function OngoingTrialsContent() {
  const searchParams = useSearchParams();
  const [posts, setPosts] = useState<PostPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("전체");
  const [sort, setSort] = useState<"latest" | "votes" | "urgent">("latest");
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [selectedPost, setSelectedPost] = useState<PostPreview | null>(null);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Record<string, "guilty" | "not_guilty">>({});
  const [comments, setComments] = useState<Comment[]>([]);
  const [jurorLabels, setJurorLabels] = useState<Record<string, string>>({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [commentFormPassword, setCommentFormPassword] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [commentDeleteTargetId, setCommentDeleteTargetId] = useState<string | null>(null);
  const [commentDeletePassword, setCommentDeletePassword] = useState("");
  const [commentDeleteSubmitting, setCommentDeleteSubmitting] = useState(false);
  const [commentDeleteError, setCommentDeleteError] = useState<string | null>(null);
  const [commentSort, setCommentSort] = useState<"oldest" | "latest" | "popular">("oldest");
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const [commentMenuOpenId, setCommentMenuOpenId] = useState<string | null>(null);
  const [postMenuOpenId, setPostMenuOpenId] = useState<string | null>(null);
  const [isOperatorLoggedIn, setIsOperatorLoggedIn] = useState(false);
  const [reportTarget, setReportTarget] = useState<{
    type: "post" | "comment" | null;
    id: string | null;
  }>({ type: null, id: null });
  const [reportReason, setReportReason] = useState<string>("욕설/비하");
  const [commentCountsByPostId, setCommentCountsByPostId] = useState<Record<string, number>>({});
  const [viewCountsByPostId, setViewCountsByPostId] = useState<Record<string, number>>({});
  const [scrollToCommentsOnOpen, setScrollToCommentsOnOpen] = useState(false);
  const commentsSectionRef = useRef<HTMLDivElement | null>(null);
  const { mask: maskBlocked } = useBlockedKeywords();

  // 오늘의 개판(투표수 많은 순)
  const topOfDayPost = useMemo(() => {
    if (posts.length === 0) return null;
    const byVotes = [...posts].sort((a, b) => (b.guilty + b.not_guilty) - (a.guilty + a.not_guilty));
    return byVotes[0] ?? null;
  }, [posts]);
  const [deletePostId, setDeletePostId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [isAccuseOpen, setIsAccuseOpen] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [judgeResult, setJudgeResult] = useState<{
    mock: boolean;
    verdict: {
      title: string;
      ratio: {
        plaintiff: number;
        defendant: number;
        rationale: string;
      };
      verdict: string;
    };
  } | null>(null);
  const [createdPostId, setCreatedPostId] = useState<string | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const CATEGORY_OPTIONS = ["연애", "직장생활", "학교생활", "군대", "가족", "결혼생활", "육아", "친구", "이웃/매너", "사회이슈", "기타"] as const;
  const [form, setForm] = useState({
    title: "",
    details: "",
    password: "",
    category: "",
    trial_type: "ACCUSATION",
  });
  const MAX_IMAGES = 5;
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const firstFieldRef = React.useRef<HTMLInputElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const commentDeletePasswordRef = React.useRef<HTMLInputElement | null>(null);
  const deletePasswordRef = React.useRef<HTMLInputElement | null>(null);
  const verdictDetailRef = React.useRef<HTMLDivElement | null>(null);

  // 투표 저장/로드
  // localStorage 투표 상태를 userVotes에 동기화 (다른 페이지에서 투표한 것도 유지)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("gaepan_votes");
      const obj = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      const votes: Record<string, "guilty" | "not_guilty"> = {};
      for (const [postId, v] of Object.entries(obj)) {
        if (v === "guilty" || v === "not_guilty") votes[postId] = v;
      }
      setUserVotes(votes);
    } catch {
      // ignore
    }
  }, []);

  // URL ?post=id 로 진입 시 해당 판결문 모달 바로 열기
  useEffect(() => {
    const postId = searchParams.get("post");
    if (!postId?.trim()) return;
    const pathname = typeof window !== "undefined" ? window.location.pathname : "/trials/ongoing";
    const supabase = getSupabaseBrowserClient();
    supabase
      .from("posts")
      .select("*, verdict_rationale")
      .eq("id", postId)
      .maybeSingle()
      .then(({ data: row, error }) => {
        if (error || !row) return;
        const post: PostPreview = {
          id: String((row as any).id ?? ""),
          title: ((row as any).title as string) ?? "",
          plaintiff: ((row as any).plaintiff as string | null) ?? null,
          defendant: ((row as any).defendant as string | null) ?? null,
          content: ((row as any).content as string | null) ?? null,
          verdict: ((row as any).verdict as string) ?? "",
          verdict_rationale:
            (typeof (row as any).verdict_rationale === "string"
              ? (row as any).verdict_rationale
              : typeof (row as any).verdictRationale === "string"
                ? (row as any).verdictRationale
                : "") ?? "",
          ratio: toRatioNumber((row as any).ratio),
          created_at: ((row as any).created_at as string | null) ?? null,
          guilty: Number((row as any).guilty) || 0,
          not_guilty: Number((row as any).not_guilty) || 0,
          image_url: ((row as any).image_url as string | null) ?? null,
          author_id: ((row as any).author_id as string | null) ?? null,
          case_number: (row as any).case_number != null && Number.isFinite(Number((row as any).case_number)) ? Number((row as any).case_number) : null,
          category: ((row as any).category as string | null) ?? null,
          trial_type: ((row as any).trial_type === "DEFENSE" || (row as any).trial_type === "ACCUSATION") ? (row as any).trial_type : null,
          voting_ended_at: ((row as any).voting_ended_at as string | null) ?? null,
          ip_address: ((row as any).ip_address as string | null) ?? null,
        };
        setSelectedPost(post);
        window.history.replaceState(null, "", pathname);
      });
  }, [searchParams]);

  // 판결문 상세 모달이 열려 있을 때 배경 스크롤 잠금
  useEffect(() => {
    if (!selectedPost) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      window.scrollTo(0, scrollY);
    };
  }, [selectedPost]);

  // 게시글 로드
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const [{ data, error: listError }, { data: blockedRows }] = await Promise.all([
          supabase
            .from("posts")
            .select("*, verdict_rationale")
            .neq("status", "판결불가")
            .order("created_at", { ascending: false })
            .limit(100),
          supabase.from("blocked_ips").select("ip_address"),
        ]);

        if (listError) throw listError;

        const blockedSet = new Set(
          (blockedRows ?? [])
            .map((r) => (r as { ip_address?: string | null }).ip_address)
            .filter((ip): ip is string => typeof ip === "string" && ip.length > 0),
        );

        const toPostPreview = (row: Record<string, unknown>): PostPreview => ({
          id: String(row.id ?? ""),
          title: (row.title as string) ?? "",
          plaintiff: (row.plaintiff as string | null) ?? null,
          defendant: (row.defendant as string | null) ?? null,
          content: (row.content as string | null) ?? null,
          verdict: (row.verdict as string) ?? "",
          verdict_rationale:
            (typeof row.verdict_rationale === "string" ? row.verdict_rationale : typeof (row as Record<string, unknown>).verdictRationale === "string" ? String((row as Record<string, unknown>).verdictRationale) : "") ?? "",
          ratio: toRatioNumber(row.ratio),
          created_at: (row.created_at as string | null) ?? null,
          guilty: Number(row.guilty) || 0,
          not_guilty: Number(row.not_guilty) || 0,
          image_url: (row.image_url as string | null) ?? null,
          author_id: (row.author_id as string | null) ?? null,
          case_number:
            row.case_number != null && Number.isFinite(Number(row.case_number))
              ? Number(row.case_number)
              : null,
          category: (row.category as string | null) ?? null,
          trial_type: (row.trial_type === "DEFENSE" || row.trial_type === "ACCUSATION") ? row.trial_type : null,
          voting_ended_at: (row.voting_ended_at as string | null) ?? null,
          ip_address: (row.ip_address as string | null) ?? null,
        });

        const allPosts = (data ?? [])
          .filter((row) => {
            const ip = (row as any).ip_address as string | null | undefined;
            return !ip || !blockedSet.has(String(ip));
          })
          .map((row) => toPostPreview(row as Record<string, unknown>));
        const ongoingPosts = allPosts.filter((p) => isVotingOpen(p.created_at, p.voting_ended_at));
        setPosts(ongoingPosts);
      } catch (err) {
        setError(err instanceof Error ? err.message : "재판 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // 카운트다운 갱신
  useEffect(() => {
    if (posts.length === 0) return;
    setCountdownNow(Date.now());
    const t = setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [posts]);

  // 대법관 로그인 여부
  useEffect(() => {
    fetch("/api/admin/check")
      .then((r) => r.json())
      .then((data: { loggedIn?: boolean }) => {
        setIsOperatorLoggedIn(data.loggedIn === true);
      })
      .catch(() => setIsOperatorLoggedIn(false));
  }, []);

  // 댓글 로드
  useEffect(() => {
    if (!selectedPost?.id) {
      setComments([]);
      setCommentsError(null);
      setReplyToId(null);
      return;
    }
    let cancelled = false;
    setCommentsLoading(true);
    setCommentsError(null);
    fetch(`/api/posts/${selectedPost.id}/comments`)
      .then((r) => r.json())
      .then((data: { comments?: Comment[]; likedCommentIds?: string[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        const list = Array.isArray(data.comments) ? data.comments : [];
        setComments(
          list.map((c: any) => ({
            id: c.id,
            content: c.content,
            created_at: c.created_at ?? null,
            parent_id: c.parent_id ?? null,
            author_id: c.author_id ?? null,
            likes: Number(c.likes) || 0,
            is_operator: c.is_operator === true,
            is_post_author: c.is_post_author === true,
            ip_address: c.ip_address ?? null,
          })),
        );
        if (Array.isArray(data.likedCommentIds)) {
          setLikedCommentIds(new Set(data.likedCommentIds));
        } else {
          setLikedCommentIds(new Set());
        }
      })
      .catch((err) => {
        if (!cancelled) setCommentsError(err instanceof Error ? err.message : "한마디를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPost?.id]);

  // 배심원 라벨링: 글 작성순(created_at 오름차순)으로 검사 / 배심원 1, 2, ...
  // 같은 IP면 같은 배심원 번호 유지 (해당 글에서)
  const getCommentLabelKey = (c: { id: string; author_id: string | null; is_post_author?: boolean; ip_address?: string | null }) =>
    c.author_id ?? (c.is_post_author ? "__author__" : (c.ip_address ?? `comment_${c.id}`));
  useEffect(() => {
    if (!selectedPost) {
      setJurorLabels({});
      return;
    }
    const sorted = [...comments].sort(
      (a, b) =>
        new Date(a.created_at ?? 0).getTime() -
        new Date(b.created_at ?? 0).getTime(),
    );
    const map: Record<string, string> = {};
    let idx = 1;
    for (const c of sorted) {
      const key = getCommentLabelKey(c);
      if (c.is_post_author) {
        if (!map[key]) map[key] = "원고";
      } else {
        if (!map[key]) map[key] = `배심원 ${idx++}`;
      }
    }
    setJurorLabels(map);
  }, [comments]);

  // 카드용 댓글 수
  const ongoingPostIds = useMemo(() => posts.map((p) => p.id), [posts]);
  useEffect(() => {
    if (ongoingPostIds.length === 0) {
      setCommentCountsByPostId({});
      return;
    }
    let cancelled = false;
    fetch(`/api/posts/comment-counts?ids=${ongoingPostIds.join(",")}`)
      .then((r) => r.json().catch(() => ({ counts: {} })))
      .then((data: { counts?: Record<string, number> }) => {
        if (cancelled) return;
        setCommentCountsByPostId(data.counts ?? {});
      })
      .catch(() => {
        if (!cancelled) setCommentCountsByPostId({});
      });
    return () => { cancelled = true; };
  }, [ongoingPostIds.join(",")]);

  useEffect(() => {
    if (ongoingPostIds.length === 0) {
      setViewCountsByPostId({});
      return;
    }
    let cancelled = false;
    fetch(`/api/posts/view-counts?ids=${ongoingPostIds.join(",")}`)
      .then((r) => r.json().catch(() => ({ counts: {} })))
      .then((data: { counts?: Record<string, number> }) => {
        if (cancelled) return;
        setViewCountsByPostId(data.counts ?? {});
      })
      .catch(() => {
        if (!cancelled) setViewCountsByPostId({});
      });
    return () => { cancelled = true; };
  }, [ongoingPostIds.join(",")]);

  useEffect(() => {
    if (!selectedPost?.id) return;
    fetch(`/api/posts/${selectedPost.id}/view`, { method: "POST" })
      .then(() => {
        const ids = new Set(ongoingPostIds);
        ids.add(selectedPost.id);
        if (ids.size === 0) return;
        return fetch(`/api/posts/view-counts?ids=${[...ids].join(",")}`)
          .then((r) => r.json().catch(() => ({ counts: {} })))
          .then((data: { counts?: Record<string, number> }) => {
            setViewCountsByPostId((prev) => ({ ...prev, ...(data.counts ?? {}) }));
          });
      })
      .catch(() => {});
  }, [selectedPost?.id]);

  // 카드에서 댓글 클릭으로 모달 열었을 때 댓글 섹션으로 스크롤
  useEffect(() => {
    if (!selectedPost || !scrollToCommentsOnOpen) return;
    const t = setTimeout(() => {
      commentsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollToCommentsOnOpen(false);
    }, 300);
    return () => clearTimeout(t);
  }, [selectedPost?.id, scrollToCommentsOnOpen]);

  useEffect(() => {
    if (!commentDeleteTargetId) return;
    setCommentDeletePassword("");
    setCommentDeleteError(null);
    const t = setTimeout(() => commentDeletePasswordRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [commentDeleteTargetId]);

  useEffect(() => {
    if (!deletePostId) return;
    setDeletePassword("");
    const t = setTimeout(() => deletePasswordRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [deletePostId]);

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const pw = commentFormPassword.trim();
    if (!selectedPost?.id || !commentInput.trim() || !pw || commentSubmitting) return;
    if (pw.length > 20) {
      setCommentsError("삭제 비밀번호는 20자 이내로 입력해 주세요.");
      return;
    }
    const parentId = replyToId;
    setCommentSubmitting(true);
    setCommentsError(null);
    try {
      const r = await fetch(`/api/posts/${selectedPost.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentInput.trim(), parent_id: parentId ?? null, password: pw }),
      });
      const data = (await r.json()) as { comment?: Comment; error?: string };
      if (!r.ok) throw new Error(data.error ?? "한마디 등록 실패");
      if (data.comment) {
        const newComment = { ...data.comment, parent_id: data.comment.parent_id ?? null };
        setComments((prev) => [...prev, newComment]);
      }
      setCommentInput("");
      setCommentFormPassword("");
      setReplyToId(null);
    } catch (err) {
      setCommentsError(err instanceof Error ? err.message : "한마디 등록에 실패했습니다.");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const commentTree = useMemo(() => {
    const sorted = [...comments].sort((a, b) => {
      if (commentSort === "popular") {
        if (b.likes !== a.likes) return b.likes - a.likes;
      }
      const aT = new Date(a.created_at ?? 0).getTime();
      const bT = new Date(b.created_at ?? 0).getTime();
      return commentSort === "oldest" ? aT - bT : bT - aT;
    });
    const topRoots = sorted.filter((c) => !c.parent_id);
    const operatorFirst = topRoots.filter((c) => c.is_operator);
    const rest = topRoots.filter((c) => !c.is_operator);
    const top = [...operatorFirst, ...rest];
    const byParent = new Map<string, Comment[]>();
    for (const c of sorted) {
      if (c.parent_id) {
        const list = byParent.get(c.parent_id) ?? [];
        list.push(c);
        byParent.set(c.parent_id, list);
      }
    }
    return { top, byParent };
  }, [comments, commentSort]);

  const openReportModal = (targetType: "post" | "comment", targetId: string) => {
    setReportTarget({ type: targetType, id: targetId });
  };

  const closeReportModal = () => {
    setReportTarget({ type: null, id: null });
    setReportReason("욕설/비하");
  };

  const handleReport = async (targetType: "post" | "comment", targetId: string, reason: string) => {
    try {
      const r = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, reason }),
      });
      const data = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok || !data.ok) {
        throw new Error(data.error ?? "신고에 실패했습니다.");
      }
      if (typeof window !== "undefined") {
        window.alert("신고가 접수되었습니다.");
      }
      setReportTarget({ type: null, id: null });
    } catch (err) {
      if (typeof window !== "undefined") {
        window.alert(err instanceof Error ? err.message : "신고 처리 중 오류가 발생했습니다.");
      }
    }
  };

  const sharePost = async (postId: string, title: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const pathname = typeof window !== "undefined" ? window.location.pathname : "/trials/ongoing";
    const url = `${origin}${pathname}?post=${postId}`;
    const shareTitle = title || "개판 - 판결문";
    const text = `${shareTitle} - 개판에서 배심원 투표와 최종 선고를 확인하세요.`;
    const isLocal = /localhost|127\.0\.0\.1/.test(origin);
    try {
      if (!isLocal && typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: shareTitle, url, text });
        setPostMenuOpenId(null);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        window.alert(isLocal ? "로컬 환경: 링크가 복사되었습니다. 배포 후에는 SNS 등으로 공유할 수 있습니다." : "링크가 복사되었습니다. 원하는 곳에 붙여넣어 공유하세요.");
        setPostMenuOpenId(null);
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        setPostMenuOpenId(null);
        return;
      }
    }
    window.alert(`공유 링크 (복사하여 사용): ${url}`);
    setPostMenuOpenId(null);
  };

  const closeDeleteModal = () => {
    setDeletePostId(null);
    setDeletePassword("");
    setDeleteSubmitting(false);
    setPostMenuOpenId(null);
  };

  const handleDeletePost = async (postId: string, password: string) => {
    if (typeof window === "undefined") return;
    if (!postId?.trim()) return;
    const trimmed = password.trim();
    if (!trimmed) {
      window.alert("판결문 삭제 비밀번호를 입력해 주세요.");
      return;
    }
    setDeleteSubmitting(true);
    try {
      const r = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: trimmed }),
      });
      const raw = await r.text();
      let data: { ok?: boolean; error?: string } | null = null;
      try {
        data = raw ? (JSON.parse(raw) as { ok?: boolean; error?: string }) : null;
      } catch {
        // ignore
      }
      if (!r.ok) {
        const msg = data?.error ?? `판결문 삭제에 실패했습니다. (${r.status})`;
        window.alert(msg);
        setDeleteSubmitting(false);
        return;
      }
      if (data && data.ok === false) {
        window.alert(data?.error ?? "판결문 삭제에 실패했습니다.");
        setDeleteSubmitting(false);
        return;
      }
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setSelectedPost((prev) => (prev?.id === postId ? null : prev));
      closeDeleteModal();
      window.alert("판결문이 삭제되었습니다.");
    } catch (err) {
      console.error("[handleDeletePost]", err);
      window.alert("판결문 삭제 중 오류가 발생했습니다.");
      setDeleteSubmitting(false);
    }
  };

  // 필터링 및 정렬
  const filteredPosts = useMemo(() => {
    const byCategory = posts.filter(
      (post) => selectedCategory === "전체" || post.category === selectedCategory,
    );
    let sorted = [...byCategory];
    if (sort === "latest") {
      sorted.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    } else if (sort === "votes") {
      sorted.sort((a, b) => b.guilty + b.not_guilty - (a.guilty + a.not_guilty));
    } else {
      sorted.sort((a, b) => getVotingEndsAt(a.created_at) - getVotingEndsAt(b.created_at));
    }
    return sorted;
  }, [posts, selectedCategory, sort]);

  // 투표 처리
  const handleVote = async (postId: string, type: "guilty" | "not_guilty") => {
    if (votingId) return;
    setVotingId(postId);
    try {
      const r = await fetch(`/api/posts/${postId}/vote`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = (await r.json()) as {
        guilty?: number;
        not_guilty?: number;
        currentVote?: "guilty" | "not_guilty" | null;
        error?: string;
      };
      if (!r.ok) throw new Error(data.error);
      const newGuilty = data.guilty ?? 0;
      const newNotGuilty = data.not_guilty ?? 0;

      setUserVotes((prev) => {
        const next = { ...prev };
        if (data.currentVote) next[postId] = data.currentVote;
        else delete next[postId];
        return next;
      });

      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, guilty: newGuilty, not_guilty: newNotGuilty } : p
        )
      );
      setSelectedPost((prev) =>
        prev?.id === postId ? { ...prev, guilty: newGuilty, not_guilty: newNotGuilty } : prev
      );
      
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("gaepan_votes");
        const votes = stored ? JSON.parse(stored) as Record<string, "guilty" | "not_guilty"> : {};
        if (data.currentVote) votes[postId] = data.currentVote;
        else delete votes[postId];
        localStorage.setItem("gaepan_votes", JSON.stringify(votes));
      }
    } catch (err) {
      if (err instanceof Error && err.message?.includes("이미 이 판결에 참여하셨습니다")) {
        if (typeof window !== "undefined") {
          window.alert("이미 판결에 참여하셨습니다.");
        }
      }
      setVotingId(null);
    } finally {
      setVotingId(null);
    }
  };

  const closeAccuse = () => {
    setIsReviewing(false);
    setIsAccuseOpen(false);
    setJudgeError(null);
    setCreatedPostId(null);
    setImageFiles([]);
    imagePreviewUrls.forEach((u) => URL.revokeObjectURL(u));
    setImagePreviewUrls([]);
    setUploadError(null);
    setForm({ title: "", details: "", password: "", category: "", trial_type: "ACCUSATION" });
  };

  const openAccuse = () => {
    setIsAccuseOpen(true);
    setIsReviewing(false);
    setJudgeResult(null);
    setJudgeError(null);
    setUploadError(null);
    setCreatedPostId(null);
  };

  const canSubmit = React.useMemo(() => {
    const ok =
      form.title.trim().length > 0 &&
      form.details.trim().length > 0 &&
      form.password.trim().length > 0 &&
      form.category.trim().length > 0;
    return ok && !isReviewing;
  }, [form, isReviewing]);

  React.useEffect(() => {
    if (!isAccuseOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAccuse();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAccuseOpen]);

  React.useEffect(() => {
    if (!isAccuseOpen) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    const t = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      window.scrollTo(0, scrollY);
    };
  }, [isAccuseOpen]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (!form.category?.trim()) {
      setJudgeError("카테고리를 선택해 주세요.");
      return;
    }
    if (!form.password?.trim()) {
      setJudgeError("판결문 삭제 비밀번호를 입력해 주세요.");
      return;
    }

    setIsReviewing(true);
    setJudgeResult(null);
    setJudgeError(null);

    try {
      const imageUrls: string[] = [];
      if (imageFiles.length > 0) {
        setUploadError(null);
        for (let i = 0; i < imageFiles.length; i++) {
          const fd = new FormData();
          fd.append("file", imageFiles[i]);
          const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
          const uploadData = (await uploadRes.json()) as { url?: string; error?: string };
          if (!uploadRes.ok) {
            setUploadError(uploadData.error ?? "이미지 업로드 실패");
            return;
          }
          const url = uploadData.url ?? null;
          if (url) imageUrls.push(url);
        }
      }

      const r = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          details: form.details,
          image_urls: imageUrls.length > 0 ? imageUrls : undefined,
          password: form.password,
          category: form.category,
          trial_type: "ACCUSATION",
        }),
      });

      type JudgeApiResponse =
        | {
            ok: true;
            mock?: boolean;
            verdict: {
              title: string;
              ratio: { plaintiff: number; defendant: number; rationale: string };
              verdict: string;
            };
            post_id?: string | null;
          }
        | { ok: true; status: "판결불가"; verdict: null; post_id?: string | null }
        | { ok: false; error?: string };

      let data: JudgeApiResponse | null = null;
      try {
        data = (await r.json()) as JudgeApiResponse;
      } catch {
        data = null;
      }

      if (!r.ok || !data || !data.ok) {
        const msg = (data && "error" in data && data.error) || `요청 실패 (${r.status} ${r.statusText})`;
        setJudgeError(msg);
        return;
      }

      if ("status" in data && data.status === "판결불가") {
        const msg = (data as { message?: string }).message ?? "판결할 수 없습니다.";
        setJudgeError(msg);
        return;
      }

      setJudgeResult({ mock: (data as any).mock ?? false, verdict: (data as any).verdict });
      const pid =
        (data && "post_id" in data && (data as any).post_id) ? String((data as any).post_id) : null;
      setCreatedPostId(pid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      setJudgeError(msg);
    } finally {
      setIsReviewing(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 overflow-x-hidden">
      {/* 네비게이션 */}
      <nav className="px-4 py-3 md:px-6 md:py-4 border-b border-zinc-900 flex justify-between items-center sticky top-0 bg-zinc-950/80 backdrop-blur-md z-50">
        <Logo />
        <div className="flex items-center">
          <button
            type="button"
            onClick={openAccuse}
            className="bg-amber-600 hover:bg-amber-500 text-black px-3 py-1.5 md:px-4 md:py-2 rounded-full text-sm font-bold transition"
          >
            지금 기소하기
          </button>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto py-12 px-4 md:px-6">
        <div className="mb-8">
          <h1 className="text-4xl font-black text-amber-400 mb-2">진행 중인 재판</h1>
          <p className="text-amber-400/90 text-sm font-semibold">
            현재 {posts.length}건의 재판이 집행 중입니다.
          </p>
        </div>

        {/* 카테고리 필터 */}
        <div className="sticky top-[4.5rem] z-40 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-900 py-3 px-4 -mx-6 mb-6">
          <div className="max-w-5xl mx-auto flex flex-wrap justify-center gap-2">
            {(["전체", "연애", "직장생활", "학교생활", "군대", "가족", "결혼생활", "육아", "친구", "이웃/매너", "사회이슈", "기타"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                  selectedCategory === cat
                    ? "bg-amber-500 text-black"
                    : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-amber-500/50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* 정렬 버튼 — 최신순 / 인기순 / 판결임박순 */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            type="button"
            onClick={() => setSort("latest")}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
              sort === "latest"
                ? "bg-amber-500 text-black"
                : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-amber-500/50"
            }`}
          >
            최신순
          </button>
          <button
            type="button"
            onClick={() => setSort("votes")}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
              sort === "votes"
                ? "bg-amber-500 text-black"
                : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-amber-500/50"
            }`}
          >
            인기순
          </button>
          <button
            type="button"
            onClick={() => setSort("urgent")}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
              sort === "urgent"
                ? "bg-amber-500 text-black"
                : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-amber-500/50"
            }`}
          >
            🔥 판결 임박
          </button>
        </div>

        {/* 에러 메시지 */}
        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 mb-4">
            {error}
          </div>
        ) : null}

        {/* 로딩 */}
        {loading ? (
          <div className="text-center py-12 text-zinc-500">불러오는 중...</div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            진행 중인 재판이 없습니다.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4 md:gap-6 mt-6 overflow-x-hidden break-all">
            {filteredPosts.map((p) => (
              <article
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPost(p)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedPost(p)}
                className="group w-full max-w-[calc(100vw-2rem)] mx-auto rounded-[1.75rem] border border-zinc-900 bg-zinc-950 px-4 md:px-6 py-6 md:py-9 hover:border-amber-500/40 transition-all cursor-pointer select-none flex flex-col gap-2 overflow-x-hidden break-all"
              >
                {/* 상단: 카테고리(좌) + 사건번호·메뉴(우측) */}
                <div className="flex items-center justify-between mb-2 text-[11px] text-zinc-500">
                  <div className="flex items-center gap-1 shrink-0">
                    {p.category ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-zinc-900/80 border border-zinc-800 text-zinc-400">
                        {p.category}
                      </span>
                    ) : null}
                    {topOfDayPost && p.id === topOfDayPost.id ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 border border-amber-400/70 text-amber-300 whitespace-nowrap">
                        <span>🔥</span>
                        <span>오늘의 개판</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {p.case_number != null ? (
                      <span className="inline-flex items-center px-3 py-1 text-[10px] font-bold text-zinc-500 whitespace-nowrap leading-none">
                        사건 번호 {p.case_number}
                      </span>
                    ) : null}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPostMenuOpenId((prev) => (prev === p.id ? null : p.id));
                        }}
                        className="p-0.5 text-zinc-500 hover:text-zinc-300"
                        aria-label="메뉴"
                      >
                        ⋯
                      </button>
                      {postMenuOpenId === p.id ? (
                        <div className="absolute right-0 mt-1 w-40 rounded-md border border-zinc-800 bg-zinc-900 py-1 text-[11px] text-zinc-200 shadow-lg z-20">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              sharePost(p.id, p.title);
                            }}
                            className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800"
                          >
                            공유하기
                          </button>
                          {isOperatorLoggedIn ? (
                            <>
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!confirm("이 작성자를 차단하시겠습니까? (해당 IP는 글/댓글 작성, 투표, 발도장이 제한됩니다)")) return;
                                  try {
                                    const r = await fetch("/api/admin/block", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ targetType: "post", id: p.id }),
                                    });
                                    if (!r.ok) {
                                      const data = await r.json().catch(() => null);
                                      alert(data?.error || "차단에 실패했습니다.");
                                    } else {
                                      alert("작성자가 차단되었습니다.");
                                    }
                                  } catch (err) {
                                    console.error("작성자 차단 실패:", err);
                                    alert("차단 중 오류가 발생했습니다.");
                                  } finally {
                                    setPostMenuOpenId(null);
                                  }
                                }}
                                className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
                              >
                                👮 작성자 차단
                              </button>
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!confirm("이 글을 삭제하시겠습니까?")) return;
                                  try {
                                    const r = await fetch(`/api/admin/delete?type=post&id=${p.id}`, { method: "DELETE" });
                                    if (r.ok) {
                                      setPosts((prev) => prev.filter((x) => x.id !== p.id));
                                      window.location.reload();
                                    }
                                  } catch (err) {
                                    console.error("삭제 실패:", err);
                                  } finally {
                                    setPostMenuOpenId(null);
                                  }
                                }}
                                className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
                              >
                                ⚖️ 삭제
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletePostId(p.id);
                                  setPostMenuOpenId(null);
                                }}
                                className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
                              >
                                판결문 삭제
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openReportModal("post", p.id);
                                  setPostMenuOpenId(null);
                                }}
                                className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800"
                              >
                                신고하기
                              </button>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* 제목 + 내용 요약 */}
                <div className="mb-2">
                  {isUrgent(p.created_at) ? (
                    <span className="text-[10px] md:text-[11px] font-bold text-red-500 block mb-1 text-left">[🔥 판결 임박]</span>
                  ) : null}
                  <h4 className="text-base md:text-lg font-bold group-hover:text-amber-400 transition line-clamp-1 text-left break-all">
                    {maskBlocked(p.title)}
                  </h4>
                  {p.content ? (
                    <p className="text-[11px] text-zinc-400 line-clamp-2 text-left break-all">
                      {(() => { const t = (p.content || "").trim().replace(/\s+/g, " "); return t.slice(0, 100) + (t.length > 100 ? "…" : ""); })()}
                    </p>
                  ) : null}
                </div>

                {/* 하단 정보 */}
                <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-zinc-500 mb-2 mt-1">
                  {p.plaintiff === "익명" && p.defendant === "익명" ? null : (
                    <>
                      {p.plaintiff ? <span>검사 {p.plaintiff}</span> : null}
                      {p.plaintiff && p.defendant ? <span>·</span> : null}
                      {p.defendant ? <span>피고인 {p.defendant}</span> : null}
                    </>
                  )}
                </div>
                <p className="text-[11px] font-bold text-amber-400 mb-2 tabular-nums text-center">
                  ⏳ 남은 시간 {formatCountdown(Math.max(0, getVotingEndsAt(p.created_at) - countdownNow))}
                </p>
                {/* 투표 현황 (작은 막대 그래프) */}
                {(() => {
                  const total = p.guilty + p.not_guilty;
                  const guiltyPct = total ? Math.round((p.guilty / total) * 100) : 0;
                  const notGuiltyPct = total ? Math.round((p.not_guilty / total) * 100) : 0;
                  const isTie = total > 0 && p.guilty === p.not_guilty;
                  return (
                    <div className="mb-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-zinc-500">
                        <span className="text-red-400 text-xs md:text-sm">유죄 {guiltyPct}% ({p.guilty}표)</span>
                        <span className="text-blue-400 text-xs md:text-sm">무죄 {notGuiltyPct}% ({p.not_guilty}표)</span>
                      </div>
                      <div className="relative w-full h-1.5 bg-zinc-800 rounded-full overflow-visible flex">
                        {guiltyPct > 0 ? <div className="bg-red-500 h-full shrink-0 rounded-l-full" style={{ width: `${guiltyPct}%` }} /> : null}
                        {notGuiltyPct > 0 ? <div className="bg-blue-500 h-full shrink-0 rounded-r-full" style={{ width: `${notGuiltyPct}%` }} /> : null}
                        {isTie ? (
                          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-amber-400/90 bg-zinc-900 text-[10px] font-black text-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]" aria-hidden>⚡</span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex items-center justify-start gap-2 text-[10px] text-zinc-500">
                        <span className="inline-flex items-center gap-0.5" aria-label="조회수"><span aria-hidden>👁</span><span>{viewCountsByPostId[p.id] ?? 0}</span></span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSelectedPost(p); setScrollToCommentsOnOpen(true); }}
                          className="flex items-center gap-0.5 hover:text-zinc-400 transition"
                          aria-label="댓글 보기"
                        >
                          <span aria-hidden>💬</span>
                          <span>{commentCountsByPostId[p.id] ?? 0}</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </article>
            ))}
          </div>
        )}
      </div>

      {/* 판결문 상세 모달 */}
      {selectedPost ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden p-4"
          role="dialog"
          aria-modal="true"
          aria-label="판결문 상세"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/80"
            aria-label="닫기"
            onClick={() => {
              setSelectedPost(null);
              setPostMenuOpenId(null);
            }}
          />
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] border border-zinc-800 bg-zinc-950 shadow-[0_0_60px_rgba(0,0,0,0.8)]">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 p-6 border-b border-zinc-800 bg-zinc-950">
              <h3 className="text-lg font-black text-amber-500">판결문 상세</h3>
              <div className="flex items-center gap-2">
                {selectedPost.case_number != null ? (
                  <span className="inline-flex items-center px-3 py-1 text-[10px] font-bold text-zinc-400 whitespace-nowrap leading-none rounded-full border border-zinc-700/80 bg-zinc-900/60">
                    사건 번호 {selectedPost.case_number}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelectedPost(null)}
                  className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-800 transition"
                >
                  닫기
                </button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {(() => {
                const isFinished = !isVotingOpen(selectedPost.created_at, selectedPost.voting_ended_at);
                const total = selectedPost.guilty + selectedPost.not_guilty;
                const guiltyPct = total ? Math.round((selectedPost.guilty / total) * 100) : 0;
                const notGuiltyPct = total ? Math.round((selectedPost.not_guilty / total) * 100) : 0;
                const aiRatio = selectedPost.ratio ?? 50;
                
                // 재판 목적에 따른 승소/패소 판정
                let isAuthorVictory = false;
                const isTie = selectedPost.guilty === selectedPost.not_guilty;
                if (selectedPost.trial_type === "DEFENSE") {
                  if (isTie) isAuthorVictory = aiRatio < 50;
                  else isAuthorVictory = selectedPost.not_guilty > selectedPost.guilty;
                } else if (selectedPost.trial_type === "ACCUSATION") {
                  if (isTie) isAuthorVictory = aiRatio >= 50;
                  else isAuthorVictory = selectedPost.guilty > selectedPost.not_guilty;
                } else {
                  isAuthorVictory = aiRatio >= 50;
                }
                
                // 조합된 닉네임 생성
                const authorName = selectedPost.plaintiff === "익명" && selectedPost.defendant === "익명"
                  ? "익명의 검사"
                  : selectedPost.plaintiff && selectedPost.defendant
                  ? `${selectedPost.plaintiff}·${selectedPost.defendant}`
                  : selectedPost.plaintiff || selectedPost.defendant || "익명의 검사";
                
                return (
                  <>
                    {(() => {
                      const imgUrls = parseImageUrls(selectedPost.image_url);
                      return imgUrls.length > 0 ? (
                        <div>
                          <div className="flex flex-wrap gap-3">
                            {imgUrls.map((src, i) => (
                              <a
                                key={i}
                                href={src}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900 flex-shrink-0"
                              >
                                <img
                                  src={src}
                                  alt={`첨부 증거 ${i + 1}`}
                                  className="w-full h-auto max-h-[min(36vh,280px)] object-contain bg-zinc-900"
                                />
                              </a>
                            ))}
                          </div>
                          <div className="text-xs font-black tracking-widest uppercase text-zinc-500 mt-2">첨부 이미지 {imgUrls.length > 1 ? `(${imgUrls.length}장)` : ""}</div>
                        </div>
                      ) : null;
                    })()}
                    <div className="flex items-start justify-between gap-4 mb-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {!isFinished && isUrgent(selectedPost.created_at) ? (
                            <span className="text-xs font-black text-red-500">[🔥 판결 임박]</span>
                          ) : null}
                          <span className="text-xs font-black tracking-widest uppercase text-zinc-500">사건 제목</span>
                        </div>
                        <h4 className="text-xl md:text-2xl font-bold text-zinc-100 break-words">{maskBlocked(selectedPost.title)}</h4>
                      </div>
                    </div>
                    
                    {/* 판결 완료 시 승소/패소 UI */}
                    {isFinished && total > 0 ? (
                      <div className={`rounded-2xl border-2 p-8 mb-6 relative overflow-hidden ${
                        isAuthorVictory
                          ? "border-[#FFD700]/60 bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent shadow-[0_0_40px_rgba(255,215,0,0.3)]"
                          : "border-zinc-600 bg-zinc-900/50"
                      }`}>
                        {/* [판결 확정] 도장 효과 */}
                        <div className={`absolute top-4 right-4 transform rotate-12 ${
                          isAuthorVictory ? "border-[#FFD700]" : "border-zinc-600"
                        } border-2 px-3 py-1 rounded`}>
                          <span className={`text-xs font-black ${
                            isAuthorVictory ? "text-[#FFD700]" : "text-zinc-500"
                          }`}>
                            [판결 확정]
                          </span>
                        </div>
                        
                        {/* 승소/패소 메인 텍스트 */}
                        <div className="text-center py-8">
                          <div className={`font-black text-5xl mb-4 ${
                            isAuthorVictory
                              ? "text-[#FFD700] bg-gradient-to-r from-[#FFD700] to-amber-500 bg-clip-text text-transparent"
                              : "text-zinc-500"
                          }`}>
                            {isAuthorVictory
                              ? (selectedPost.trial_type === "DEFENSE" ? "🏆 무죄 확정" : "🏆 유죄 확정")
                              : (selectedPost.trial_type === "DEFENSE" ? "🔨 유죄 확정" : "🔨 무죄 확정")}
                          </div>
                          
                          {/* 판결문 연출 */}
                          <p className={`text-base font-bold mt-4 ${
                            isAuthorVictory ? "text-amber-300" : "text-zinc-400"
                          }`}>
                            {isAuthorVictory
                              ? selectedPost.trial_type === "DEFENSE"
                                ? `${authorName}의 항변이 받아들여졌습니다! [무죄 확정]`
                                : `${authorName}의 기소가 성공했습니다! [유죄 확정]`
                              : `배심원단이 ${authorName}의 주장을 불기소했습니다. [${selectedPost.trial_type === "DEFENSE" ? "유죄 확정" : "무죄 확정"}]`
                            }
                          </p>
                          
                          {/* 작은 데이터 텍스트 */}
                          <p className="text-xs text-zinc-600 mt-2">
                            {isAuthorVictory 
                              ? selectedPost.trial_type === "DEFENSE"
                                ? `배심원 ${notGuiltyPct}%의 지지로 무죄 판결`
                                : `배심원 ${guiltyPct}%의 지지로 유죄 판결`
                              : selectedPost.trial_type === "DEFENSE"
                              ? `배심원 ${guiltyPct}%의 지지로 유죄 판결`
                              : `배심원 ${notGuiltyPct}%의 지지로 무죄 판결`
                            }
                          </p>
                        </div>
                      </div>
                    ) : (
                      /* 진행 중일 때: 재판 남은 시간 */
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3">
                        <p className="text-sm font-bold text-amber-400">
                          ⏳ 남은 시간 <span className="tabular-nums">{formatCountdown(Math.max(0, getVotingEndsAt(selectedPost.created_at) - countdownNow))}</span>
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                {selectedPost.plaintiff === "익명" && selectedPost.defendant === "익명" ? (
                  <span>익명{maskCommentIp(selectedPost.ip_address) ? ` (${maskCommentIp(selectedPost.ip_address)})` : ""}</span>
                ) : (
                  <>
                    {selectedPost.plaintiff ? <span>검사 {selectedPost.plaintiff}</span> : null}
                    {selectedPost.plaintiff && selectedPost.defendant ? <span>·</span> : null}
                    {selectedPost.defendant ? <span>피고인 {selectedPost.defendant}</span> : null}
                  </>
                )}
                {selectedPost.created_at ? (
                  <span>
                    · {new Date(selectedPost.created_at).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                ) : null}
                <div className="relative ml-auto">
                  <button
                    type="button"
                    onClick={() =>
                      setPostMenuOpenId((prev) => (prev === selectedPost.id ? null : selectedPost.id))
                    }
                    className="px-1 text-zinc-500 hover:text-zinc-300"
                    aria-label="메뉴"
                  >
                    ⋯
                  </button>
                  {postMenuOpenId === selectedPost.id ? (
                    <div className="absolute right-0 mt-1 w-40 rounded-md border border-zinc-800 bg-zinc-900 py-1 text-[11px] text-zinc-200 shadow-lg z-20">
                      <button
                        type="button"
                        onClick={() => sharePost(selectedPost.id, selectedPost.title)}
                        className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800"
                      >
                        공유하기
                      </button>
                      {isOperatorLoggedIn ? (
                        <>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm("이 작성자를 차단하시겠습니까? (해당 IP는 글/댓글 작성, 투표, 발도장이 제한됩니다)")) return;
                              try {
                                const r = await fetch("/api/admin/block", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ targetType: "post", id: selectedPost.id }),
                                });
                                if (!r.ok) {
                                  const data = await r.json().catch(() => null);
                                  alert(data?.error || "차단에 실패했습니다.");
                                } else {
                                  alert("작성자가 차단되었습니다.");
                                }
                              } catch (err) {
                                console.error("작성자 차단 실패:", err);
                                alert("차단 중 오류가 발생했습니다.");
                              } finally {
                                setPostMenuOpenId(null);
                              }
                            }}
                            className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
                          >
                            👮 작성자 차단
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm("이 글을 삭제하시겠습니까?")) return;
                              try {
                                const r = await fetch(`/api/admin/delete?type=post&id=${selectedPost.id}`, { method: "DELETE" });
                                if (r.ok) {
                                  setSelectedPost(null);
                                  setPosts((prev) => prev.filter((p) => p.id !== selectedPost.id));
                                  window.location.reload();
                                }
                              } catch (err) {
                                console.error("삭제 실패:", err);
                              } finally {
                                setPostMenuOpenId(null);
                              }
                            }}
                            className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
                          >
                            ⚖️ 삭제
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setDeletePostId(selectedPost.id);
                              setPostMenuOpenId(null);
                            }}
                            className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
                          >
                            판결문 삭제
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              openReportModal("post", selectedPost.id);
                              setPostMenuOpenId(null);
                            }}
                            className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800"
                          >
                            신고하기
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
              {/* 섹션 1: 📜 사건의 발단 */}
              <section className="space-y-3">
                <div>
                  <div className="text-xs font-black tracking-widest uppercase text-zinc-400">
                    📜 사건의 발단
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    원고가 직접 작성한 사건의 경위입니다.
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 w-full overflow-x-hidden min-w-0">
                  {selectedPost.content ? (
                      <p className="text-sm sm:text-base text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                      {maskBlocked(sanitizeCaseContentDisplay(selectedPost.content))}
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      작성된 사건 경위가 없습니다.
                    </p>
                  )}
                </div>
              </section>

              <div className="mt-6 flex flex-col gap-4">
                <CoupangBanner href="https://link.coupang.com/a/dHLvG2" hideDisclaimer />
                <CoupangBanner
                  href="https://link.coupang.com/a/dIrVHM"
                  title=""
                  highlight="'바스로망 히노끼 입욕제'"
                  suffix="로 "
                  suffixAfterBr="굳은 몸을 힐링해 보세요."
                />
              </div>

              <div className="my-6 border-t border-dashed border-zinc-700" />

              {/* 섹션 2: ⚖️ 최종 선고 */}
              {(() => {
                const isFinished = !isVotingOpen(selectedPost.created_at, selectedPost.voting_ended_at);
                const aiRatio = selectedPost.ratio ?? 50;
                const verdictText = typeof selectedPost.verdict === "string" ? selectedPost.verdict : "";
                const isDefense =
                  selectedPost.trial_type === "DEFENSE" ||
                  ((verdictText.includes("피고인 무죄") || verdictText.includes("불기소") || verdictText.includes("원고 무죄")) && selectedPost.trial_type !== "ACCUSATION");
                const notGuiltyPct = isDefense ? aiRatio : 100 - aiRatio;
                const guiltyPct = isDefense ? 100 - aiRatio : aiRatio;
                const isFiftyFifty = guiltyPct === 50 && notGuiltyPct === 50;
                const primaryLabel = guiltyPct >= notGuiltyPct ? "유죄" : "무죄";
                return (
                  <section className="space-y-4" aria-label="최종 선고">
                    <div>
                      <div className="text-xs font-black tracking-widest uppercase text-zinc-400">
                        ⚖️ 최종 선고
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        이 사건에 대한 최종 선고와 그 근거입니다. 유사 판례(국가법령정보센터)를 참조해 작성될 수 있습니다.
                      </p>
                    </div>
                    <div
                      className={`relative overflow-hidden rounded-2xl border px-3 py-4 md:px-5 md:py-5 w-full transition-all duration-300 ${
                        isFiftyFifty
                          ? "border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-zinc-900 to-zinc-950 shadow-[0_0_35px_rgba(245,158,11,0.25)]"
                          : primaryLabel === "유죄"
                            ? "border-red-500/50 bg-gradient-to-br from-red-950/25 via-zinc-900 to-zinc-950 shadow-[0_0_30px_rgba(239,68,68,0.2)]"
                            : "border-blue-500/50 bg-gradient-to-br from-blue-950/25 via-zinc-900 to-zinc-950 shadow-[0_0_30px_rgba(59,130,246,0.2)]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`text-xs sm:text-base font-semibold min-w-0 truncate ${
                          isFiftyFifty ? "text-amber-100" : primaryLabel === "유죄" ? "text-red-200" : "text-blue-200"
                        }`}>
                          최종 선고
                        </span>
                        <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] ${
                          isFiftyFifty
                            ? "border-amber-400/80 bg-amber-500/15 text-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.7)]"
                            : primaryLabel === "유죄"
                              ? "border-red-400/70 bg-red-500/20 text-red-200 shadow-[0_0_12px_rgba(239,68,68,0.4)]"
                              : "border-blue-400/70 bg-blue-500/20 text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.4)]"
                        }`} aria-label="개판 선고 시스템">
                          개판 선고
                        </span>
                      </div>
                      <div className="mt-4 md:mt-5 text-center" aria-live="polite">
                        {isFiftyFifty ? (
                          <>
                            <p className="text-xl sm:text-3xl md:text-4xl font-black text-amber-400 whitespace-nowrap drop-shadow-[0_0_20px_rgba(245,158,11,0.4)]">
                              [ ⚖️ 판결 유보 : 판단 불가 ]
                            </p>
                            <p className="mt-1.5 text-[10px] text-zinc-500">
                              배심원 투표가 동점이거나, 선고문 생성이 보류된 경우입니다.
                            </p>
                          </>
                        ) : (
                          <motion.p
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className={`flex items-center justify-center gap-2 text-xl sm:text-3xl md:text-4xl font-black whitespace-nowrap ${
                              primaryLabel === "유죄"
                                ? "text-red-300 drop-shadow-[0_0_24px_rgba(239,68,68,0.5)]"
                                : "text-blue-300 drop-shadow-[0_0_24px_rgba(59,130,246,0.5)]"
                            }`}
                          >
                            <span className="text-2xl sm:text-4xl md:text-5xl leading-none" aria-hidden>
                              {primaryLabel === "유죄" ? "🔨" : "⚖️"}
                            </span>
                            <span className={`bg-clip-text text-transparent bg-gradient-to-b ${
                              primaryLabel === "유죄" ? "from-red-200 to-red-500" : "from-blue-200 to-blue-500"
                            }`}>
                              피고인 {primaryLabel}
                            </span>
                          </motion.p>
                        )}
                      </div>
                      {/* 선고문 (상세 근거) */}
                      {(() => {
                        const raw =
                          selectedPost.verdict_rationale ??
                          (selectedPost as Record<string, unknown>).verdictRationale ??
                          "";
                        const rationale = typeof raw === "string" ? raw : "";
                        const displayText =
                          sanitizeVerdictDisplay(rationale) || "상세 판결 근거가 기록되지 않은 사건입니다. 이전 버전에서 작성된 사건이거나 기록이 누락되었을 수 있습니다.";
                        return (
                          <div className="mt-3 md:mt-4">
                            <div className="text-[11px] sm:text-xs font-semibold text-amber-100/90 mb-1">
                              선고문 (상세 근거)
                            </div>
                            <p className="text-xs sm:text-base text-amber-50 leading-relaxed whitespace-pre-wrap break-words">
                              {displayText}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                    <p className="text-[10px] text-zinc-500" aria-live="polite">
                      본 선고는 참고용이며, 법적 효력이 없습니다.
                    </p>
                  </section>
                );
              })()}

              <div className="my-6 border-t border-dashed border-zinc-700" />

              {/* 섹션 2: 👥 배심원 평결 및 한마디 */}
              <div className="mb-4">
                <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <span>👥 배심원 평결 및 한마디</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  실제 참여한 배심원 투표 결과와 한마디를 한눈에 볼 수 있습니다.
                </p>
              </div>

              {/* 상세 모달 내 투표 - 무죄주장이면 무죄 버튼 먼저 */}
              {isVotingOpen(selectedPost.created_at, selectedPost.voting_ended_at) ? (
                <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const total = selectedPost.guilty + selectedPost.not_guilty;
                    const guiltyPct = total ? Math.round((selectedPost.guilty / total) * 100) : 0;
                    const notGuiltyPct = total ? Math.round((selectedPost.not_guilty / total) * 100) : 0;
                    const verdictText = typeof selectedPost.verdict === "string" ? selectedPost.verdict : "";
                    const isDefense =
                      selectedPost.trial_type === "DEFENSE" ||
                      ((verdictText.includes("피고인 무죄") || verdictText.includes("불기소") || verdictText.includes("원고 무죄")) && selectedPost.trial_type !== "ACCUSATION");
                    const first = isDefense ? "not_guilty" : "guilty";
                    const second = isDefense ? "guilty" : "not_guilty";
                    return (
                      <>
                        <button
                          type="button"
                          disabled={votingId === selectedPost.id}
                          onClick={() => handleVote(selectedPost.id, first)}
                          className={`rounded-lg px-4 py-2 text-xs font-bold transition disabled:opacity-50 shadow-sm ${
                            first === "not_guilty"
                              ? (userVotes[selectedPost.id] === "not_guilty" ? "bg-blue-500/50 ring-1 ring-blue-400/60 text-blue-100" : "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400")
                              : (userVotes[selectedPost.id] === "guilty" ? "bg-red-500/50 ring-1 ring-red-400/60 text-red-100" : "bg-red-500/20 hover:bg-red-500/30 text-red-400")
                          }`}
                        >
                          {first === "not_guilty" ? "피고인 무죄" : "피고인 유죄"} ({first === "not_guilty" ? notGuiltyPct : guiltyPct}%) {first === "not_guilty" ? selectedPost.not_guilty : selectedPost.guilty}표
                        </button>
                        <button
                          type="button"
                          disabled={votingId === selectedPost.id}
                          onClick={() => handleVote(selectedPost.id, second)}
                          className={`rounded-lg px-4 py-2 text-xs font-bold transition disabled:opacity-50 shadow-sm ${
                            second === "not_guilty"
                              ? (userVotes[selectedPost.id] === "not_guilty" ? "bg-blue-500/50 ring-1 ring-blue-400/60 text-blue-100" : "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400")
                              : (userVotes[selectedPost.id] === "guilty" ? "bg-red-500/50 ring-1 ring-red-400/60 text-red-100" : "bg-red-500/20 hover:bg-red-500/30 text-red-400")
                          }`}
                        >
                          {second === "not_guilty" ? "피고인 무죄" : "피고인 유죄"} ({second === "not_guilty" ? notGuiltyPct : guiltyPct}%) {second === "not_guilty" ? selectedPost.not_guilty : selectedPost.guilty}표
                        </button>
                      </>
                    );
                  })()}
                </div>
              ) : null}

              {/* 재판 종료 시: AI vs 배심원 비교 대시보드 */}
              {!isVotingOpen(selectedPost.created_at, selectedPost.voting_ended_at) && (selectedPost.guilty > 0 || selectedPost.not_guilty > 0) ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 space-y-4">
                  <div className="text-xs font-black tracking-widest uppercase text-zinc-400">AI 판사 vs 배심원단</div>
                  {(() => {
                    const total = selectedPost.guilty + selectedPost.not_guilty;
                    const juryGuiltyPct = total ? Math.round((selectedPost.guilty / total) * 100) : 50;
                    const juryNotGuiltyPct = total ? 100 - juryGuiltyPct : 50;
                    const aiDefendantPct = selectedPost.ratio ?? 50;
                    const aiPlaintiffPct = 100 - aiDefendantPct;
                    const aiVerdict = aiDefendantPct >= 50 ? "유죄" : "무죄";
                    const aiPct = aiDefendantPct >= 50 ? aiDefendantPct : 100 - aiDefendantPct;
                    const juryVerdict = juryGuiltyPct >= 50 ? "유죄" : "무죄";
                    const juryPct = juryGuiltyPct >= 50 ? juryGuiltyPct : juryNotGuiltyPct;
                    const agreed = aiVerdict === juryVerdict;
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                            <p className="text-[10px] font-bold uppercase text-amber-500/80 mb-1">AI 판사</p>
                            <p className={`text-sm font-bold ${aiVerdict === "유죄" ? "text-red-300" : "text-blue-300"}`}>
                              피고인 {aiVerdict}
                            </p>
                          </div>
                          <div className="rounded-xl border border-zinc-600 bg-zinc-800/50 p-3">
                            <p className="text-[10px] font-bold uppercase text-zinc-400 mb-1">배심원단</p>
                            <p className={`text-sm font-bold ${juryVerdict === "유죄" ? "text-red-300" : "text-blue-300"}`}>
                              피고인 {juryVerdict}
                            </p>
                          </div>
                        </div>
                        <p className={`text-sm font-bold ${agreed ? "text-amber-400" : "text-red-400"}`}>
                          {agreed
                            ? "AI 판사와 배심원의 의견이 일치했습니다!"
                            : "AI 판사와 배심원의 의견이 불일치했습니다!"}
                        </p>
                      </>
                    );
                  })()}
                </div>
              ) : null}

              {/* 배심원 한마디 (대댓글 지원) */}
              <div ref={commentsSectionRef} className="border-t border-zinc-800 pt-6">
                <div className="mb-3 text-xs font-black tracking-widest uppercase text-zinc-500">
                  배심원 한마디
                </div>
                {commentsError ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200 mb-3">
                    {commentsError}
                  </div>
                ) : null}
                <form onSubmit={submitComment} className="space-y-3">
                  {replyToId ? (
                    (() => {
                      const replyTarget = comments.find((c) => c.id === replyToId);
                      const summary = replyTarget
                        ? (replyTarget.content.replace(/\s+/g, " ").trim().slice(0, 40) + (replyTarget.content.replace(/\s+/g, " ").trim().length > 40 ? "…" : ""))
                        : "";
                      return (
                        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                          <span className="min-w-0 flex-1 truncate">
                            {summary ? `"${summary}" 에 대한 답글 작성 중` : "답글 작성 중"}
                          </span>
                          <button type="button" onClick={() => { setReplyToId(null); setCommentInput(""); }} className="shrink-0 font-bold hover:underline">
                            취소
                          </button>
                        </div>
                      );
                    })()
                  ) : null}
                  <textarea
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    disabled={commentSubmitting}
                    placeholder={replyToId ? "대댓글을 입력하세요 (최대 2000자)" : "익명으로 배심원 한마디를 남기세요 (최대 2000자)"}
                    maxLength={2000}
                    className="w-full min-h-[80px] resize-y rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition disabled:opacity-60"
                  />
                  <input
                    type="password"
                    value={commentFormPassword}
                    onChange={(e) => setCommentFormPassword(e.target.value)}
                    disabled={commentSubmitting}
                    placeholder="판결문 삭제 비밀번호 (20자 이내)"
                    maxLength={20}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-amber-500/60"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">{commentInput.length}/2000</span>
                    <button
                      type="submit"
                      disabled={!commentInput.trim() || !commentFormPassword.trim() || commentSubmitting}
                      className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {commentSubmitting ? "등록 중..." : replyToId ? "답글 등록" : "한마디 등록"}
                    </button>
                  </div>
                </form>
                {commentsLoading ? (
                  <div className="mt-4 text-sm text-zinc-500">한마디 불러오는 중...</div>
                ) : (
                  <>
                    <div className="mt-4 flex items-center gap-4 text-[11px] text-zinc-500">
                      <button
                        type="button"
                        onClick={() => setCommentSort("oldest")}
                        className={
                          commentSort === "oldest"
                            ? "font-semibold text-zinc-100"
                            : "text-zinc-500 hover:text-zinc-300"
                        }
                      >
                        작성순
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommentSort("latest")}
                        className={
                          commentSort === "latest"
                            ? "font-semibold text-zinc-100"
                            : "text-zinc-500 hover:text-zinc-300"
                        }
                      >
                        최신순
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommentSort("popular")}
                        className={
                          commentSort === "popular"
                            ? "font-semibold text-zinc-100"
                            : "text-zinc-500 hover:text-zinc-300"
                        }
                      >
                        인기순(발도장순)
                      </button>
                    </div>
                    {commentTree.top.length === 0 ? (
                      <p className="mt-4 text-sm text-zinc-500">아직 배심원 한마디가 없습니다.</p>
                    ) : (
                      <ul className="mt-4 space-y-4">
                    {commentTree.top.map((c) => {
                      const isOperator = c.is_operator === true;
                      return (
                      <li key={c.id} className="space-y-0">
                        <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                          isOperator 
                            ? "border-amber-500/40 bg-amber-500/10 text-zinc-100 shadow-[0_0_12px_rgba(245,158,11,0.15)]" 
                            : "border-zinc-800 bg-zinc-900/80 text-zinc-200"
                        }`}>
                          <div className="mb-1 flex items-center gap-2 text-[11px]">
                            <span className={`font-bold shrink-0 ${isOperator ? "text-amber-400" : "text-amber-300"}`}>
                              {jurorLabels[getCommentLabelKey(c)] ?? "배심원"}
                              {!isOperator && maskCommentIp(c.ip_address) ? ` (${maskCommentIp(c.ip_address)})` : ""}
                            </span>
                            {isOperator ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-black text-amber-200 border border-amber-500/50">
                                ⚖️ 대법관
                              </span>
                            ) : null}
                            {c.is_post_author ? (
                              <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                                작성자
                              </span>
                            ) : null}
                          </div>
                          <div className={isOperator ? "font-semibold" : ""}>{c.content}</div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                              {c.created_at ? (
                                <span>
                                  {new Date(c.created_at).toLocaleString("ko-KR", {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const r = await fetch(`/api/comments/${c.id}/like`, {
                                      method: "POST",
                                    });
                                    const data = (await r.json()) as { likes?: number; liked?: boolean };
                                    if (r.ok && typeof data.likes === "number") {
                                      setComments((prev) =>
                                        prev.map((cc) =>
                                          cc.id === c.id ? { ...cc, likes: data.likes! } : cc,
                                        ),
                                      );
                                      setLikedCommentIds((prev) => {
                                        const next = new Set(prev);
                                        if (data.liked) next.add(c.id);
                                        else next.delete(c.id);
                                        return next;
                                      });
                                    }
                                  } catch {}
                                }}
                                className={`flex items-center gap-1 text-[11px] ${
                                  likedCommentIds.has(c.id) ? "text-amber-400 font-bold" : "text-zinc-500 hover:text-zinc-300"
                                }`}
                              >
                                <span>🐾</span>
                                <span>{c.likes}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setReplyToId(replyToId === c.id ? null : c.id)}
                                className="flex items-center gap-1 text-[11px] hover:text-zinc-300"
                                aria-label={replyToId === c.id ? "답글 취소" : "답글"}
                              >
                                <span aria-hidden>💬</span>
                                {replyToId === c.id ? "취소" : ""}
                              </button>
                            </div>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() =>
                                  setCommentMenuOpenId((prev) => (prev === c.id ? null : c.id))
                                }
                                className="px-1 text-zinc-500 hover:text-zinc-300"
                                aria-label="댓글 메뉴"
                              >
                                ⋯
                              </button>
                              {commentMenuOpenId === c.id ? (
                                <div className="absolute right-0 mt-1 w-28 rounded-md border border-zinc-800 bg-zinc-900 py-1 text-[11px] text-zinc-200 shadow-lg z-[150]">
                                  {isOperatorLoggedIn ? (
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (!confirm("이 댓글을 삭제하시겠습니까?")) return;
                                        try {
                                          const r = await fetch(`/api/admin/delete?type=comment&id=${c.id}`, { method: "DELETE" });
                                          if (r.ok) setComments((prev) => prev.filter((cc) => cc.id !== c.id));
                                        } catch (err) { console.error("삭제 실패:", err); }
                                        setCommentMenuOpenId(null);
                                      }}
                                      className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
                                    >
                                      ⚖️ 삭제
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setCommentDeleteTargetId(c.id); setCommentMenuOpenId(null); }}
                                        className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
                                      >
                                        댓글 삭제
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); openReportModal("comment", c.id); setCommentMenuOpenId(null); }}
                                        className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800"
                                      >
                                        신고하기
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        {(commentTree.byParent.get(c.id) ?? []).map((reply) => {
                          const isReplyOperator = reply.is_operator === true;
                          return (
                          <div
                            key={reply.id}
                            className={`ml-6 pl-4 py-2 border-l-2 rounded-r-lg relative cursor-pointer transition ${
                              isReplyOperator
                                ? "border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.1)]"
                                : "border-amber-500/30 bg-zinc-900/50 hover:bg-zinc-800/50"
                            }`}
                            onClick={() => {
                              setReplyToId(reply.id);
                            }}
                          >
                            <span
                              className={`absolute -left-[0.6rem] top-2.5 text-sm font-bold leading-none ${
                                isReplyOperator ? "text-amber-400" : "text-amber-500/80"
                              }`}
                              aria-hidden
                            >
                              ㄴ
                            </span>
                            <div className="pl-2">
                              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                                {!isReplyOperator ? (
                                  <span className="font-bold shrink-0 whitespace-nowrap text-amber-500/80 text-[10px] sm:text-[11px]">
                                    {jurorLabels[getCommentLabelKey(reply)] ?? "배심원"}
                                    {!isReplyOperator && maskCommentIp(reply.ip_address) ? ` (${maskCommentIp(reply.ip_address)})` : ""}
                                  </span>
                                ) : null}
                                {isReplyOperator ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/30 px-1.5 py-0.5 text-[9px] font-black text-amber-200 border border-amber-500/50">
                                    ⚖️ 대법관
                                  </span>
                                ) : null}
                                {reply.is_post_author ? (
                                  <span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-amber-300 whitespace-nowrap">
                                    작성자
                                  </span>
                                ) : null}
                              </div>
                              <p className={`text-sm leading-relaxed whitespace-pre-wrap ${
                                isReplyOperator ? "text-zinc-100 font-semibold" : "text-zinc-300"
                              }`}>
                                {reply.content}
                              </p>
                              <div className="mt-1 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                                  {reply.created_at ? (
                                    <span>
                                      {new Date(reply.created_at).toLocaleString("ko-KR", {
                                        dateStyle: "short",
                                        timeStyle: "short",
                                      })}
                                    </span>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        const r = await fetch(`/api/comments/${reply.id}/like`, {
                                          method: "POST",
                                        });
                                        const data = (await r.json()) as { likes?: number; liked?: boolean };
                                        if (r.ok && typeof data.likes === "number") {
                                          setComments((prev) =>
                                            prev.map((cc) =>
                                              cc.id === reply.id
                                                ? { ...cc, likes: data.likes! }
                                                : cc,
                                            ),
                                          );
                                          setLikedCommentIds((prev) => {
                                            const next = new Set(prev);
                                            if (data.liked) next.add(reply.id);
                                            else next.delete(reply.id);
                                            return next;
                                          });
                                        }
                                      } catch {}
                                    }}
                                    className={`flex items-center gap-1 text-[11px] ${
                                      likedCommentIds.has(reply.id) ? "text-amber-400 font-bold" : "text-zinc-500 hover:text-zinc-300"
                                    }`}
                                  >
                                    <span>🐾</span>
                                    <span>{reply.likes}</span>
                                  </button>
                                  {!isReplyOperator ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCommentDeleteTargetId(reply.id);
                                        setCommentMenuOpenId(null);
                                      }}
                                      className="text-[11px] text-zinc-500 hover:text-red-400 whitespace-nowrap"
                                    >
                                      삭제
                                    </button>
                                  ) : null}
                                </div>
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCommentMenuOpenId((prev) =>
                                        prev === reply.id ? null : reply.id,
                                      );
                                    }}
                                    className="px-1 text-zinc-500 hover:text-zinc-300"
                                    aria-label="댓글 메뉴"
                                  >
                                    ⋯
                                  </button>
                                  {commentMenuOpenId === reply.id ? (
                                    <div className="absolute right-0 mt-1 w-28 rounded-md border border-zinc-800 bg-zinc-900 py-1 text-[11px] text-zinc-200 shadow-lg z-[150]">
                                      {isOperatorLoggedIn ? (
                                        <button
                                          type="button"
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!confirm("이 댓글을 삭제하시겠습니까?")) return;
                                            try {
                                              const r = await fetch(`/api/admin/delete?type=comment&id=${reply.id}`, { method: "DELETE" });
                                              if (r.ok) setComments((prev) => prev.filter((cc) => cc.id !== reply.id));
                                            } catch (err) { console.error("삭제 실패:", err); }
                                            setCommentMenuOpenId(null);
                                          }}
                                          className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
                                        >
                                          ⚖️ 삭제
                                        </button>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setCommentDeleteTargetId(reply.id); setCommentMenuOpenId(null); }}
                                            className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
                                          >
                                            댓글 삭제
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => { openReportModal("comment", reply.id); setCommentMenuOpenId(null); }}
                                            className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800"
                                          >
                                            신고하기
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </li>
                      );
                    })}
                  </ul>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 판결문 삭제 비밀번호 모달 */}
      {deletePostId ? (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-950 border border-zinc-800 p-5 space-y-4">
            <h4 className="text-sm font-black text-zinc-100">판결문 삭제</h4>
            <p className="text-xs text-zinc-400">
              기소 시 설정한 판결문 삭제 비밀번호를 입력하세요.
            </p>
            <input
              ref={deletePasswordRef}
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (deletePassword.trim()) handleDeletePost(deletePostId, deletePassword);
                }
                if (e.key === "Escape") closeDeleteModal();
              }}
              placeholder="판결문 삭제 비밀번호"
              maxLength={20}
              autoComplete="current-password"
              disabled={deleteSubmitting}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 outline-none disabled:opacity-60"
            />
            <p className="text-[11px] text-zinc-500">*작성 후 삭제 시 사용하므로 반드시 기억해주세요.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteSubmitting}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => handleDeletePost(deletePostId, deletePassword)}
                disabled={!deletePassword.trim() || deleteSubmitting}
                className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteSubmitting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 댓글/대댓글 삭제 비밀번호 모달 (판결문 모달 위에 표시) */}
      {commentDeleteTargetId ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-950 border border-zinc-800 p-5 space-y-4">
            <h4 className="text-sm font-black text-zinc-100">댓글 삭제</h4>
            <p className="text-xs text-zinc-400">작성 시 입력한 삭제 비밀번호를 입력하세요.</p>
            {commentDeleteError ? (
              <p className="text-xs text-red-400">{commentDeleteError}</p>
            ) : null}
            <input
              ref={commentDeletePasswordRef}
              type="password"
              value={commentDeletePassword}
              onChange={(e) => setCommentDeletePassword(e.target.value)}
              disabled={commentDeleteSubmitting}
              placeholder="삭제 비밀번호"
              maxLength={20}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-amber-500/60"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setCommentDeleteTargetId(null);
                  setCommentDeletePassword("");
                  setCommentDeleteError(null);
                }}
                disabled={commentDeleteSubmitting}
                className="flex-1 rounded-xl border border-zinc-600 px-4 py-2.5 text-sm font-bold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!commentDeleteTargetId || !commentDeletePassword.trim()) return;
                  setCommentDeleteSubmitting(true);
                  setCommentDeleteError(null);
                  try {
                    const r = await fetch(`/api/comments/${commentDeleteTargetId}`, {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ password: commentDeletePassword.trim() }),
                    });
                    const data = (await r.json()) as { ok?: boolean; error?: string };
                    if (r.ok && data.ok) {
                      setComments((prev) => prev.filter((cc) => cc.id !== commentDeleteTargetId));
                      setCommentDeleteTargetId(null);
                      setCommentDeletePassword("");
                    } else {
                      setCommentDeleteError(data.error ?? "삭제에 실패했습니다.");
                    }
                  } catch (err) {
                    setCommentDeleteError("삭제 요청 중 오류가 발생했습니다.");
                  } finally {
                    setCommentDeleteSubmitting(false);
                  }
                }}
                disabled={!commentDeletePassword.trim() || commentDeleteSubmitting}
                className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {commentDeleteSubmitting ? "삭제 중..." : "확인"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* 신고 사유 선택 모달 (메인 페이지와 동일) */}
      {reportTarget.type && reportTarget.id ? (
        <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-950 border border-zinc-800 p-5 space-y-4">
            <h4 className="text-sm font-black text-zinc-100">신고 사유 선택</h4>
            <p className="text-xs text-zinc-400">
              신고 사유를 선택해 주세요.
            </p>
            <select
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 outline-none"
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
            >
              <option>욕설/비하</option>
              <option>음란물</option>
              <option>도배</option>
              <option>부적절한 홍보</option>
              <option>기타</option>
            </select>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeReportModal}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!reportTarget.type || !reportTarget.id) return;
                  await handleReport(reportTarget.type, reportTarget.id, reportReason);
                  closeReportModal();
                }}
                className="rounded-xl bg-red-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-red-400"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Accuse Modal — 배경 스크롤 차단, 모달 내부만 스크롤 */}
      {isAccuseOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden p-4"
          role="dialog"
          aria-modal="true"
          aria-label="기소하기"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/70 touch-none"
            aria-label="모달 닫기"
            onClick={closeAccuse}
          />

          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] border border-zinc-800 bg-zinc-950 shadow-[0_0_60px_rgba(0,0,0,0.7)]">
            <div className="p-6 md:p-8 border-b border-zinc-900 flex items-start justify-between gap-6">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-black tracking-widest uppercase text-amber-500">
                  <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_18px_rgba(245,158,11,0.6)]" />
                  사건 접수
                </div>
                <h2 className="mt-2 text-2xl md:text-3xl font-black tracking-tighter">
                  기소장 작성
                </h2>
                <p className="mt-2 text-sm md:text-base text-zinc-500 font-medium leading-relaxed">
                  팩폭 전문 AI 판사가 기록만 봅니다. <span className="text-zinc-300">감정은 증거가 아닙니다.</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeAccuse}
                className="shrink-0 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-black text-zinc-200 hover:border-amber-500/50 hover:text-amber-500 transition"
                aria-label="닫기"
              >
                닫기
              </button>
            </div>

            <form onSubmit={onSubmit} className="p-6 md:p-8 space-y-5">
              <div className="grid gap-5">
                <div>
                  <label className="block text-xs font-black tracking-widest uppercase text-zinc-400">
                    사건 제목
                  </label>
                  <input
                    ref={firstFieldRef}
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    disabled={isReviewing}
                    className="mt-2 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition"
                    placeholder="예: 술자리에서 한 말로 3일째 싸우는 중"
                    maxLength={80}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-black tracking-widest uppercase text-zinc-400">
                    카테고리
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    disabled={isReviewing}
                    className="mt-2 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition"
                    required
                  >
                    <option value="">카테고리를 선택하세요</option>
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black tracking-widest uppercase text-zinc-400">
                    상세 내용
                  </label>
                  <textarea
                    value={form.details}
                    onChange={(e) => setForm((p) => ({ ...p, details: e.target.value }))}
                    disabled={isReviewing}
                    className="mt-2 w-full min-h-[160px] resize-y rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition"
                    placeholder="예: 회식 날 술자리에서 친구가 한 말 때문에 3일째 말도 안 하고 싸우는 중입니다. 그때 한 말이 너무 기억나서 화가 나요. AI 판사님께 공정한 판결 부탁드립니다."
                    maxLength={5000}
                    required
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-zinc-600">
                    <span>허위 진술은 양심에 처벌됩니다.</span>
                    <span>
                      {form.details.length.toLocaleString()}/5,000
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black tracking-widest uppercase text-zinc-400">
                    증거 이미지 (선택, 최대 {MAX_IMAGES}장)
                  </label>
                  <p className="mt-1 text-xs text-zinc-500 mb-2">JPG, PNG, GIF, WebP · 각 5MB 이하</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    multiple
                    disabled={isReviewing}
                    onChange={(e) => {
                      const list = Array.from(e.target.files ?? []);
                      const next = list.slice(0, MAX_IMAGES);
                      imagePreviewUrls.forEach((u) => URL.revokeObjectURL(u));
                      setImageFiles(next);
                      setImagePreviewUrls(next.map((f) => URL.createObjectURL(f)));
                      setUploadError(null);
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isReviewing || imageFiles.length >= MAX_IMAGES}
                    className="mt-2 w-full rounded-2xl border border-zinc-800 bg-amber-500 px-4 py-3 text-black font-bold cursor-pointer hover:bg-amber-400 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {imageFiles.length >= MAX_IMAGES ? `최대 ${MAX_IMAGES}장까지` : "파일 선택 (여러 장 가능)"}
                  </button>
                  {imagePreviewUrls.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {imagePreviewUrls.map((url, i) => (
                        <div key={url} className="relative">
                          <img
                            src={url}
                            alt={`미리보기 ${i + 1}`}
                            className="h-24 w-24 rounded-xl object-cover border border-zinc-800"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const nextFiles = imageFiles.filter((_, j) => j !== i);
                              const nextUrls = imagePreviewUrls.filter((_, j) => j !== i);
                              URL.revokeObjectURL(url);
                              setImageFiles(nextFiles);
                              setImagePreviewUrls(nextUrls);
                            }}
                            disabled={isReviewing}
                            className="absolute -top-1 -right-1 rounded-full bg-zinc-800 border border-zinc-700 w-6 h-6 text-xs font-bold text-zinc-300 hover:bg-red-600 hover:border-red-500 hover:text-white transition"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {uploadError ? (
                    <p className="mt-2 text-sm text-red-400">{uploadError}</p>
                  ) : null}
                </div>

                <div>
                  <label className="block text-xs font-black tracking-widest uppercase text-zinc-400">
                    판결문 삭제 비밀번호
                  </label>
                  <p className="mt-1 text-xs text-zinc-500 mb-2">나중에 판결문을 삭제할 때 사용할 비밀번호입니다.</p>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    disabled={isReviewing}
                    className="mt-2 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition"
                    placeholder="판결문 삭제 비밀번호"
                    maxLength={20}
                    required
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">*작성 후 삭제 시 사용하므로 반드시 기억해주세요.</p>
                </div>
              </div>

              {judgeError ? (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200 font-bold">
                  {judgeError}
                </div>
              ) : null}

              {isReviewing ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-amber-200">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-5 w-5 rounded-full border-2 border-amber-300/30 border-t-amber-300 animate-spin"
                      aria-hidden="true"
                    />
                    <div className="font-black">AI 판사가 기록을 검토 중입니다...</div>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div className="h-3 w-5/6 rounded-full bg-amber-200/10 animate-pulse" />
                    <div className="h-3 w-4/6 rounded-full bg-amber-200/10 animate-pulse" />
                    <div className="h-3 w-3/6 rounded-full bg-amber-200/10 animate-pulse" />
                  </div>
                </div>
              ) : null}

              {judgeResult ? (
                <div
                  ref={verdictDetailRef}
                  className="rounded-[2rem] border border-zinc-800 bg-zinc-950/60 p-5 md:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="inline-flex items-center gap-2 text-xs font-black tracking-widest uppercase">
                        <span className="text-amber-500">판결문</span>
                        {judgeResult.mock ? (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                            MOCK
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
                            LIVE
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setJudgeResult(null);
                        setJudgeError(null);
                      }}
                      className="shrink-0 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-black text-zinc-200 hover:bg-zinc-800 transition"
                    >
                      다시 작성
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                      <div className="text-xs font-black tracking-widest uppercase text-zinc-400">
                        1. 사건 개요
                      </div>
                      <div className="mt-2 text-sm md:text-base text-zinc-100 leading-relaxed whitespace-pre-wrap">
                        {judgeResult.verdict.title}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                      <div className="text-xs font-black tracking-widest uppercase text-amber-200">
                        2. 최종 선고
                      </div>
                      <div className="mt-2 text-sm md:text-base font-bold leading-relaxed">
                        {(() => {
                          const def = Number(judgeResult.verdict.ratio?.defendant) ?? 50;
                          if (def === 50) {
                            return <span className="text-amber-200">판결 유보 : 판단 불가</span>;
                          }
                          const isGuilty = def > 50;
                          return (
                            <span className={isGuilty ? "text-red-300" : "text-blue-300"}>
                              피고인 {isGuilty ? "유죄" : "무죄"}
                            </span>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                      <div className="text-xs font-black tracking-widest uppercase text-zinc-400">
                        3. 선고문 (상세 근거)
                      </div>
                      <div className="mt-2 text-sm md:text-base text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {judgeResult.verdict.ratio.rationale}
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-2" aria-live="polite">
                      본 선고는 참고용이며, 법적 효력이 없습니다.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-col md:flex-row gap-3 md:gap-4 justify-end pt-2">
                <button
                  type="button"
                  onClick={closeAccuse}
                  disabled={isReviewing}
                  className="w-full md:w-auto rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-4 font-black text-zinc-200 hover:bg-zinc-800 transition disabled:opacity-60"
                >
                  취소
                </button>
                {judgeResult ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (createdPostId) {
                        if (typeof window !== "undefined") {
                          window.location.href = `/?post=${createdPostId}`;
                        }
                      } else {
                        verdictDetailRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }
                    }}
                    className="w-full md:w-auto rounded-2xl bg-amber-500 px-6 py-4 font-black text-black hover:bg-amber-400 transition"
                  >
                    판결문 상세보기
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full md:w-auto rounded-2xl bg-amber-500 px-6 py-4 font-black text-black hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    판결 요청
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function OngoingTrialsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 flex items-center justify-center"><span className="text-zinc-500">로딩 중...</span></div>}>
      <OngoingTrialsContent />
    </Suspense>
  );
}
