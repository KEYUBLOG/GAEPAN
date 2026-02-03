"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Noto_Serif_KR } from "next/font/google";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const notoSerif = Noto_Serif_KR({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

function SealIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="16" cy="16" r="13" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 8v6l4 2 2 6-6-3-6 3 2-6 4-2z"
      />
    </svg>
  );
}

const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;

function isVotingOpen(createdAt: string | null, votingEndedAt?: string | null): boolean {
  if (votingEndedAt) return false;
  if (!createdAt) return false;
  return Date.now() < new Date(createdAt).getTime() + TRIAL_DURATION_MS;
}

function getVotingEndWeek(createdAt: string | null): { year: number; week: number } | null {
  if (!createdAt) return null;
  const endMs = new Date(createdAt).getTime() + TRIAL_DURATION_MS;
  const d = new Date(endMs);
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((endMs - start.getTime()) / 86400000);
  const week = Math.ceil((days + d.getDay() + 1) / 7);
  return { year: d.getFullYear(), week: Math.min(week, 53) };
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
};

type Comment = {
  id: string;
  content: string;
  created_at: string | null;
  parent_id: string | null;
  author_id: string | null;
  likes: number;
  is_operator?: boolean;
};

export default function HallOfFamePage() {
  const [posts, setPosts] = useState<PostPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<PostPreview | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
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
  const [commentSort, setCommentSort] = useState<"latest" | "popular">("latest");
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const [commentMenuOpenId, setCommentMenuOpenId] = useState<string | null>(null);
  const [postMenuOpenId, setPostMenuOpenId] = useState<string | null>(null);
  const [isOperatorLoggedIn, setIsOperatorLoggedIn] = useState(false);
  const [jurorLabels, setJurorLabels] = useState<Record<string, string>>({});
  const [reportTarget, setReportTarget] = useState<{
    type: "post" | "comment" | null;
    id: string | null;
  }>({ type: null, id: null });
  const [reportReason, setReportReason] = useState<string>("욕설/비하");
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
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const CATEGORY_OPTIONS = ["연애", "직장생활", "가족", "친구", "이웃/매너", "사회이슈", "기타"] as const;
  const [form, setForm] = useState({
    title: "",
    details: "",
    password: "",
    category: "",
    trial_type: "" as "" | "DEFENSE" | "ACCUSATION",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const firstFieldRef = React.useRef<HTMLInputElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const commentDeletePasswordRef = React.useRef<HTMLInputElement | null>(null);

  // 게시글 로드
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error: listError } = await supabase
          .from("posts")
          .select("*")
          .neq("status", "판결불가")
          .order("created_at", { ascending: false })
          .limit(100);

        if (listError) throw listError;

        const toPostPreview = (row: Record<string, unknown>): PostPreview => ({
          id: String(row.id ?? ""),
          title: (row.title as string) ?? "",
          plaintiff: (row.plaintiff as string | null) ?? null,
          defendant: (row.defendant as string | null) ?? null,
          content: (row.content as string | null) ?? null,
          verdict: (row.verdict as string) ?? "",
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
        });

        const allPosts = (data ?? []).map((row) => toPostPreview(row as Record<string, unknown>));
        setPosts(allPosts);
      } catch (err) {
        setError(err instanceof Error ? err.message : "명예의 전당 목록을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

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

  // 배심원 라벨링
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
      const key = c.author_id ?? "__anon__";
      if (selectedPost.author_id && key === selectedPost.author_id) {
        if (!map[key]) {
          map[key] = "원고";
        }
      } else {
        if (!map[key]) {
          map[key] = `배심원 ${idx++}`;
        }
      }
    }
    setJurorLabels(map);
  }, [comments, selectedPost?.author_id]);

  useEffect(() => {
    if (!commentDeleteTargetId) return;
    setCommentDeletePassword("");
    setCommentDeleteError(null);
    const t = setTimeout(() => commentDeletePasswordRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [commentDeleteTargetId]);

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
      return (
        new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime()
      );
    });
    const top = sorted.filter((c) => !c.parent_id);
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

  // 주차별 명예의 전당 계산
  const weeklyWinners = useMemo(() => {
    const ended = posts.filter((p) => !isVotingOpen(p.created_at, p.voting_ended_at) && p.guilty > 0);
    const byWeek = new Map<string, { year: number; week: number; post: typeof ended[0] }>();
    for (const p of ended) {
      const key = getVotingEndWeek(p.created_at);
      if (!key) continue;
      const k = `${key.year}-${key.week}`;
      const cur = byWeek.get(k);
      if (!cur || p.guilty > cur.post.guilty) byWeek.set(k, { ...key, post: p });
    }
    return Array.from(byWeek.values()).sort((a, b) => b.year - a.year || b.week - a.week);
  }, [posts]);

  const closeAccuse = () => {
    setIsReviewing(false);
    setIsAccuseOpen(false);
    setJudgeError(null);
    setImageFile(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setUploadError(null);
    setForm({ title: "", details: "", password: "", category: "", trial_type: "" });
  };

  const openAccuse = () => {
    setIsAccuseOpen(true);
    setIsReviewing(false);
    setJudgeResult(null);
    setJudgeError(null);
    setUploadError(null);
  };

  const canSubmit = React.useMemo(() => {
    const ok =
      form.title.trim().length > 0 &&
      form.details.trim().length > 0 &&
      form.password.trim().length > 0 &&
      form.category.trim().length > 0 &&
      (form.trial_type === "DEFENSE" || form.trial_type === "ACCUSATION");
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
      setJudgeError("삭제 비밀번호를 입력해 주세요.");
      return;
    }

    setIsReviewing(true);
    setJudgeResult(null);
    setJudgeError(null);

    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        setUploadError(null);
        const fd = new FormData();
        fd.append("file", imageFile);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
        const uploadData = (await uploadRes.json()) as { url?: string; error?: string };
        if (!uploadRes.ok) {
          setUploadError(uploadData.error ?? "이미지 업로드 실패");
          return;
        }
        imageUrl = uploadData.url ?? null;
      }

      const r = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          details: form.details,
          image_url: imageUrl,
          password: form.password,
          category: form.category,
          trial_type: form.trial_type,
        }),
      });

      type JudgeApiResponse =
        | { ok: true; mock?: boolean; verdict: { title: string; ratio: { plaintiff: number; defendant: number; rationale: string }; verdict: string } }
        | { ok: true; status: "판결불가"; verdict: null }
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
        setJudgeError("금지어 또는 부적절한 내용이 포함되어 판결이 불가합니다.");
        return;
      }

      setJudgeResult({ mock: (data as any).mock ?? false, verdict: (data as any).verdict });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      setJudgeError(msg);
    } finally {
      setIsReviewing(false);
    }
  };

  return (
    <div className={`min-h-screen bg-black ${notoSerif.className}`}>
      {/* 네비게이션 */}
      <nav className="p-6 border-b border-zinc-900 flex justify-between items-center sticky top-0 bg-zinc-950/80 backdrop-blur-md z-50 font-sans">
        <Link href="/" className="text-2xl font-black tracking-tighter text-amber-500 italic">
          GAEPAN
        </Link>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={openAccuse}
            className="bg-amber-600 hover:bg-amber-500 text-black px-4 py-2 rounded-full text-sm font-bold transition"
          >
            지금 기소하기
          </button>
          <Link
            href="/"
            className="text-sm font-bold text-zinc-400 hover:text-amber-500 transition"
          >
            메인으로
          </Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto py-12 px-6">
        <div className="mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-amber-400 mb-2 tracking-tight">
            명예의 전당
          </h1>
          <p className="text-amber-400/80 text-sm md:text-base font-medium">
            매주 &apos;금주의 개판&apos; 1위로 선정된 공식 판결 기록입니다.
          </p>
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
        ) : weeklyWinners.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            아직 기록된 주차가 없습니다.
          </div>
        ) : (
          <div className="rounded-[2rem] border border-amber-500/20 bg-zinc-950/50 p-6 md:p-8">
            <ul className="space-y-5">
              {weeklyWinners.map(({ year, week, post }) => (
                <li key={`${year}-${week}`}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPost(post)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedPost(post)}
                    className="relative block rounded-2xl border border-amber-500/30 bg-zinc-900 p-5 md:p-6 transition-all cursor-pointer hover:shadow-[0_0_20px_rgba(251,191,36,0.2)]"
                  >
                    <div className="absolute top-4 right-4 text-amber-500/90">
                      <SealIcon className="w-8 h-8 md:w-9 md:h-9" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pr-10">
                      <span className="text-amber-500 font-bold">
                        {year}년 제{week}주
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400/90">
                        🏛️ 공식 판결 기록
                      </span>
                    </div>
                    <p className="font-bold text-zinc-100 mt-3 line-clamp-1 text-base md:text-lg">
                      {post.title}
                    </p>
                    <p className="text-xs tracking-widest text-zinc-500 mt-2 uppercase">
                      {post.trial_type === "DEFENSE"
                        ? `무죄 ${post.not_guilty}표 · 유죄 ${post.guilty}표`
                        : `유죄 ${post.guilty}표 · 무죄 ${post.not_guilty}표`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
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
              <button
                type="button"
                onClick={() => setSelectedPost(null)}
                className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-800 transition"
              >
                닫기
              </button>
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
                if (selectedPost.trial_type === "DEFENSE") {
                  isAuthorVictory = selectedPost.not_guilty > selectedPost.guilty;
                } else if (selectedPost.trial_type === "ACCUSATION") {
                  isAuthorVictory = selectedPost.guilty > selectedPost.not_guilty;
                } else {
                  isAuthorVictory = aiRatio >= 50;
                }
                
                const authorName = selectedPost.plaintiff === "익명" && selectedPost.defendant === "익명"
                  ? "익명의 배심원"
                  : selectedPost.plaintiff && selectedPost.defendant
                  ? `${selectedPost.plaintiff}·${selectedPost.defendant}`
                  : selectedPost.plaintiff || selectedPost.defendant || "익명의 배심원";
                
                return (
                  <>
                    {selectedPost.image_url ? (
                      <div>
                        <a
                          href={selectedPost.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900"
                        >
                          <img
                            src={selectedPost.image_url}
                            alt="첨부 증거"
                            className="w-full h-auto max-h-[min(36vh,280px)] object-contain bg-zinc-900"
                          />
                        </a>
                        <div className="text-xs font-black tracking-widest uppercase text-zinc-500 mt-2">첨부 이미지</div>
                      </div>
                    ) : null}
                    <div className="flex items-start justify-between gap-4 mb-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-black tracking-widest uppercase text-zinc-500">사건 제목</span>
                        </div>
                        <h4 className="text-xl md:text-2xl font-bold text-zinc-100">{selectedPost.title}</h4>
                      </div>
                      <span className="text-xs font-black tracking-widest uppercase text-zinc-500 shrink-0">
                        사건 번호 {selectedPost.case_number != null ? selectedPost.case_number : "—"}
                      </span>
                    </div>
                    
                    {/* 판결 완료 시 승소/패소 UI */}
                    {isFinished && total > 0 ? (
                      <div className={`rounded-2xl border-2 p-8 mb-6 relative overflow-hidden ${
                        isAuthorVictory
                          ? "border-[#FFD700]/60 bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent shadow-[0_0_40px_rgba(255,215,0,0.3)]"
                          : "border-zinc-600 bg-zinc-900/50"
                      }`}>
                        <div className={`absolute top-4 right-4 transform rotate-12 ${
                          isAuthorVictory ? "border-[#FFD700]" : "border-zinc-600"
                        } border-2 px-3 py-1 rounded`}>
                          <span className={`text-xs font-black ${
                            isAuthorVictory ? "text-[#FFD700]" : "text-zinc-500"
                          }`}>
                            [판결 확정]
                          </span>
                        </div>
                        
                        <div className="text-center py-8">
                          <div className={`font-black text-5xl mb-4 ${
                            isAuthorVictory
                              ? "text-[#FFD700] bg-gradient-to-r from-[#FFD700] to-amber-500 bg-clip-text text-transparent"
                              : "text-zinc-500"
                          }`}>
                            {isAuthorVictory ? "🏆 최종 승소" : "🔨 최종 패소"}
                          </div>
                          
                          <p className={`text-base font-bold mt-4 ${
                            isAuthorVictory ? "text-amber-300" : "text-zinc-400"
                          }`}>
                            {isAuthorVictory
                              ? selectedPost.trial_type === "DEFENSE"
                                ? `${authorName}의 항변이 받아들여졌습니다! [최종 승소]`
                                : `${authorName}의 기소가 성공했습니다! [최종 승소]`
                              : `배심원단이 ${authorName}의 주장을 기각했습니다. [최종 패소]`
                            }
                          </p>
                          
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
                    ) : null}
                  </>
                );
              })()}
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                {selectedPost.plaintiff === "익명" && selectedPost.defendant === "익명" ? (
                  <span>익명</span>
                ) : (
                  <>
                    {selectedPost.plaintiff ? <span>원고 {selectedPost.plaintiff}</span> : null}
                    {selectedPost.plaintiff && selectedPost.defendant ? <span>·</span> : null}
                    {selectedPost.defendant ? <span>피고 {selectedPost.defendant}</span> : null}
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
                    <div className="absolute right-0 mt-1 w-32 rounded-md border border-zinc-800 bg-zinc-900 py-1 text-[11px] text-zinc-200 shadow-lg z-20">
                      {isOperatorLoggedIn ? (
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
                            }
                            setPostMenuOpenId(null);
                          }}
                          className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
                        >
                          ⚖️ 삭제
                        </button>
                      ) : (
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
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
              {selectedPost.content ? (
                <div>
                  <div className="text-xs font-black tracking-widest uppercase text-zinc-500 mb-2">사건 경위 (상세 내용)</div>
                  <p className="text-base text-zinc-300 leading-relaxed whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3">
                    {selectedPost.content}
                  </p>
                </div>
              ) : null}
              
              {/* AI 판결 기준 유무죄 % - 무죄주장/원고 무죄면 무죄 앞, 무죄 100% */}
              {(() => {
                const isFinished = !isVotingOpen(selectedPost.created_at, selectedPost.voting_ended_at);
                const aiRatio = selectedPost.ratio ?? 50;
                const verdictText = typeof selectedPost.verdict === "string" ? selectedPost.verdict : "";
                const isDefense =
                  selectedPost.trial_type === "DEFENSE" ||
                  (verdictText.includes("원고 무죄") && selectedPost.trial_type !== "ACCUSATION");
                const notGuiltyPct = isDefense ? aiRatio : 100 - aiRatio;
                const guiltyPct = isDefense ? 100 - aiRatio : aiRatio;
                
                if (isFinished) {
                  return (
                    <div className="text-xs text-zinc-600 text-center mb-4">
                      AI 판결: {isDefense ? "무죄" : "유죄"} {notGuiltyPct}% · {isDefense ? "유죄" : "무죄"} {guiltyPct}%
                    </div>
                  );
                }
                
                return (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 mb-4">
                    <div className="text-xs font-black tracking-widest uppercase text-zinc-400 mb-3">AI 판결</div>
                    <div className="flex items-center justify-center gap-6">
                      <div className="text-center">
                        <div className={`text-2xl md:text-3xl font-black mb-1 ${isDefense ? "text-blue-400" : "text-red-400"}`}>
                          {isDefense ? "무죄" : "유죄"} {notGuiltyPct}%
                        </div>
                        <div className="text-xs text-zinc-500">{isDefense ? "원고 무죄" : "피고 과실"}</div>
                      </div>
                      <div className="text-zinc-600 text-xl">vs</div>
                      <div className="text-center">
                        <div className={`text-2xl md:text-3xl font-black mb-1 ${isDefense ? "text-red-400" : "text-blue-400"}`}>
                          {isDefense ? "유죄" : "무죄"} {guiltyPct}%
                        </div>
                        <div className="text-xs text-zinc-500">{isDefense ? "피고 과실" : "원고 과실"}</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              
              {/* 최종 판결 */}
              {!isVotingOpen(selectedPost.created_at, selectedPost.voting_ended_at) ? (
                <div className="rounded-2xl border-2 border-amber-500/40 bg-amber-500/15 px-5 py-5 shadow-[0_0_24px_rgba(245,158,11,0.12)]">
                  <div className="text-xs font-black tracking-widest uppercase text-amber-300 mb-3">최종 판결</div>
                  <p className="text-lg md:text-xl font-bold text-amber-50 leading-relaxed whitespace-pre-wrap">
                    {selectedPost.verdict}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border-2 border-amber-500/40 bg-amber-500/15 px-5 py-5 shadow-[0_0_24px_rgba(245,158,11,0.12)]">
                  <div className="text-xs font-black tracking-widest uppercase text-amber-300 mb-3">AI 판결</div>
                  <p className="text-lg md:text-xl font-bold text-amber-50 leading-relaxed whitespace-pre-wrap">
                    {selectedPost.verdict}
                  </p>
                </div>
              )}

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
                            <p className="text-sm font-bold text-amber-200">
                              {aiVerdict}({aiPct}%)
                            </p>
                            <div className="mt-2 h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                              <div className="bg-amber-500 h-full" style={{ width: `${aiPlaintiffPct}%` }} />
                              <div className="bg-zinc-600 h-full" style={{ width: `${aiDefendantPct}%` }} />
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-1">원고 {aiPlaintiffPct}% / 피고 {aiDefendantPct}%</p>
                          </div>
                          <div className="rounded-xl border border-zinc-600 bg-zinc-800/50 p-3">
                            <p className="text-[10px] font-bold uppercase text-zinc-400 mb-1">배심원단</p>
                            <p className="text-sm font-bold text-zinc-200">
                              {juryVerdict}({juryPct}%)
                            </p>
                            <div className="mt-2 h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                              <div className="bg-red-500/70 h-full" style={{ width: `${juryGuiltyPct}%` }} />
                              <div className="bg-zinc-600 h-full" style={{ width: `${juryNotGuiltyPct}%` }} />
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-1">유죄 {juryGuiltyPct}% / 무죄 {juryNotGuiltyPct}%</p>
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

              {/* 배심원 한마디 */}
              <div className="border-t border-zinc-800 pt-6">
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
                    placeholder="삭제 비밀번호 (삭제 시 필요, 20자 이내)"
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
                            <span className={`font-bold ${isOperator ? "text-amber-400" : "text-amber-300"}`}>
                              {jurorLabels[c.author_id ?? "__anon__"] ?? "배심원"}
                            </span>
                            {isOperator ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-black text-amber-200 border border-amber-500/50">
                                ⚖️ 대법관
                              </span>
                            ) : null}
                            {selectedPost.author_id && c.author_id === selectedPost.author_id ? (
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
                                <div className="absolute right-0 mt-1 w-28 rounded-md border border-zinc-800 bg-zinc-900 py-1 text-[11px] text-zinc-200 shadow-lg z-20">
                                  {isOperatorLoggedIn ? (
                                    <button
                                      type="button"
                                      onClick={async () => {
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
                                        onClick={() => { setCommentDeleteTargetId(c.id); setCommentMenuOpenId(null); }}
                                        className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
                                      >
                                        댓글 삭제
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => { openReportModal("comment", c.id); setCommentMenuOpenId(null); }}
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
                              {isReplyOperator ? (
                                <span className="inline-flex items-center gap-1 mb-1 rounded-full bg-amber-500/30 px-1.5 py-0.5 text-[9px] font-black text-amber-200 border border-amber-500/50">
                                  ⚖️ 대법관
                                </span>
                              ) : null}
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
                                    <div className="absolute right-0 mt-1 w-28 rounded-md border border-zinc-800 bg-zinc-900 py-1 text-[11px] text-zinc-200 shadow-lg z-20">
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

      {/* 댓글/대댓글 삭제 비밀번호 모달 */}
      {commentDeleteTargetId ? (
        <div className="fixed inset-0 z-[185] flex items-center justify-center bg-black/70 p-4">
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
                  <label className="block text-xs font-black tracking-widest uppercase text-zinc-400 mb-2">
                    재판 목적
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, trial_type: "DEFENSE" }))}
                      disabled={isReviewing}
                      className={`rounded-xl border-2 px-4 py-4 text-sm font-bold transition ${
                        form.trial_type === "DEFENSE"
                          ? "border-amber-500 bg-amber-500/20 text-amber-300"
                          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
                      } disabled:opacity-60`}
                    >
                      무죄 주장<br />
                      <span className="text-xs font-normal">(항변)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, trial_type: "ACCUSATION" }))}
                      disabled={isReviewing}
                      className={`rounded-xl border-2 px-4 py-4 text-sm font-bold transition ${
                        form.trial_type === "ACCUSATION"
                          ? "border-amber-500 bg-amber-500/20 text-amber-300"
                          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
                      } disabled:opacity-60`}
                    >
                      유죄 주장<br />
                      <span className="text-xs font-normal">(기소)</span>
                    </button>
                  </div>
                  {!form.trial_type && (
                    <p className="mt-2 text-xs text-red-400">재판 목적을 선택해주세요.</p>
                  )}
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
                    사건 경위(상세 내용)
                  </label>
                  <textarea
                    value={form.details}
                    onChange={(e) => setForm((p) => ({ ...p, details: e.target.value }))}
                    disabled={isReviewing}
                    className="mt-2 w-full min-h-[160px] resize-y rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition"
                    placeholder={`언제/어디서/누가/무슨 말을/무슨 행동을 했는지 순서대로 적으세요.\n정리 안 하면 판사도 안 봅니다.`}
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
                    증거 이미지 (선택)
                  </label>
                  <p className="mt-1 text-xs text-zinc-500 mb-2">JPG, PNG, GIF, WebP · 최대 5MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    disabled={isReviewing}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
                      setImagePreviewUrl(null);
                      setImageFile(f ?? null);
                      if (f) setImagePreviewUrl(URL.createObjectURL(f));
                      setUploadError(null);
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isReviewing}
                    className="mt-2 w-full rounded-2xl border border-zinc-800 bg-amber-500 px-4 py-3 text-black font-bold cursor-pointer hover:bg-amber-400 transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    파일 선택
                  </button>
                  {imagePreviewUrl ? (
                    <div className="mt-3 flex items-start gap-3">
                      <img
                        src={imagePreviewUrl}
                        alt="미리보기"
                        className="h-24 w-24 rounded-xl object-cover border border-zinc-800"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null);
                          if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
                          setImagePreviewUrl(null);
                        }}
                        disabled={isReviewing}
                        className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-700 transition"
                      >
                        제거
                      </button>
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
                    placeholder="비밀번호 입력"
                    maxLength={20}
                    required
                  />
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
                <div className="rounded-[2rem] border border-zinc-800 bg-zinc-950/60 p-5 md:p-6">
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
                      <div className="mt-2 text-lg md:text-xl font-black tracking-tight">
                        최종 판결
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
                        사건 개요
                      </div>
                      <div className="mt-2 text-sm md:text-base text-zinc-100 leading-relaxed whitespace-pre-wrap">
                        {judgeResult.verdict.title}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-black tracking-widest uppercase text-zinc-400">
                          과실 비율
                        </div>
                        <div className="text-xs font-black text-zinc-300">
                          원고 {judgeResult.verdict.ratio.plaintiff}% / 피고{" "}
                          {judgeResult.verdict.ratio.defendant}%
                        </div>
                      </div>
                      <div className="mt-3 w-full bg-zinc-800 h-3 rounded-full overflow-hidden flex">
                        <div
                          className="bg-amber-500 h-full shadow-[0_0_15px_rgba(245,158,11,0.35)]"
                          style={{ width: `${judgeResult.verdict.ratio.plaintiff}%` }}
                        />
                        <div
                          className="bg-zinc-600 h-full"
                          style={{ width: `${judgeResult.verdict.ratio.defendant}%` }}
                        />
                      </div>
                      <div className="mt-3 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {judgeResult.verdict.ratio.rationale}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
                      <div className="text-xs font-black tracking-widest uppercase text-amber-200">
                        최종 판결
                      </div>
                      <div className="mt-2 text-sm md:text-base font-bold text-amber-50 leading-relaxed whitespace-pre-wrap">
                        {judgeResult.verdict.verdict}
                      </div>
                    </div>
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
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full md:w-auto rounded-2xl bg-amber-500 px-6 py-4 font-black text-black hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  판결 요청
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
