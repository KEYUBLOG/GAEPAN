"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

/** DB ratio 값(피고 과실 0~100)을 number | null로 정규화 */
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

type JudgeVerdict = {
  title: string;
  ratio: {
    plaintiff: number;
    defendant: number;
    rationale: string;
  };
  verdict: string;
  punchline: string;
};

export default function Home() {
  const [isAccuseOpen, setIsAccuseOpen] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [judgeResult, setJudgeResult] = useState<{
    mock: boolean;
    verdict: JudgeVerdict;
  } | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    plaintiff: "",
    defendant: "",
    details: "",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  type PostPreview = {
    id: string;
    title: string;
    plaintiff: string | null;
    defendant: string | null;
    content: string | null;
    verdict: string;
    ratio: number | null;
    punchline: string | null;
    created_at: string | null;
    guilty: number;
    not_guilty: number;
    image_url: string | null;
  };

  const VOTES_STORAGE_KEY = "gaepan_votes";
  const getStoredVote = (postId: string): "guilty" | "not_guilty" | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(VOTES_STORAGE_KEY);
      const obj = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      const v = obj[postId];
      return v === "guilty" || v === "not_guilty" ? v : null;
    } catch {
      return null;
    }
  };
  const setStoredVote = (postId: string, value: "guilty" | "not_guilty" | null) => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(VOTES_STORAGE_KEY);
      const obj = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      if (value === null) delete obj[postId];
      else obj[postId] = value;
      localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // ignore
    }
  };

  const [recentPosts, setRecentPosts] = useState<PostPreview[]>([]);
  const [topGuiltyPost, setTopGuiltyPost] = useState<PostPreview | null>(null);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<PostPreview | null>(null);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Record<string, "guilty" | "not_guilty">>({});

  type Comment = { id: string; content: string; created_at: string | null; parent_id: string | null };
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyToId, setReplyToId] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  // 사이트 전체: 우클릭·드래그·텍스트 선택(스크랩) 금지
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("selectstart", prevent);
    document.addEventListener("dragstart", prevent);
    return () => {
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("selectstart", prevent);
      document.removeEventListener("dragstart", prevent);
    };
  }, []);
  const closeAccuse = () => {
    setIsReviewing(false);
    setIsAccuseOpen(false);
    setJudgeError(null);
    setImageFile(null);
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(null);
    setUploadError(null);
  };

  const openAccuse = () => {
    setIsAccuseOpen(true);
    setIsReviewing(false);
    setJudgeResult(null);
    setJudgeError(null);
    setUploadError(null);
  };

  const canSubmit = useMemo(() => {
    const ok =
      form.title.trim().length > 0 &&
      form.plaintiff.trim().length > 0 &&
      form.defendant.trim().length > 0 &&
      form.details.trim().length > 0;
    return ok && !isReviewing;
  }, [form, isReviewing]);

  useEffect(() => {
    if (!isAccuseOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAccuse();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAccuseOpen]);

  // 최근 판결문 로딩 + 실시간 구독
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const toPostPreview = (row: Record<string, unknown>): PostPreview => ({
      id: String(row.id ?? ""),
      title: (row.title as string) ?? "",
      plaintiff: (row.plaintiff as string | null) ?? null,
      defendant: (row.defendant as string | null) ?? null,
      content: (row.content as string | null) ?? null,
      verdict: (row.verdict as string) ?? "",
      ratio: toRatioNumber(row.ratio),
      punchline: (row.punchline as string | null) ?? null,
      created_at: (row.created_at as string | null) ?? null,
      guilty: Number(row.guilty) || 0,
      not_guilty: Number(row.not_guilty) || 0,
      image_url: (row.image_url as string | null) ?? null,
    });

    const isRlsOrPolicyError = (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return /row-level security|policy|RLS/i.test(msg);
    };

    const load = async () => {
      setIsLoadingPosts(true);
      setPostsError(null);
      try {
        const [{ data: topData, error: topError }, { data: listData, error: listError }] = await Promise.all([
          supabase
            .from("posts")
            .select("*")
            .neq("status", "판결불가")
            .order("guilty", { ascending: false })
            .limit(1),
          supabase
            .from("posts")
            .select("*")
            .neq("status", "판결불가")
            .order("created_at", { ascending: false })
            .limit(10),
        ]);

        if (topError) throw topError;
        if (listError) throw listError;

        if (topData?.[0]) setTopGuiltyPost(toPostPreview(topData[0] as Record<string, unknown>));
        else setTopGuiltyPost(null);
        setRecentPosts((listData ?? []).map((row) => toPostPreview(row as Record<string, unknown>)));
      } catch (err) {
        const isRls = isRlsOrPolicyError(err);
        setPostsError(
          isRls ? "데이터를 불러올 수 없습니다. RLS(행 수준 보안) 설정을 확인해 주세요." : (err instanceof Error ? err.message : "최근 판결을 불러오는 중 오류가 발생했습니다.")
        );
        if (!isRls) console.error("[GAEPAN] Error fetching recent posts", err);
      } finally {
        setIsLoadingPosts(false);
      }
    };

    load();

    const channel = supabase
      .channel("posts-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
          (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row?.status === "판결불가") return;
          setRecentPosts((prev) => {
            const newItem: PostPreview = {
              id: String(row?.id ?? ""),
              title: (row?.title as string) ?? "",
              plaintiff: (row?.plaintiff as string | null) ?? null,
              defendant: (row?.defendant as string | null) ?? null,
              content: (row?.content as string | null) ?? null,
              verdict: (row?.verdict as string) ?? "",
              ratio: toRatioNumber(row?.ratio),
              punchline: (row?.punchline as string | null) ?? null,
              created_at: (row?.created_at as string | null) ?? null,
              guilty: Number(row?.guilty) || 0,
              not_guilty: Number(row?.not_guilty) || 0,
              image_url: (row?.image_url as string | null) ?? null,
            };
            const next: PostPreview[] = [newItem, ...prev];
            return next.slice(0, 10);
          });
        },
      )
      .subscribe(() => {});

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // localStorage 투표 상태를 userVotes에 동기화
  useEffect(() => {
    const votes: Record<string, "guilty" | "not_guilty"> = {};
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(VOTES_STORAGE_KEY) : null;
      const obj = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      for (const [postId, v] of Object.entries(obj)) {
        if (v === "guilty" || v === "not_guilty") votes[postId] = v;
      }
      setUserVotes(votes);
    } catch {
      // ignore
    }
  }, []);

  // 선택된 기소장의 배심원 한마디 로드
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
    setReplyToId(null);
    fetch(`/api/posts/${selectedPost.id}/comments`)
      .then((r) => r.json())
      .then((data: { comments?: Comment[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        const list = Array.isArray(data.comments) ? data.comments : [];
        setComments(list.map((c) => ({ ...c, parent_id: c.parent_id ?? null })));
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

  useEffect(() => {
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

    setIsReviewing(true);
    setJudgeResult(null);
    setJudgeError(null);

    console.log("[GAEPAN] 기소장 접수", {
      사건제목: form.title.trim(),
      원고: form.plaintiff.trim(),
      피고: form.defendant.trim(),
      사건경위: form.details.trim(),
      submittedAt: new Date().toISOString(),
    });

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
          plaintiff: form.plaintiff,
          defendant: form.defendant,
          details: form.details,
          image_url: imageUrl,
        }),
      });

      type JudgeApiResponse =
        | { ok: true; mock?: boolean; verdict: JudgeVerdict }
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

  const handleVote = async (postId: string, type: "guilty" | "not_guilty") => {
    if (votingId) return;
    const previousVote = getStoredVote(postId);
    setVotingId(postId);
    try {
      const r = await fetch(`/api/posts/${postId}/vote`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, previousVote: previousVote ?? null }),
      });
      const data = (await r.json()) as { guilty?: number; not_guilty?: number; error?: string };
      if (!r.ok) throw new Error(data.error);
      const newGuilty = data.guilty ?? 0;
      const newNotGuilty = data.not_guilty ?? 0;

      const nextVote: "guilty" | "not_guilty" | null =
        previousVote === type ? null : type;
      setStoredVote(postId, nextVote);
      setUserVotes((prev) => {
        const next = { ...prev };
        if (nextVote === null) delete next[postId];
        else next[postId] = nextVote;
        return next;
      });

      setRecentPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, guilty: newGuilty, not_guilty: newNotGuilty } : p
        )
      );
      setTopGuiltyPost((prev) =>
        prev?.id === postId ? { ...prev, guilty: newGuilty, not_guilty: newNotGuilty } : prev
      );
      setSelectedPost((prev) =>
        prev?.id === postId ? { ...prev, guilty: newGuilty, not_guilty: newNotGuilty } : prev
      );
    } catch {
      setVotingId(null);
    } finally {
      setVotingId(null);
    }
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost?.id || !commentInput.trim() || commentSubmitting) return;
    const parentId = replyToId;
    setCommentSubmitting(true);
    setCommentsError(null);
    try {
      const r = await fetch(`/api/posts/${selectedPost.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentInput.trim(), parent_id: parentId ?? null }),
      });
      const data = (await r.json()) as { comment?: Comment; error?: string };
      if (!r.ok) throw new Error(data.error ?? "한마디 등록 실패");
      if (data.comment) {
        const newComment = { ...data.comment, parent_id: data.comment.parent_id ?? null };
        setComments((prev) => [...prev, newComment]);
      }
      setCommentInput("");
      setReplyToId(null);
    } catch (err) {
      setCommentsError(err instanceof Error ? err.message : "한마디 등록에 실패했습니다.");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const commentTree = useMemo(() => {
    const top = comments.filter((c) => !c.parent_id);
    const byParent = new Map<string, Comment[]>();
    for (const c of comments) {
      if (c.parent_id) {
        const list = byParent.get(c.parent_id) ?? [];
        list.push(c);
        byParent.set(c.parent_id, list);
      }
    }
    return { top, byParent };
  }, [comments]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-amber-500 selection:text-black">
      {/* GNB (상단바) */}
      <nav className="p-6 border-b border-zinc-900 flex justify-between items-center sticky top-0 bg-zinc-950/80 backdrop-blur-md z-50">
        <h1 className="text-2xl font-black tracking-tighter text-amber-500 italic">GAEPAN</h1>
        <div className="space-x-6 text-sm font-bold text-zinc-400">
          <button className="hover:text-amber-500 transition">진행중인 재판</button>
          <button className="hover:text-amber-500 transition">명예의 전당</button>
          <button
            type="button"
            onClick={openAccuse}
            className="bg-amber-600 hover:bg-amber-500 text-black px-4 py-2 rounded-full transition"
          >
            기소하기
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-4xl mx-auto pt-24 pb-20 px-6 text-center">
        <div className="inline-block px-4 py-1.5 mb-6 text-xs font-bold tracking-widest uppercase bg-zinc-900 border border-zinc-800 rounded-full text-amber-500">
          24/7 무자비한 AI 법정
        </div>
        <h2 className="text-6xl md:text-8xl font-black mb-8 tracking-tighter leading-none">
          누가 <span className="text-amber-500 underline decoration-zinc-800">죄인</span>인가?
        </h2>
        <p className="text-zinc-500 text-xl md:text-2xl mb-12 font-medium leading-relaxed">
          당신의 억울한 사연, <br className="hidden md:block" /> 
          AI 판사가 논리적으로 뼈를 때려드립니다.
        </p>
        
        <div className="flex flex-col md:flex-row gap-4 justify-center items-center">
          <button
            type="button"
            onClick={openAccuse}
            className="w-full md:w-auto bg-zinc-100 text-black text-xl px-12 py-5 rounded-2xl font-black hover:bg-amber-500 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:shadow-amber-500/20 active:scale-95"
          >
            지금 기소하기 (공짜)
          </button>
          <button className="w-full md:w-auto bg-zinc-900 text-white text-xl px-12 py-5 rounded-2xl font-black border border-zinc-800 hover:bg-zinc-800 transition-all">
            다른 재판 구경
          </button>
        </div>
      </main>

      {/* 이달의 대역죄인 — 유죄 표 가장 많은 기소장 (클릭 시 상세 모달) */}
      {topGuiltyPost && topGuiltyPost.guilty > 0 ? (
        <section className="max-w-5xl mx-auto px-6 pb-16">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedPost(topGuiltyPost)}
            onKeyDown={(e) => e.key === "Enter" && setSelectedPost(topGuiltyPost)}
            className="rounded-[2rem] border-2 border-amber-500/50 bg-gradient-to-b from-amber-500/10 to-transparent p-8 md:p-10 cursor-pointer select-none transition-transform duration-200 hover:scale-[1.02] hover:border-amber-500/60 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
          >
            <div className="text-xs font-black tracking-widest uppercase text-amber-500 mb-2">
              이달의 대역죄인
            </div>
            <h3 className="text-3xl md:text-4xl font-black mb-4 text-amber-50">
              {topGuiltyPost.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400 mb-4">
              {topGuiltyPost.plaintiff ? <span>원고 {topGuiltyPost.plaintiff}</span> : null}
              {topGuiltyPost.plaintiff && topGuiltyPost.defendant ? <span>·</span> : null}
              {topGuiltyPost.defendant ? <span>피고 {topGuiltyPost.defendant}</span> : null}
            </div>
            <p className="text-base text-zinc-300 line-clamp-2 mb-4">{topGuiltyPost.verdict}</p>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {(() => {
                const total = topGuiltyPost.guilty + topGuiltyPost.not_guilty;
                const guiltyPct = total ? Math.round((topGuiltyPost.guilty / total) * 100) : 0;
                const notGuiltyPct = total ? Math.round((topGuiltyPost.not_guilty / total) * 100) : 0;
                return (
                  <>
                    <span className="inline-flex items-center rounded-lg bg-red-500/20 px-3 py-1.5 text-red-400 font-bold shadow-sm">
                      유죄 ({guiltyPct}%) {topGuiltyPost.guilty}표
                    </span>
                    <span className="inline-flex items-center rounded-lg bg-zinc-700/50 px-3 py-1.5 text-zinc-400 font-bold shadow-sm">
                      무죄 ({notGuiltyPct}%) {topGuiltyPost.not_guilty}표
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        </section>
      ) : null}

      {/* Live Trials Preview */}
      <section className="max-w-5xl mx-auto py-12 px-6">
        <div className="flex justify-between items-end mb-10">
          <div>
            <h3 className="text-3xl font-black mb-2">실시간 재판소</h3>
            <p className="text-zinc-500">지금 이 시각, 가장 뜨거운 갈등들</p>
          </div>
          <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            LIVE
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Card 1 */}
          <div className="group bg-zinc-900 border border-zinc-800 p-8 rounded-[2rem] hover:border-amber-500/50 transition-all cursor-pointer">
            <div className="flex justify-between mb-6">
              <span className="text-xs bg-zinc-800 px-3 py-1 rounded-full text-zinc-400 font-bold uppercase tracking-wider">연애/이별</span>
              <span className="text-amber-500 font-black italic">AI 판결중...</span>
            </div>
            <h4 className="text-2xl font-bold mb-4 group-hover:text-amber-500 transition">"남사친이랑 인생네컷 찍은 여친, 이거 제가 예민한가요?"</h4>
            <div className="space-y-4">
              <div className="w-full bg-zinc-800 h-3 rounded-full overflow-hidden flex">
                <div className="bg-amber-500 h-full w-[82%] shadow-[0_0_15px_rgba(245,158,11,0.5)]"></div>
                <div className="bg-zinc-700 h-full w-[18%]"></div>
              </div>
              <div className="flex justify-between text-sm font-bold uppercase tracking-tighter">
                <span className="text-amber-500">유죄 (82%)</span>
                <span className="text-zinc-500">무죄 (18%)</span>
              </div>
            </div>
          </div>

          {/* Card 2 */}
          <div className="group bg-zinc-900 border border-zinc-800 p-8 rounded-[2rem] hover:border-amber-500/50 transition-all cursor-pointer">
            <div className="flex justify-between mb-6">
              <span className="text-xs bg-zinc-800 px-3 py-1 rounded-full text-zinc-400 font-bold uppercase tracking-wider">직장 생활</span>
              <span className="text-red-500 font-black italic underline decoration-2 underline-offset-4">최종 판결: 피고 유죄</span>
            </div>
            <h4 className="text-2xl font-bold mb-4 group-hover:text-amber-500 transition">"신입사원이 메신저 답장 '넵' 대신 '네'라고 합니다."</h4>
            <div className="space-y-4">
              <div className="w-full bg-zinc-800 h-3 rounded-full overflow-hidden flex">
                <div className="bg-red-600 h-full w-[15%]"></div>
                <div className="bg-zinc-600 h-full w-[85%] shadow-[0_0_15px_rgba(255,255,255,0.1)]"></div>
              </div>
              <div className="flex justify-between text-sm font-bold uppercase tracking-tighter">
                <span className="text-red-500">유죄 (15%)</span>
                <span className="text-zinc-400 text-lg font-black italic">무죄 (85%)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

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

                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-black tracking-widest uppercase text-zinc-400">
                      원고(나) 이름
                    </label>
                    <input
                      value={form.plaintiff}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, plaintiff: e.target.value }))
                      }
                      disabled={isReviewing}
                      className="mt-2 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition"
                      placeholder="예: 익명 원고"
                      maxLength={30}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-black tracking-widest uppercase text-zinc-400">
                      피고(상대) 이름
                    </label>
                    <input
                      value={form.defendant}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, defendant: e.target.value }))
                      }
                      disabled={isReviewing}
                      className="mt-2 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition"
                      placeholder="예: 익명 피고"
                      maxLength={30}
                      required
                    />
                  </div>
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
                    className="mt-2 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 file:mr-4 file:rounded-xl file:border-0 file:bg-amber-500 file:px-4 file:py-2 file:text-black file:font-bold file:cursor-pointer outline-none focus:border-amber-500/60 transition disabled:opacity-60"
                  />
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

                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                      <div className="text-xs font-black tracking-widest uppercase text-zinc-400">
                        판사의 독설 한마디
                      </div>
                      <div className="mt-2 text-sm md:text-base font-bold text-zinc-100 leading-relaxed whitespace-pre-wrap">
                        “{judgeResult.verdict.punchline}”
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

              <p className="text-xs text-zinc-600 leading-relaxed">
                제출 시 `/api/judge`로 전송됩니다. API 키가 없으면 MOCK 판결로 동작합니다.
              </p>
            </form>
          </div>
        </div>
      ) : null}

      {/* 최근 판결문 */}
      <section className="max-w-5xl mx-auto pb-20 px-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h3 className="text-2xl md:text-3xl font-black mb-1">최근 판결문</h3>
            <p className="text-zinc-500 text-sm">
              GAEPAN 법정을 거친 따끈한 판결들입니다.
            </p>
          </div>
        </div>

        {postsError ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {postsError}
          </div>
        ) : null}

        {isLoadingPosts && recentPosts.length === 0 ? (
          <div className="grid md:grid-cols-2 gap-6 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 animate-pulse space-y-3"
              >
                <div className="h-4 w-2/3 bg-zinc-800 rounded-full" />
                <div className="h-3 w-1/3 bg-zinc-900 rounded-full" />
                <div className="h-3 w-full bg-zinc-900 rounded-full" />
                <div className="h-3 w-5/6 bg-zinc-900 rounded-full" />
              </div>
            ))}
          </div>
        ) : null}

        {!isLoadingPosts && recentPosts.length === 0 && !postsError ? (
          <div className="mt-6 text-sm text-zinc-500">
            아직 저장된 판결문이 없습니다. 첫 기소의 영광을 가져가 보세요.
          </div>
        ) : null}

        {recentPosts.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            {recentPosts.map((p) => (
              <article
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPost(p)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedPost(p)}
                className="group rounded-[1.75rem] border border-zinc-900 bg-zinc-950 p-5 hover:border-amber-500/40 transition-all cursor-pointer select-none flex flex-col"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h4 className="text-base md:text-lg font-bold group-hover:text-amber-400 transition line-clamp-2">
                    {p.title}
                  </h4>
                  {typeof p.ratio === "number" ? (
                    <span className="text-xs font-black text-amber-400 shrink-0">
                      피고 과실 {p.ratio}%
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-500 mb-2">
                  {p.plaintiff ? <span>원고 {p.plaintiff}</span> : null}
                  {p.plaintiff && p.defendant ? <span>·</span> : null}
                  {p.defendant ? <span>피고 {p.defendant}</span> : null}
                  {p.created_at ? (
                    <>
                      <span>·</span>
                      <span>
                        {new Date(p.created_at).toLocaleString("ko-KR", {
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </>
                  ) : null}
                </div>
                <p className="text-xs text-zinc-400 line-clamp-2 min-h-[2.5rem] mb-2">
                  {p.verdict}
                </p>
                {p.punchline ? (
                  <p className="text-xs font-bold text-zinc-100 line-clamp-2 min-h-[2rem] mb-4">
                    “{p.punchline}”
                  </p>
                ) : (
                  <div className="min-h-[2rem] mb-4" />
                )}
                <div className="flex items-center justify-center gap-2 mt-auto" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const total = p.guilty + p.not_guilty;
                    const guiltyPct = total ? Math.round((p.guilty / total) * 100) : 0;
                    const notGuiltyPct = total ? Math.round((p.not_guilty / total) * 100) : 0;
                    return (
                      <>
                        <button
                          type="button"
                          disabled={votingId === p.id}
                          onClick={() => handleVote(p.id, "guilty")}
                          className={`rounded-lg px-4 py-1.5 text-xs font-bold transition disabled:opacity-50 shadow-sm ${
                            userVotes[p.id] === "guilty"
                              ? "bg-red-500/50 ring-1 ring-red-400/60 text-red-100"
                              : "bg-red-500/20 hover:bg-red-500/30 text-red-400"
                          }`}
                        >
                          유죄 ({guiltyPct}%) {p.guilty}표
                        </button>
                        <button
                          type="button"
                          disabled={votingId === p.id}
                          onClick={() => handleVote(p.id, "not_guilty")}
                          className={`rounded-lg px-4 py-1.5 text-xs font-bold transition disabled:opacity-50 shadow-sm ${
                            userVotes[p.id] === "not_guilty"
                              ? "bg-zinc-500/50 ring-1 ring-zinc-400/60 text-zinc-100"
                              : "bg-zinc-700/50 hover:bg-zinc-600/50 text-zinc-300"
                          }`}
                        >
                          무죄 ({notGuiltyPct}%) {p.not_guilty}표
                        </button>
                      </>
                    );
                  })()}
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      {/* 최근 판결문 상세 모달 */}
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
            onClick={() => setSelectedPost(null)}
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
              <div>
                <div className="text-xs font-black tracking-widest uppercase text-zinc-500 mb-1">사건 제목</div>
                <h4 className="text-xl md:text-2xl font-bold text-zinc-100">{selectedPost.title}</h4>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                {selectedPost.plaintiff ? <span>원고 {selectedPost.plaintiff}</span> : null}
                {selectedPost.plaintiff && selectedPost.defendant ? <span>·</span> : null}
                {selectedPost.defendant ? <span>피고 {selectedPost.defendant}</span> : null}
                {selectedPost.created_at ? (
                  <span>
                    · {new Date(selectedPost.created_at).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                ) : null}
              </div>
              {selectedPost.content ? (
                <div>
                  <div className="text-xs font-black tracking-widest uppercase text-zinc-500 mb-2">사건 경위 (상세 내용)</div>
                  <p className="text-base text-zinc-300 leading-relaxed whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3">
                    {selectedPost.content}
                  </p>
                </div>
              ) : null}
              {typeof selectedPost.ratio === "number" ? (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                  <span className="text-sm font-black text-amber-200">피고 과실 {selectedPost.ratio}%</span>
                </div>
              ) : null}
              <div>
                <div className="text-xs font-black tracking-widest uppercase text-zinc-500 mb-2">최종 판결</div>
                <p className="text-base md:text-lg text-zinc-100 leading-relaxed whitespace-pre-wrap">
                  {selectedPost.verdict}
                </p>
              </div>
              {selectedPost.punchline ? (
                <div>
                  <div className="text-xs font-black tracking-widest uppercase text-zinc-500 mb-2">판사의 한마디</div>
                  <p className="text-base md:text-lg font-bold text-amber-100 leading-relaxed">
                    “{selectedPost.punchline}”
                  </p>
                </div>
              ) : null}

              {/* 상세 모달 내 투표 */}
              <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const total = selectedPost.guilty + selectedPost.not_guilty;
                  const guiltyPct = total ? Math.round((selectedPost.guilty / total) * 100) : 0;
                  const notGuiltyPct = total ? Math.round((selectedPost.not_guilty / total) * 100) : 0;
                  return (
                    <>
                      <button
                        type="button"
                        disabled={votingId === selectedPost.id}
                        onClick={() => handleVote(selectedPost.id, "guilty")}
                        className={`rounded-lg px-4 py-1.5 text-xs font-bold transition disabled:opacity-50 shadow-sm ${
                          userVotes[selectedPost.id] === "guilty"
                            ? "bg-red-500/50 ring-1 ring-red-400/60 text-red-100"
                            : "bg-red-500/20 hover:bg-red-500/30 text-red-400"
                        }`}
                      >
                        유죄 ({guiltyPct}%) {selectedPost.guilty}표
                      </button>
                      <button
                        type="button"
                        disabled={votingId === selectedPost.id}
                        onClick={() => handleVote(selectedPost.id, "not_guilty")}
                        className={`rounded-lg px-4 py-1.5 text-xs font-bold transition disabled:opacity-50 shadow-sm ${
                          userVotes[selectedPost.id] === "not_guilty"
                            ? "bg-zinc-500/50 ring-1 ring-zinc-400/60 text-zinc-100"
                            : "bg-zinc-700/50 hover:bg-zinc-600/50 text-zinc-300"
                        }`}
                      >
                        무죄 ({notGuiltyPct}%) {selectedPost.not_guilty}표
                      </button>
                    </>
                  );
                })()}
              </div>

              {/* 배심원 한마디 (대댓글 지원) */}
              <div className="border-t border-zinc-800 pt-6">
                <div className="text-xs font-black tracking-widest uppercase text-zinc-500 mb-3">배심원 한마디</div>
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
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">{commentInput.length}/2000</span>
                    <button
                      type="submit"
                      disabled={!commentInput.trim() || commentSubmitting}
                      className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-black hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {commentSubmitting ? "등록 중..." : replyToId ? "답글 등록" : "한마디 등록"}
                    </button>
                  </div>
                </form>
                {commentsLoading ? (
                  <div className="mt-4 text-sm text-zinc-500">한마디 불러오는 중...</div>
                ) : commentTree.top.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-500">아직 배심원 한마디가 없습니다.</p>
                ) : (
                  <ul className="mt-4 space-y-4">
                    {commentTree.top.map((c) => (
                      <li key={c.id} className="space-y-0">
                        <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                          {c.content}
                          <div className="mt-2 flex items-center justify-between gap-2">
                            {c.created_at ? (
                              <span className="text-xs text-zinc-500">
                                {new Date(c.created_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setReplyToId(replyToId === c.id ? null : c.id)}
                              className="text-xs font-bold text-amber-400 hover:text-amber-300"
                            >
                              {replyToId === c.id ? "답글 취소" : "답글"}
                            </button>
                          </div>
                        </div>
                        {(commentTree.byParent.get(c.id) ?? []).map((reply) => (
                          <div key={reply.id} className="ml-6 pl-4 py-2 border-l-2 border-amber-500/30 rounded-r-lg bg-zinc-900/50 relative">
                            <span className="absolute -left-[0.6rem] top-2.5 text-amber-500/80 text-sm font-bold leading-none" aria-hidden>ㄴ</span>
                            <p className="pl-2 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{reply.content}</p>
                            {reply.created_at ? (
                              <div className="mt-1 pl-2 text-xs text-zinc-500">
                                {new Date(reply.created_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}