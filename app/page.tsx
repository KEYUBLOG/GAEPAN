"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { animate } from "framer-motion";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;
const URGENT_THRESHOLD_MS = 3 * 60 * 60 * 1000;

function getVotingEndsAt(createdAt: string | null): number {
  if (!createdAt) return 0;
  return new Date(createdAt).getTime() + TRIAL_DURATION_MS;
}
function isVotingOpen(createdAt: string | null, votingEndedAt?: string | null): boolean {
  if (votingEndedAt) return false;
  return Date.now() < getVotingEndsAt(createdAt);
}
function getRemainingMs(createdAt: string | null): number {
  return Math.max(0, getVotingEndsAt(createdAt) - Date.now());
}
function isUrgent(createdAt: string | null): boolean {
  const rem = getRemainingMs(createdAt);
  return rem > 0 && rem < URGENT_THRESHOLD_MS;
}
function formatCountdown(ms: number): string {
  if (ms <= 0) return "재판 종료";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function getVotingEndWeek(createdAt: string | null): { year: number; week: number } | null {
  if (!createdAt) return null;
  const endMs = new Date(createdAt).getTime() + TRIAL_DURATION_MS;
  const d = new Date(endMs);
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((endMs - start.getTime()) / 86400000);
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return { year: d.getFullYear(), week: Math.min(week, 53) };
}

/** 특정 시각이 속한 연도/주차 (명예의 전당용, voting_ended_at 반영) */
function getWeekFromEndAt(endedAt: string | null, createdAt: string | null): { year: number; week: number } | null {
  if (endedAt) {
    const d = new Date(endedAt);
    const start = new Date(d.getFullYear(), 0, 1);
    const days = Math.floor((d.getTime() - start.getTime()) / 86400000);
    const week = Math.ceil((days + start.getDay() + 1) / 7);
    return { year: d.getFullYear(), week: Math.min(week, 53) };
  }
  return getVotingEndWeek(createdAt);
}

/** 현재 주차 계산 */
function getCurrentWeek(): { year: number; week: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - start.getTime()) / 86400000);
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return { year: now.getFullYear(), week: Math.min(week, 53) };
}

/** 게시글 생성 시점의 주차 계산 */
function getPostWeek(createdAt: string | null): { year: number; week: number } | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - start.getTime()) / 86400000);
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return { year: d.getFullYear(), week: Math.min(week, 53) };
}

/** 익명 닉네임 생성 (엄숙한 법정 버전) */
function generateCourtNickname(postId: string, voterId: string): string {
  const adjectives = ['침묵하는', '냉철한', '분노한', '고뇌하는', '준엄한', '자비로운', '공정한', '법봉을 쥔', '눈을 감은', '정의의'];
  const titles = ['재판장', '부장판사', '배심원', '법학자', '심판관', '검사', '서기관', '중재자'];
  
  // postId와 voterId를 조합한 시드값 생성
  const seed = `${postId}:${voterId}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit 정수로 변환
  }
  
  const adjIndex = Math.abs(hash) % adjectives.length;
  const titleIndex = Math.abs(hash >> 8) % titles.length;
  
  return `${adjectives[adjIndex]} ${titles[titleIndex]}`;
}

function isAuthorVictoryFromPost(p: {
  trial_type: "DEFENSE" | "ACCUSATION" | null;
  guilty: number;
  not_guilty: number;
  ratio: number | null;
}): boolean {
  const aiRatio = p.ratio ?? 50;
  if (p.trial_type === "DEFENSE") {
    return p.not_guilty > p.guilty;
  }
  if (p.trial_type === "ACCUSATION") {
    return p.guilty > p.not_guilty;
  }
  return aiRatio >= 50;
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const previousRef = useRef(value);

  useEffect(() => {
    const from = previousRef.current;
    const to = value;
    if (from === to) return;
    const controls = animate(from, to, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    previousRef.current = to;
    return () => {
      controls.stop();
    };
  }, [value]);

  return <span className="tabular-nums">{display.toLocaleString("ko-KR")}</span>;
}

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
  };

function HomeContent() {
  const [isAccuseOpen, setIsAccuseOpen] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [judgeResult, setJudgeResult] = useState<{
    mock: boolean;
    verdict: JudgeVerdict;
    imageUrl?: string | null;
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

  const [jurorLabels, setJurorLabels] = useState<Record<string, string>>({});
  const [recentPosts, setRecentPosts] = useState<PostPreview[]>([]);
  const [topGuiltyPost, setTopGuiltyPost] = useState<PostPreview | null>(null);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<PostPreview | null>(null);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [userVotes, setUserVotes] = useState<Record<string, "guilty" | "not_guilty">>({});

  type Comment = {
    id: string;
    content: string;
    created_at: string | null;
    parent_id: string | null;
    author_id: string | null;
    likes: number;
    is_operator?: boolean;
  };
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
  const [juryBarAnimated, setJuryBarAnimated] = useState(false);
  const [commentDeleteError, setCommentDeleteError] = useState<string | null>(null);

  const [reportTarget, setReportTarget] = useState<{
    type: "post" | "comment" | null;
    id: string | null;
  }>({ type: null, id: null });
  const [reportReason, setReportReason] = useState<string>("욕설/비하");

  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [commentSort, setCommentSort] = useState<"latest" | "popular">("latest");
  const [commentMenuOpenId, setCommentMenuOpenId] = useState<string | null>(null);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const [postMenuOpenId, setPostMenuOpenId] = useState<string | null>(null);
  const [deletePostId, setDeletePostId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteToast, setDeleteToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const [editPostId, setEditPostId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [trialTab, setTrialTab] = useState<"ongoing" | "completed">("ongoing");
  const [ongoingSort, setOngoingSort] = useState<"latest" | "votes" | "urgent">("urgent");
  const [liveFeedItems, setLiveFeedItems] = useState<Array<{
    id: string;
    post_id: string;
    post_title: string | null;
    vote_type: string;
    voter_display: string | null;
    created_at: string;
    category: string | null;
  }>>([]);
  const [courtLogs, setCourtLogs] = useState<Array<{
    id: string;
    post_id: string;
    post_title: string | null;
    vote_type: "guilty" | "not_guilty";
    voter_id: string; // IP 주소 기반 고유 ID
    nickname: string;
    created_at: string;
  }>>([]);
  const courtLogsRef = useRef<HTMLDivElement | null>(null);
  const loggedVotes = useRef<Set<string>>(new Set()); // 중복 방지용: "post_id:ip_address" 형식
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [isOperatorLoggedIn, setIsOperatorLoggedIn] = useState(false);
  const [isMobileLogOpen, setIsMobileLogOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [todayStats, setTodayStats] = useState<{
    total: number;
    wins: number;
    losses: number;
  } | null>(null);
  const [todayStatsError, setTodayStatsError] = useState<string | null>(null);

  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const postsListRef = useRef<HTMLElement | null>(null);
  const hallOfFameRef = useRef<HTMLElement | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const deletePasswordRef = useRef<HTMLInputElement | null>(null);
  const commentDeletePasswordRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  // 오늘 확정된 재판 집계 (실시간 사법 전광판)
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const loadTodayStats = async () => {
      try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const { data, error } = await supabase
          .from("posts")
          .select("id, guilty, not_guilty, ratio, trial_type, created_at, voting_ended_at, status")
          .gte("created_at", start.toISOString())
          .neq("status", "판결불가");

        if (error) throw error;

        const rows = (data ?? []) as Array<{
          id: string;
          guilty: number | null;
          not_guilty: number | null;
          ratio: number | null;
          trial_type: "DEFENSE" | "ACCUSATION" | null;
          created_at: string | null;
          voting_ended_at: string | null;
          status?: string | null;
        }>;

        const completed = rows.filter((row) =>
          !isVotingOpen(row.created_at ?? null, row.voting_ended_at ?? null),
        );

        const total = completed.length;
        let wins = 0;

        for (const row of completed) {
          const p = {
            trial_type: row.trial_type ?? null,
            guilty: Number(row.guilty) || 0,
            not_guilty: Number(row.not_guilty) || 0,
            ratio: typeof row.ratio === "number" ? row.ratio : null,
          };
          if (isAuthorVictoryFromPost(p)) wins += 1;
        }

        const losses = Math.max(0, total - wins);
        setTodayStats({ total, wins, losses });
        setTodayStatsError(null);
      } catch (err) {
        console.error("[GAEPAN] 오늘 재판 현황 집계 오류:", err);
        setTodayStatsError("오늘 재판 현황을 불러오지 못했습니다.");
      }
    };

    loadTodayStats();

    const interval = setInterval(loadTodayStats, 60_000);
    return () => clearInterval(interval);
  }, []);

  const searchParams = useSearchParams();

  // URL ?tab=completed 로 진입 시(재판 완료 후 등) '판결 완료된 사건' 탭으로
  useEffect(() => {
    if (searchParams.get("tab") === "completed") setTrialTab("completed");
  }, [searchParams]);

  // 로그인 여부 확인
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setIsLoggedIn(!!data?.user);
      })
      .catch(() => setIsLoggedIn(false));
  }, []);

  // URL ?post=id 로 진입 시 해당 판결문 모달 바로 열기 (대법관 페이지 '게시글 보기' 등)
  useEffect(() => {
    const postId = searchParams.get("post");
    if (!postId?.trim()) return;
    const supabase = getSupabaseBrowserClient();
    supabase
      .from("posts")
      .select("*")
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
        };
        setSelectedPost(post);
        window.history.replaceState(null, "", "/");
      });
  }, [searchParams]);

  // 운영자 로그인 상태 확인
  useEffect(() => {
    fetch("/api/admin/check")
      .then((r) => r.json())
      .then((data: { loggedIn?: boolean }) => {
        setIsOperatorLoggedIn(data.loggedIn === true);
      })
      .catch(() => setIsOperatorLoggedIn(false));
  }, []);

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

  const canSubmit = useMemo(() => {
    const ok =
      form.title.trim().length > 0 &&
      form.details.trim().length > 0 &&
      form.password.trim().length > 0 &&
      form.category.trim().length > 0 &&
      (form.trial_type === "DEFENSE" || form.trial_type === "ACCUSATION");
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
          const newItem = toPostPreview(row);
          setRecentPosts((prev) => {
            const next: PostPreview[] = [newItem, ...prev];
            return next.slice(0, 100);
          });
        },
      )
      .subscribe(() => {});

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 진행 중인 재판이 하나라도 있으면 1초마다 카운트다운 갱신
  useEffect(() => {
    const hasOngoing = recentPosts.some((p) => isVotingOpen(p.created_at, p.voting_ended_at));
    if (!hasOngoing) return;
    setCountdownNow(Date.now());
    const t = setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [recentPosts]);

  // 실시간 재판소: vote_events 구독
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase
      .from("vote_events")
      .select("id, post_id, post_title, vote_type, voter_display, created_at")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (data?.length) {
          // recentPosts에서 카테고리 정보 매칭
          const itemsWithCategory = (data as any[]).map((item) => {
            const post = recentPosts.find((p) => p.id === item.post_id);
            return {
              ...item,
              category: post?.category ?? null,
            };
          });
          setLiveFeedItems(itemsWithCategory);
        }
      });
    const channel = supabase
      .channel("vote_events-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vote_events" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          // recentPosts에서 카테고리 정보 매칭
          const post = recentPosts.find((p) => p.id === String(row?.post_id ?? ""));
          setLiveFeedItems((prev) => [
            {
              id: String(row?.id ?? ""),
              post_id: String(row?.post_id ?? ""),
              post_title: (row?.post_title as string | null) ?? null,
              vote_type: String(row?.vote_type ?? ""),
              voter_display: null, // 항상 null로 설정하여 "익명의 배심원" 사용
              created_at: String(row?.created_at ?? ""),
              category: post?.category ?? null,
            },
            ...prev,
          ].slice(0, 50));
        },
      )
      .subscribe(() => {});
    return () => {
      supabase.removeChannel(channel);
    };
  }, [recentPosts]);

  // 실시간 재판소: votes 구독 (법정 기록 로그 창용)
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    
    // 초기 데이터 로드 (최근 50개)
    supabase
      .from("votes")
      .select("id, post_id, ip_address, choice, created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data?.length) {
          const logs: Array<{
            id: string;
            post_id: string;
            post_title: string | null;
            vote_type: "guilty" | "not_guilty";
            voter_id: string;
            nickname: string;
            created_at: string;
          }> = [];
          const seen = new Set<string>();
          
          // 최신순으로 정렬된 데이터를 역순으로 처리 (오래된 것부터)
          const reversed = [...data].reverse();
          
          for (const item of reversed) {
            const postId = String(item.post_id ?? "");
            const voterId = String(item.ip_address ?? "");
            const key = `${postId}:${voterId}`;
            
            // 중복 방지: 한 유저가 동일 게시물에서 최초 1회만
            if (seen.has(key)) continue;
            seen.add(key);
            
            const post = recentPosts.find((p) => p.id === postId);
            const nickname = generateCourtNickname(postId, voterId);
            
            logs.push({
              id: String(item.id ?? ""),
              post_id: postId,
              post_title: post?.title ?? null,
              vote_type: (item.choice === "guilty" ? "guilty" : "not_guilty") as "guilty" | "not_guilty",
              voter_id: voterId,
              nickname,
              created_at: String(item.created_at ?? ""),
            });
            
            loggedVotes.current.add(key);
          }
          
          setCourtLogs(logs);
        }
      });

    const channel = supabase
      .channel("votes-live-court-log")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "votes" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const postId = String(row?.post_id ?? "");
          const voterId = String(row?.ip_address ?? "");
          const key = `${postId}:${voterId}`;
          
          // 중복 방지: 이미 로그에 기록된 투표는 무시
          if (loggedVotes.current.has(key)) return;
          loggedVotes.current.add(key);
          
          const post = recentPosts.find((p) => p.id === postId);
          const nickname = generateCourtNickname(postId, voterId);
          const voteType = (row.choice === "guilty" ? "guilty" : "not_guilty") as "guilty" | "not_guilty";
          
          const newLog = {
            id: String(row?.id ?? ""),
            post_id: postId,
            post_title: post?.title ?? null,
            vote_type: voteType,
            voter_id: voterId,
            nickname,
            created_at: String(row?.created_at ?? ""),
          };
          
          setCourtLogs((prev) => {
            const updated = [...prev, newLog];
            // 최대 100개까지만 유지
            return updated.slice(-100);
          });

          // 자동 스크롤
          setTimeout(() => {
            courtLogsRef.current?.scrollTo({
              top: courtLogsRef.current.scrollHeight,
              behavior: "smooth",
            });
          }, 100);
        },
      )
      .subscribe(() => {});
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [recentPosts]);

  // courtLogs가 업데이트될 때마다 자동 스크롤
  useEffect(() => {
    if (courtLogs.length > 0) {
      setTimeout(() => {
        courtLogsRef.current?.scrollTo({
          top: courtLogsRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
    }
  }, [courtLogs]);

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


  // 대댓글 버튼 클릭 시 댓글 입력창 포커스 및 스크롤
  useEffect(() => {
    if (!replyToId) return;
    const t = setTimeout(() => {
      commentInputRef.current?.focus();
      commentInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    return () => clearTimeout(t);
  }, [replyToId]);

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

  // 배심원 라벨링: 글 내에서 같은 작성자는 항상 같은 번호
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
      setJudgeError("판결문 수정 및 삭제 비밀번호를 입력해 주세요.");
      return;
    }

    setIsReviewing(true);
    setJudgeResult(null);
    setJudgeError(null);

    console.log("[GAEPAN] 기소장 접수", {
      사건제목: form.title.trim(),
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
        let uploadData: { url?: string; error?: string } = {};
        try {
          const text = await uploadRes.text();
          if (text.trim().length > 0) {
            uploadData = JSON.parse(text) as { url?: string; error?: string };
          }
        } catch {
          uploadData = { error: uploadRes.ok ? "이미지 업로드 응답을 읽을 수 없습니다." : "이미지 업로드를 사용할 수 없습니다." };
        }
        if (!uploadRes.ok) {
          setUploadError(uploadData.error ?? "이미지 업로드 실패");
          return;
        }
        imageUrl = uploadData.url ?? null;
        if (!imageUrl && uploadRes.ok) {
          setUploadError("업로드된 이미지 주소를 받지 못했습니다.");
          return;
        }
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
        | { ok: true; mock?: boolean; verdict: JudgeVerdict }
        | { ok: true; status: "판결불가"; verdict: null }
        | { ok: false; error?: string };

      let data: JudgeApiResponse | null = null;
      try {
        const text = await r.text();
        if (text.trim().length > 0) {
          data = JSON.parse(text) as JudgeApiResponse;
        }
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

      setJudgeResult({
        mock: (data as any).mock ?? false,
        verdict: (data as any).verdict,
        imageUrl: imageUrl && imageUrl.length > 0 ? imageUrl : null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "알 수 없는 오류";
      setJudgeError(msg);
    } finally {
      setIsReviewing(false);
    }
  };

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

  const handlePostLike = async (postId: string) => {
    try {
      const r = await fetch(`/api/posts/${postId}/like`, { method: "POST" });
      const data = (await r.json()) as { likes?: number; liked?: boolean; error?: string };
      if (!r.ok) throw new Error(data.error);
      const likes = data.likes ?? 0;
      const liked = !!data.liked;
      setLikedPostIds((prev) => {
        const next = new Set(prev);
        if (liked) next.add(postId);
        else next.delete(postId);
        return next;
      });
      setRecentPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, likes } : p))
      );
      setTopGuiltyPost((prev) => (prev?.id === postId ? { ...prev, likes } : prev));
      setSelectedPost((prev) => (prev?.id === postId ? { ...prev, likes } : prev));
    } catch {}
  };

  const handleReport = async (targetType: "post" | "comment", targetId: string, reason: string) => {
    console.log("[GAEPAN] 신고 요청:", { targetType, targetId, reason });
    try {
      const r = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, reason }),
      });
      const data = (await r.json()) as { ok?: boolean; error?: string };
      console.log("[GAEPAN] 신고 응답:", { status: r.status, data });
      if (!r.ok || !data.ok) {
        console.error("[GAEPAN] 신고 실패:", { status: r.status, error: data.error });
        throw new Error(data.error ?? "신고에 실패했습니다.");
      }
      console.log("[GAEPAN] 신고 성공");
      if (typeof window !== "undefined") {
        window.alert("신고가 접수되었습니다.");
      }
    } catch (err) {
      console.error("[GAEPAN] 신고 처리 중 오류:", err);
      if (typeof window !== "undefined") {
        window.alert(err instanceof Error ? err.message : "신고 처리 중 오류가 발생했습니다.");
      }
    }
  };

  const openReportModal = (targetType: "post" | "comment", targetId: string) => {
    setReportTarget({ type: targetType, id: targetId });
    setReportReason("욕설/비하");
  };

  const closeReportModal = () => {
    setReportTarget({ type: null, id: null });
  };

  const closeDeleteModal = () => {
    setDeletePostId(null);
    setDeletePassword("");
    setDeleteSubmitting(false);
    setPostMenuOpenId(null);
  };

  const closeEditModal = () => {
    setEditPostId(null);
    setEditTitle("");
    setEditContent("");
    setEditPassword("");
    setEditError(null);
    setEditSubmitting(false);
  };

  const handleEditPost = async (postId: string, payload: { password: string; title: string; content: string }) => {
    if (!postId?.trim() || !payload.password.trim()) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      const r = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: payload.password.trim(),
          title: payload.title.trim(),
          content: payload.content,
        }),
      });
      const data = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!r.ok || (data && data.ok === false)) {
        setEditError(data?.error ?? "수정에 실패했습니다.");
        setEditSubmitting(false);
        return;
      }
      const { title, content } = { title: payload.title.trim(), content: payload.content };
      setSelectedPost((prev) => (prev?.id === postId ? { ...prev, title, content } : prev));
      setRecentPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, title, content } : p)));
      setTopGuiltyPost((prev) => (prev?.id === postId ? { ...prev, title, content } : prev));
      closeEditModal();
      setPostMenuOpenId(null);
      setDeleteToast({ message: "판결문이 수정되었습니다." });
      setTimeout(() => setDeleteToast(null), 4000);
    } catch (err) {
      console.error("[handleEditPost]", err);
      setEditError("수정 요청 중 오류가 발생했습니다.");
      setEditSubmitting(false);
    }
  };

  const handleDeletePost = async (postId: string, password: string) => {
    if (typeof window === "undefined") return;
    if (!postId?.trim()) {
      setDeleteToast({ message: "삭제할 판결문을 찾을 수 없습니다.", isError: true });
      setTimeout(() => setDeleteToast(null), 4000);
      return;
    }
    const trimmed = password.trim();
    if (!trimmed) {
      setDeleteToast({ message: "판결문 수정 및 삭제 비밀번호를 입력해 주세요.", isError: true });
      setTimeout(() => setDeleteToast(null), 4000);
      return;
    }
    setDeleteSubmitting(true);
    try {
      const url = `/api/posts/${postId}`;
      const r = await fetch(url, {
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
        setDeleteToast({ message: msg, isError: true });
        setTimeout(() => setDeleteToast(null), 5000);
        setDeleteSubmitting(false);
        return;
      }
      if (data && data.ok === false) {
        const msg = data?.error ?? "판결문 삭제에 실패했습니다.";
        setDeleteToast({ message: msg, isError: true });
        setTimeout(() => setDeleteToast(null), 5000);
        setDeleteSubmitting(false);
        return;
      }
      setRecentPosts((prev) => prev.filter((p) => p.id !== postId));
      setSelectedPost((prev) => (prev?.id === postId ? null : prev));
      setTopGuiltyPost((prev) => (prev?.id === postId ? null : prev));
      closeDeleteModal();
      setDeleteToast({ message: "판결문이 삭제되었습니다." });
      setTimeout(() => setDeleteToast(null), 4000);
    } catch (err) {
      console.error("[handleDeletePost]", err);
      setDeleteToast({ message: "판결문 삭제 중 오류가 발생했습니다.", isError: true });
      setTimeout(() => setDeleteToast(null), 5000);
      setDeleteSubmitting(false);
    }
  };

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


  const filteredRecentPosts = useMemo(() => {
    const byTrial =
      trialTab === "ongoing"
        ? recentPosts.filter((p) => isVotingOpen(p.created_at, p.voting_ended_at))
        : recentPosts.filter((p) => !isVotingOpen(p.created_at, p.voting_ended_at));
    if (trialTab === "ongoing") {
      const sorted = [...byTrial];
      if (ongoingSort === "latest") {
        sorted.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
      } else if (ongoingSort === "votes") {
        sorted.sort((a, b) => b.guilty + b.not_guilty - (a.guilty + a.not_guilty));
      } else {
        sorted.sort((a, b) => getVotingEndsAt(a.created_at) - getVotingEndsAt(b.created_at));
      }
      return sorted;
    }
    return [...byTrial].sort((a, b) => getVotingEndsAt(b.created_at) - getVotingEndsAt(a.created_at));
  }, [recentPosts, trialTab, ongoingSort]);

  const filteredTopGuiltyPost = useMemo(() => {
    const ongoingPosts = filteredRecentPosts.filter((p) => isVotingOpen(p.created_at, p.voting_ended_at));
    if (ongoingPosts.length === 0) return null;
    const urgent = ongoingPosts.find((p) => isUrgent(p.created_at));
    if (urgent) return urgent;
    return ongoingPosts.reduce((best, p) =>
      p.guilty >= (best?.guilty ?? 0) ? p : best,
    );
  }, [filteredRecentPosts]);

  const weeklyWinners = useMemo(() => {
    const ended = recentPosts.filter((p) => !isVotingOpen(p.created_at, p.voting_ended_at) && p.guilty > 0);
    const byWeek = new Map<string, { year: number; week: number; post: typeof ended[0] }>();
    for (const p of ended) {
      const key = getWeekFromEndAt(p.voting_ended_at, p.created_at);
      if (!key) continue;
      const k = `${key.year}-${key.week}`;
      const cur = byWeek.get(k);
      if (!cur || p.guilty > cur.post.guilty) byWeek.set(k, { ...key, post: p });
    }
    return Array.from(byWeek.values()).sort((a, b) => b.year - a.year || b.week - a.week);
  }, [recentPosts]);

  // 현재 주차에서 투표 합계가 가장 높은 게시글 (금주의 개판 하이라이트)
  const currentWeekTopPost = useMemo(() => {
    const currentWeek = getCurrentWeek();
    const currentWeekPosts = recentPosts.filter((p) => {
      if (!p.created_at) return false;
      const postWeek = getPostWeek(p.created_at);
      if (!postWeek) return false;
      return postWeek.year === currentWeek.year && postWeek.week === currentWeek.week;
    });
    if (currentWeekPosts.length === 0) return null;
    // 투표 합계(guilty + not_guilty)가 가장 높은 게시글 선택
    return currentWeekPosts.reduce((best, p) => {
      const bestTotal = (best?.guilty ?? 0) + (best?.not_guilty ?? 0);
      const pTotal = p.guilty + p.not_guilty;
      return pTotal > bestTotal ? p : best;
    });
  }, [recentPosts]);

  // 진행 중인 재판 목록
  const ongoingPosts = useMemo(() => {
    return filteredRecentPosts.filter((p) => isVotingOpen(p.created_at, p.voting_ended_at));
  }, [filteredRecentPosts]);

  // 판결 완료된 사건 목록 (명예의 전당 주차 1위도 포함 — 동일 글이 양쪽에 중복 노출 가능)
  // trialTab과 무관하게 항상 recentPosts 기준으로 완료 사건 표시 (비대법원 사용자도 볼 수 있도록)
  const completedPosts = useMemo(() => {
    const completed = recentPosts.filter((p) => !isVotingOpen(p.created_at, p.voting_ended_at));
    const winnerIds = new Set(weeklyWinners.map((w) => w.post.id));
    const inWinners = completed.filter((p) => winnerIds.has(p.id));
    const notInWinners = completed.filter((p) => !winnerIds.has(p.id));
    return [...inWinners, ...notInWinners];
  }, [recentPosts, weeklyWinners]);

  // 삭제 비밀번호 모달 열릴 때 입력창 포커스
  useEffect(() => {
    if (!deletePostId) return;
    setDeletePassword("");
    const t = setTimeout(() => deletePasswordRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [deletePostId]);

  // 댓글 삭제 비밀번호 모달 열릴 때 입력창 포커스
  useEffect(() => {
    if (!commentDeleteTargetId) return;
    setCommentDeletePassword("");
    setCommentDeleteError(null);
    const t = setTimeout(() => commentDeletePasswordRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [commentDeleteTargetId]);

  // 배심원 평결 그래프 애니메이션 (모달 열릴 때 0% -> 실제 비율)
  useEffect(() => {
    if (!selectedPost) {
      setJuryBarAnimated(false);
      return;
    }
    setJuryBarAnimated(false);
    const t = setTimeout(() => {
      setJuryBarAnimated(true);
    }, 50);
    return () => clearTimeout(t);
  }, [selectedPost?.id]);

  return (
    <>
      <style jsx global>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-amber-500 selection:text-black overflow-x-hidden">
      {/* 삭제 결과 토스트 */}
      {deleteToast ? (
        <div
          role="alert"
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-xl text-sm font-bold shadow-lg max-w-[90vw] ${
            deleteToast.isError
              ? "bg-red-500/95 text-white border border-red-400"
              : "bg-amber-500 text-black border border-amber-400"
          }`}
        >
          {deleteToast.message}
        </div>
      ) : null}
      {/* 댓글/대댓글 삭제 비밀번호 모달 */}
      {commentDeleteTargetId ? (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/70 p-4">
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

      {/* 판결문 삭제 비밀번호 모달 */}
      {deletePostId ? (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-950 border border-zinc-800 p-5 space-y-4">
            <h4 className="text-sm font-black text-zinc-100">판결문 삭제</h4>
            <p className="text-xs text-zinc-400">
              기소 시 설정한 판결문 수정 및 삭제 비밀번호를 입력하세요.
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
              placeholder="판결문 수정 및 삭제 비밀번호"
              maxLength={20}
              autoComplete="current-password"
              disabled={deleteSubmitting}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 outline-none disabled:opacity-60"
            />
            <p className="text-[11px] text-zinc-500">*작성 후 수정 및 삭제를 위해 반드시 기억해주세요.</p>
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

      {/* 판결문 수정 모달 */}
      {editPostId ? (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-zinc-950 border border-zinc-800 p-5 space-y-4 my-8">
            <h4 className="text-sm font-black text-zinc-100">판결문 수정</h4>
            <p className="text-xs text-zinc-400">
              제목과 내용을 수정한 뒤, 기소 시 설정한 판결문 수정 및 삭제 비밀번호를 입력하세요.
            </p>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">제목</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                disabled={editSubmitting}
                maxLength={200}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 outline-none disabled:opacity-60"
                placeholder="제목"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">내용 (사건 경위)</label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                disabled={editSubmitting}
                rows={6}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 outline-none disabled:opacity-60 resize-y"
                placeholder="사건 경위"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1">판결문 수정 및 삭제 비밀번호</label>
              <input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                disabled={editSubmitting}
                maxLength={20}
                placeholder="판결문 수정 및 삭제 비밀번호"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 outline-none disabled:opacity-60"
              />
              <p className="mt-1 text-[11px] text-zinc-500">*작성 후 수정 및 삭제를 위해 반드시 기억해주세요.</p>
            </div>
            {editError ? (
              <p className="text-xs text-red-400">{editError}</p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeEditModal}
                disabled={editSubmitting}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => handleEditPost(editPostId, { password: editPassword, title: editTitle, content: editContent })}
                disabled={!editTitle.trim() || !editPassword.trim() || editSubmitting}
                className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editSubmitting ? "수정 중..." : "수정 완료"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* 신고 사유 선택 모달 */}
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
      {/* GNB (상단바) */}
      <nav className="px-4 py-3 md:p-6 border-b border-zinc-900 flex justify-between items-center sticky top-0 bg-zinc-950/80 backdrop-blur-md z-50">
        <h1 className="text-lg md:text-2xl font-black tracking-tighter text-amber-500 italic pr-2">GAEPAN</h1>
        
        {/* 우측 상단 메뉴 버튼 (모바일/PC 공통) */}
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="text-zinc-400 hover:text-amber-500 transition p-2"
          aria-label="메뉴"
        >
          <span className="text-2xl font-bold">≡</span>
        </button>
      </nav>

      {/* 메뉴 드로어 (모바일/PC 공통) */}
      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md">
          <div className="absolute top-0 right-0 w-[280px] h-full bg-zinc-950 border-l border-zinc-900 shadow-2xl z-50">
            <div className="p-6 flex flex-col h-full">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-black text-amber-500">메뉴</h2>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-zinc-400 hover:text-zinc-200 text-2xl font-bold"
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
              
              <div className="flex flex-col gap-3 flex-1">
                {isOperatorLoggedIn ? (
                  <>
                    <Link
                      href="/admin"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/50 bg-amber-500/20 hover:bg-amber-500/30 transition text-amber-400"
                    >
                      <span className="text-xl shrink-0">⚖️</span>
                      <span className="text-sm font-bold">대법관 페이지</span>
                    </Link>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await fetch("/api/admin/logout", { method: "POST" });
                          setIsOperatorLoggedIn(false);
                          setIsMobileMenuOpen(false);
                        } catch (err) {
                          console.error("로그아웃 실패:", err);
                        }
                      }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 transition text-white text-sm font-bold"
                    >
                      <span className="text-xl shrink-0">🚪</span>
                      <span>로그아웃</span>
                    </button>
                  </>
                ) : null}

                <Link
                  href="/trials/ongoing"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition text-zinc-200 text-sm font-bold border border-zinc-700"
                >
                  <span className="text-xl shrink-0">⚖️</span>
                  <span>진행 중인 재판</span>
                </Link>
                <Link
                  href="/trials/completed"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition text-zinc-200 text-sm font-bold border border-zinc-700"
                >
                  <span className="text-xl shrink-0">✅</span>
                  <span>판결 완료된 사건</span>
                </Link>
                <Link
                  href="/hall-of-fame"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition text-zinc-200 text-sm font-bold border border-zinc-700"
                >
                  <span className="text-xl shrink-0">🏅</span>
                  <span>명예의 전당</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    openAccuse();
                    setIsMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 transition text-black text-sm font-bold"
                >
                  <span className="text-xl shrink-0">📝</span>
                  <span>기소하기</span>
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute inset-0 bg-black/50 z-40"
            aria-label="닫기"
          />
        </div>
      ) : null}

      {/* 실시간 사법 전광판 */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-4 md:mt-6 mb-4">
        <div className="bg-black/40 backdrop-blur-md border border-zinc-800/60 rounded-2xl px-4 py-4 md:px-6 md:py-5 shadow-[0_0_30px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] md:text-xs font-semibold tracking-[0.2em] uppercase text-zinc-400">
              실시간 사법 전광판
            </h3>
            <p className="text-[10px] text-zinc-500">
              오늘 00:00 이후 확정 판결 기준
            </p>
          </div>
          {todayStatsError ? (
            <p className="text-[11px] text-red-400">{todayStatsError}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:flex md:flex-row md:divide-x md:divide-zinc-800">
              <div className="flex flex-col items-center justify-center md:px-4 text-center">
                <span className="text-[11px] text-zinc-500 mb-1">오늘 확정된 사건</span>
                <div className="text-xl md:text-2xl font-black">
                  <AnimatedNumber value={todayStats?.total ?? 0} />
                </div>
              </div>
              <div className="flex flex-col items-center justify-center md:px-4 text-center">
                <span className="text-[11px] text-zinc-500 mb-1 flex items-center gap-1">
                  오늘 승소 <span className="text-[10px]">🔥</span>
                </span>
                <div className="text-xl md:text-2xl font-black text-amber-400">
                  <AnimatedNumber value={todayStats?.wins ?? 0} />
                </div>
              </div>
              <div className="flex flex-col items-center justify-center md:px-4 text-center">
                <span className="text-[11px] text-zinc-500 mb-1">오늘 패소</span>
                <div className="text-xl md:text-2xl font-black text-zinc-200">
                  <AnimatedNumber value={todayStats?.losses ?? 0} />
                </div>
              </div>
              <div className="flex flex-col items-center justify-center md:px-4 text-center">
                <span className="text-[11px] text-zinc-500 mb-1">승소율</span>
                <div className="text-xl md:text-2xl font-black text-emerald-400">
                  <AnimatedNumber
                    value={
                      todayStats && todayStats.total > 0
                        ? Math.round((todayStats.wins / todayStats.total) * 100)
                        : 0
                    }
                  />
                  <span className="text-sm ml-1">%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Grid Container */}
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Main Content Area */}
          <div className="md:col-span-8 md:pr-6 space-y-12">
            {/* Hero Section */}
            <main className="pt-12 md:pt-8 pb-12 md:pb-20 text-center">
              <div className="inline-block px-4 py-1.5 mb-6 text-xs font-bold tracking-widest uppercase bg-zinc-900 border border-zinc-800 rounded-full text-amber-500">
                24/7 무자비한 AI 법정
              </div>
              <h2 className="text-4xl sm:text-6xl md:text-8xl font-black mb-6 md:mb-8 tracking-tighter leading-tight mt-12 md:mt-0">
                누가 <span className="text-amber-500 underline decoration-zinc-800">죄인</span>인가?
              </h2>
              <p className="text-zinc-500 text-base sm:text-lg md:text-2xl mb-8 md:mb-12 font-medium leading-relaxed md:leading-relaxed px-4 text-center">
                당신의 억울한 사연, <br className="hidden md:block" /> 
                AI 판사가 논리적으로 뼈를 때려드립니다.
              </p>
              
              <div className="flex flex-col md:flex-row gap-4 justify-center items-center px-4">
                <button
                  type="button"
                  onClick={openAccuse}
                  className="w-[90%] md:w-auto bg-gradient-to-br from-zinc-100 via-zinc-200 to-zinc-300 text-black text-base sm:text-lg md:text-xl px-6 md:px-12 py-4 md:py-5 rounded-2xl font-black hover:from-amber-400 hover:via-amber-500 hover:to-amber-600 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:shadow-amber-500/20 active:scale-95"
                >
                  지금 기소하기 (공짜)
                </button>
                <Link
                  href="/petitions"
                  className="w-[90%] md:w-auto bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 text-black text-base sm:text-lg md:text-xl px-6 md:px-12 py-4 md:py-5 rounded-2xl font-black hover:from-amber-500 hover:via-amber-400 hover:to-amber-300 transition-all text-center block shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:shadow-[0_0_40px_rgba(245,158,11,0.6)] active:scale-95 relative overflow-hidden group flex items-center justify-center"
                >
                  <span className="relative z-10">국민 청원</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                </Link>
              </div>
            </main>

            {/* 진행 중: 금주의 개판 / 완료: 최근 마감된 재판 (클릭 시 상세 모달) */}
            {filteredTopGuiltyPost ? (
              <section className="pt-6 md:pt-12 pb-8 md:pb-16 space-y-4">
                <h3 className="text-2xl md:text-3xl font-bold text-left flex items-center gap-2">
                  <span>🔥</span>
                  <span>금주의 개판</span>
                </h3>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedPost(filteredTopGuiltyPost)}
            onKeyDown={(e) => e.key === "Enter" && setSelectedPost(filteredTopGuiltyPost)}
            className="w-full rounded-[2rem] border-2 border-amber-500/50 bg-transparent p-4 md:p-10 cursor-pointer select-none transition-transform duration-200 hover:scale-[1.02] hover:border-amber-500/60 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 relative overflow-hidden"
          >
            {/* LIVE 배지: 모바일은 상단 한 줄로, PC는 우측 상단 고정 */}
            {trialTab === "ongoing" && isVotingOpen(filteredTopGuiltyPost.created_at, filteredTopGuiltyPost.voting_ended_at) ? (
              <>
                {/* 모바일: LIVE 상단 중앙, ⋯ 우측 최상단만 */}
                <div className="flex md:hidden relative items-center justify-center mb-4 pt-1">
                  <div className="flex items-center justify-center gap-2 px-2.5 py-1.5 rounded-full bg-zinc-900/90 border border-amber-500/30 text-amber-400 font-bold text-[10px] md:text-xs shadow-lg">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500 animate-pulse"></span>
                    </span>
                    <span>LIVE</span>
                    <span className="text-zinc-300 font-medium">
                      현재 {filteredTopGuiltyPost.guilty + filteredTopGuiltyPost.not_guilty}명이 판결 중
                    </span>
                  </div>
                  <div className="absolute right-0 top-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPostMenuOpenId((prev) => (prev === filteredTopGuiltyPost.id ? null : filteredTopGuiltyPost.id));
                      }}
                      className="px-1.5 py-1 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800/80"
                      aria-label="메뉴"
                    >
                      ⋯
                    </button>
                    {postMenuOpenId === filteredTopGuiltyPost.id ? (
                      <div className="absolute right-0 mt-1 w-32 rounded-md border border-zinc-800 bg-zinc-900 py-1 text-[11px] text-zinc-200 shadow-lg z-20">
                        {isOperatorLoggedIn ? (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm("이 글을 삭제하시겠습니까?")) return;
                              try {
                                const r = await fetch(`/api/admin/delete?type=post&id=${filteredTopGuiltyPost.id}`, { method: "DELETE" });
                                if (r.ok) window.location.reload();
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
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletePostId(filteredTopGuiltyPost.id);
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
                                openReportModal("post", filteredTopGuiltyPost.id);
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
                {/* PC: 우측 상단 고정 */}
                <div className="hidden md:flex absolute top-3 right-4 z-10 items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-zinc-900/90 border border-amber-500/30 text-amber-400 font-bold text-xs shadow-lg">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500 animate-pulse"></span>
                    </span>
                    <span>LIVE</span>
                    <span className="text-zinc-300 font-medium whitespace-nowrap">
                      현재 {filteredTopGuiltyPost.guilty + filteredTopGuiltyPost.not_guilty}명이 판결 중
                    </span>
                  </div>
                  <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPostMenuOpenId((prev) => (prev === filteredTopGuiltyPost.id ? null : filteredTopGuiltyPost.id));
                    }}
                    className="px-1.5 py-1 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800/80"
                    aria-label="메뉴"
                  >
                    ⋯
                  </button>
                  {postMenuOpenId === filteredTopGuiltyPost.id ? (
                    <div className="absolute right-0 mt-1 w-32 rounded-md border border-zinc-800 bg-zinc-900 py-1 text-[11px] text-zinc-200 shadow-lg z-20">
                      {isOperatorLoggedIn ? (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm("이 글을 삭제하시겠습니까?")) return;
                            try {
                              const r = await fetch(`/api/admin/delete?type=post&id=${filteredTopGuiltyPost.id}`, { method: "DELETE" });
                              if (r.ok) window.location.reload();
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
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletePostId(filteredTopGuiltyPost.id);
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
                              openReportModal("post", filteredTopGuiltyPost.id);
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
              </>
            ) : null}

            {/* 상단 메타: 카테고리 + 사건 번호 + 메뉴 */}
            <div className="flex items-start justify-between mb-4 text-[11px] text-zinc-500">
              <div className="flex items-center gap-2">
                {filteredTopGuiltyPost.category ? (
                  <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold bg-zinc-900/80 border border-zinc-800 text-zinc-400 shrink-0">
                    {filteredTopGuiltyPost.category}
                  </span>
                ) : null}
                {filteredTopGuiltyPost.case_number != null ? (
                  <span className="text-[10px] font-semibold text-amber-400">
                    사건 번호 {filteredTopGuiltyPost.case_number}
                  </span>
                ) : null}
              </div>
              
              {/* 우측: ⋯ (LIVE 표시 시에는 상단에만 있으므로 여기선 숨김) */}
              <div className={`flex items-center gap-3 shrink-0 ${trialTab === "ongoing" && isVotingOpen(filteredTopGuiltyPost.created_at, filteredTopGuiltyPost.voting_ended_at) ? "hidden" : ""}`}>
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPostMenuOpenId((prev) => (prev === filteredTopGuiltyPost.id ? null : filteredTopGuiltyPost.id));
                    }}
                    className="px-1 text-zinc-500 hover:text-zinc-300"
                    aria-label="메뉴"
                  >
                    ⋯
                  </button>
                  {postMenuOpenId === filteredTopGuiltyPost.id ? (
                    <div className="absolute right-0 mt-1 w-32 rounded-md border border-zinc-800 bg-zinc-900 py-1 text-[11px] text-zinc-200 shadow-lg z-20">
                      {isOperatorLoggedIn ? (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm("이 글을 삭제하시겠습니까?")) return;
                            try {
                              const r = await fetch(`/api/admin/delete?type=post&id=${filteredTopGuiltyPost.id}`, { method: "DELETE" });
                              if (r.ok) window.location.reload();
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
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletePostId(filteredTopGuiltyPost.id);
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
                              openReportModal("post", filteredTopGuiltyPost.id);
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
            <div className="mb-4 text-center">
              {trialTab === "ongoing" && isUrgent(filteredTopGuiltyPost.created_at) ? (
                <span className="text-[11px] font-bold text-red-500 block mb-1">[🔥 판결 임박]</span>
              ) : null}
              <h3 className="text-lg md:text-2xl font-bold text-amber-50 mb-1 leading-tight truncate break-words">
                {filteredTopGuiltyPost.title}
              </h3>
              {filteredTopGuiltyPost.content ? (
                <p className="text-sm text-zinc-400 line-clamp-2 break-words">
                  {filteredTopGuiltyPost.content}
                </p>
              ) : null}
            </div>
            
            {/* 투표 현황 게이지 (유죄/무죄 비율) */}
            {(() => {
              const total = filteredTopGuiltyPost.guilty + filteredTopGuiltyPost.not_guilty;
              const guiltyPct = total ? Math.round((filteredTopGuiltyPost.guilty / total) * 100) : 0;
              const notGuiltyPct = total ? Math.round((filteredTopGuiltyPost.not_guilty / total) * 100) : 0;
              return (
                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="text-red-400">유죄 {guiltyPct}% ({filteredTopGuiltyPost.guilty}표)</span>
                    <span className="text-blue-400">무죄 {notGuiltyPct}% ({filteredTopGuiltyPost.not_guilty}표)</span>
                  </div>
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden flex">
                    <div
                      className="bg-red-500 h-full transition-all duration-300"
                      style={{ width: `${guiltyPct}%` }}
                    />
                    <div
                      className="bg-blue-500 h-full transition-all duration-300"
                      style={{ width: `${notGuiltyPct}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            {/* 하단 정보 */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-zinc-400 leading-relaxed">
              {filteredTopGuiltyPost.plaintiff === "익명" && filteredTopGuiltyPost.defendant === "익명" ? (
                <span>익명</span>
              ) : (
                <>
                  {filteredTopGuiltyPost.plaintiff ? <span>원고 {filteredTopGuiltyPost.plaintiff}</span> : null}
                  {filteredTopGuiltyPost.plaintiff && filteredTopGuiltyPost.defendant ? <span>·</span> : null}
                  {filteredTopGuiltyPost.defendant ? <span>피고 {filteredTopGuiltyPost.defendant}</span> : null}
                </>
              )}
            </div>
            {isVotingOpen(filteredTopGuiltyPost.created_at, filteredTopGuiltyPost.voting_ended_at) ? (
              <p className="text-sm font-bold text-amber-400 mb-2 tabular-nums text-center leading-relaxed">
                ⏳ 남은 시간 {formatCountdown(Math.max(0, getVotingEndsAt(filteredTopGuiltyPost.created_at) - countdownNow))}
              </p>
            ) : (
              <p className="text-sm text-zinc-500 mb-2 text-center leading-relaxed">재판 종료</p>
              )}
              </div>
            </section>
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
                    판결문 수정 및 삭제 비밀번호
                  </label>
                  <p className="mt-1 text-xs text-zinc-500 mb-2">나중에 판결문을 수정·삭제할 때 사용할 비밀번호입니다.</p>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    disabled={isReviewing}
                    className="mt-2 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition"
                    placeholder="판결문 수정 및 삭제 비밀번호"
                    maxLength={20}
                    required
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">*작성 후 수정 및 삭제를 위해 반드시 기억해주세요.</p>
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
                    {(judgeResult.imageUrl || imagePreviewUrl) ? (
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                        <div className="text-xs font-black tracking-widest uppercase text-zinc-400 mb-2">첨부 증거</div>
                        <a
                          href={((judgeResult.imageUrl || imagePreviewUrl) ?? "#")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900"
                        >
                          <img
                            src={(judgeResult.imageUrl || imagePreviewUrl) ?? ""}
                            alt="첨부 증거"
                            referrerPolicy="no-referrer"
                            className="w-full h-auto max-h-[280px] object-contain bg-zinc-900"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        </a>
                      </div>
                    ) : null}
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

      {/* 진행 중인 재판 섹션 */}
      <section className="pt-6 md:pt-12 pb-8 md:pb-16 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h3 className="text-2xl md:text-3xl font-black mb-1">진행 중인 재판</h3>
            <p className="text-amber-400/90 text-sm font-semibold">
              현재 {ongoingPosts.length}건의 재판이 집행 중입니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOngoingSort("latest")}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                ongoingSort === "latest"
                  ? "bg-amber-500 text-black"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-amber-500/50"
              }`}
            >
              최신순
            </button>
            <button
              type="button"
              onClick={() => setOngoingSort("urgent")}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                ongoingSort === "urgent"
                  ? "bg-amber-500 text-black"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-amber-500/50"
              }`}
            >
              🔥 판결 임박
            </button>
          </div>
        </div>

        {postsError ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {postsError}
          </div>
        ) : null}

        {isLoadingPosts && ongoingPosts.length === 0 ? (
          <div className="grid md:grid-cols-2 gap-6 mt-4">
            {Array.from({ length: 2 }).map((_, i) => (
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

        {!isLoadingPosts && ongoingPosts.length === 0 && !postsError ? (
          <div className="mt-6 text-sm text-zinc-500">
            진행 중인 재판이 없습니다.
          </div>
        ) : null}

        {ongoingPosts.length > 0 ? (
          <>
            <div className="grid md:grid-cols-2 gap-4 md:gap-6 mt-6 overflow-x-hidden break-all">
              {ongoingPosts.slice(0, 2).map((p) => (
                <article
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPost(p)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedPost(p)}
                  className="group w-full max-w-[calc(100vw-2rem)] mx-auto rounded-[1.75rem] border border-zinc-900 bg-zinc-950 p-4 md:p-6 hover:border-amber-500/40 transition-all cursor-pointer select-none flex flex-col gap-2 overflow-x-hidden break-all"
                >
                {/* 상단: 카테고리 + 사건 번호 + 메뉴 */}
                <div className="flex items-start justify-between mb-2 text-[11px] text-zinc-500">
                  <div className="flex items-center gap-2">
                    {p.category ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-900/80 border border-zinc-800 text-zinc-400">
                        {p.category}
                      </span>
                    ) : null}
                    {p.case_number != null ? (
                      <span className="hidden md:inline text-[10px] font-semibold text-amber-400">
                        사건 번호 {p.case_number}
                      </span>
                    ) : null}
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPostMenuOpenId((prev) => (prev === p.id ? null : p.id));
                      }}
                      className="px-1 text-zinc-500 hover:text-zinc-300"
                      aria-label="메뉴"
                    >
                      ⋯
                    </button>
                    {postMenuOpenId === p.id ? (
                      <div className="absolute right-0 mt-1 w-32 rounded-md border border-zinc-800 bg-zinc-900 py-1 text-[11px] text-zinc-200 shadow-lg z-20">
                        {isOperatorLoggedIn ? (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm("이 글을 삭제하시겠습니까?")) return;
                              try {
                                const r = await fetch(`/api/admin/delete?type=post&id=${p.id}`, { method: "DELETE" });
                                if (r.ok) {
                                  setRecentPosts((prev) => prev.filter((x) => x.id !== p.id));
                                  setTopGuiltyPost((prev) => (prev?.id === p.id ? null : prev));
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

                {/* 제목 + 내용 요약 */}
                <div className="mb-2">
                  {isUrgent(p.created_at) ? (
                    <span className="text-[10px] md:text-[11px] font-bold text-red-500 block mb-1 text-left">[🔥 판결 임박]</span>
                  ) : null}
                  <h4 className="text-base md:text-lg font-bold group-hover:text-amber-400 transition line-clamp-1 text-left break-all">
                    {p.title}
                  </h4>
                  {p.content ? (
                    <p className="text-[11px] text-zinc-400 line-clamp-2 text-left break-all">
                      {p.content}
                    </p>
                  ) : null}
                </div>

                {/* 하단 정보 */}
                <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-zinc-500 mb-2 mt-1">
                  {p.plaintiff === "익명" && p.defendant === "익명" ? (
                    <span>익명</span>
                  ) : (
                    <>
                      {p.plaintiff ? <span>원고 {p.plaintiff}</span> : null}
                      {p.plaintiff && p.defendant ? <span>·</span> : null}
                      {p.defendant ? <span>피고 {p.defendant}</span> : null}
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
                  return (
                    <div className="mb-2 space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-zinc-500">
                        <span className="text-red-400 text-xs md:text-sm">유죄 {guiltyPct}% ({p.guilty}표)</span>
                        <span className="text-blue-400 text-xs md:text-sm">무죄 {notGuiltyPct}% ({p.not_guilty}표)</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
                        <div
                          className="bg-red-500 h-full"
                          style={{ width: `${guiltyPct}%` }}
                        />
                        <div
                          className="bg-blue-500 h-full"
                          style={{ width: `${notGuiltyPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}
                
                {/* 투표 버튼 - 무죄주장이면 무죄가 앞(왼쪽) */}
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-center gap-2 mt-auto" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const total = p.guilty + p.not_guilty;
                    const guiltyPct = total ? Math.round((p.guilty / total) * 100) : 0;
                    const notGuiltyPct = total ? Math.round((p.not_guilty / total) * 100) : 0;
                    const isDefense = p.trial_type === "DEFENSE";
                    const first = isDefense ? "not_guilty" : "guilty";
                    const second = isDefense ? "guilty" : "not_guilty";
                    return (
                      <>
                        <button
                          type="button"
                          disabled={votingId === p.id || !isVotingOpen(p.created_at, p.voting_ended_at)}
                          onClick={() => handleVote(p.id, first)}
                          className={`w-full md:w-auto rounded-lg px-4 py-2 md:py-1.5 h-16 md:h-auto text-sm md:text-xs font-bold transition disabled:opacity-50 shadow-sm ${
                            first === "not_guilty"
                              ? (userVotes[p.id] === "not_guilty" ? "bg-blue-500/50 ring-1 ring-blue-400/60 text-blue-100" : "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400")
                              : (userVotes[p.id] === "guilty" ? "bg-red-500/50 ring-1 ring-red-400/60 text-red-100" : "bg-red-500/20 hover:bg-red-500/30 text-red-400")
                          }`}
                        >
                          {first === "not_guilty" ? (isDefense ? "원고 무죄" : "피고 무죄") : (isDefense ? "원고 유죄" : "피고 유죄")} ({first === "not_guilty" ? notGuiltyPct : guiltyPct}%) {first === "not_guilty" ? p.not_guilty : p.guilty}표
                        </button>
                        <button
                          type="button"
                          disabled={votingId === p.id || !isVotingOpen(p.created_at, p.voting_ended_at)}
                          onClick={() => handleVote(p.id, second)}
                          className={`w-full md:w-auto rounded-lg px-4 py-2 md:py-1.5 h-16 md:h-auto text-sm md:text-xs font-bold transition disabled:opacity-50 shadow-sm ${
                            second === "not_guilty"
                              ? (userVotes[p.id] === "not_guilty" ? "bg-blue-500/50 ring-1 ring-blue-400/60 text-blue-100" : "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400")
                              : (userVotes[p.id] === "guilty" ? "bg-red-500/50 ring-1 ring-red-400/60 text-red-100" : "bg-red-500/20 hover:bg-red-500/30 text-red-400")
                          }`}
                        >
                          {second === "not_guilty" ? (isDefense ? "원고 무죄" : "피고 무죄") : (isDefense ? "원고 유죄" : "피고 유죄")} ({second === "not_guilty" ? notGuiltyPct : guiltyPct}%) {second === "not_guilty" ? p.not_guilty : p.guilty}표
                        </button>
                      </>
                    );
                  })()}
                </div>
                </article>
              ))}
            </div>
            {/* 더보기 버튼 */}
            {ongoingPosts.length > 2 ? (
              <div className="mt-6 text-center">
                <Link
                  href="/trials/ongoing"
                  className="inline-block rounded-xl border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-8 py-3 text-sm font-bold transition"
                >
                  더보기 ({ongoingPosts.length - 2}건 더)
                </Link>
              </div>
            ) : null}
              </>
            ) : null}
            </section>

            {/* 판결 완료된 재판 섹션 */}
            <section className="py-8 md:py-12">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h3 className="text-2xl md:text-3xl font-black mb-1">판결 완료된 사건</h3>
            <p className="text-zinc-500 text-sm">GAEPAN 법정을 거친 판결들입니다.</p>
          </div>
        </div>

        {postsError ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {postsError}
          </div>
        ) : null}

        {isLoadingPosts && completedPosts.length === 0 ? (
          <div className="grid md:grid-cols-2 gap-6 mt-4">
            {Array.from({ length: 2 }).map((_, i) => (
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

        {!isLoadingPosts && completedPosts.length === 0 && !postsError ? (
          <div className="mt-6 text-sm text-zinc-500">
            판결 완료된 사건이 없습니다.
          </div>
        ) : null}

        {completedPosts.length > 0 ? (
          <>
            <div className="grid md:grid-cols-2 gap-4 md:gap-6 mt-6 overflow-x-hidden break-all">
              {completedPosts.slice(0, 2).map((p) => (
                <article
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPost(p)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedPost(p)}
                  className="group w-full max-w-[calc(100vw-2rem)] mx-auto rounded-[1.75rem] border border-zinc-900 bg-zinc-950 p-4 md:p-6 hover:border-amber-500/40 transition-all cursor-pointer select-none flex flex-col gap-2 overflow-x-hidden break-all"
                >
                {/* 상단: 카테고리 + 사건 번호 + 메뉴 */}
                <div className="flex items-start justify-between mb-4 text-[11px] text-zinc-500">
                  <div className="flex items-center gap-2">
                    {p.category ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-900/80 border border-zinc-800 text-zinc-400">
                        {p.category}
                      </span>
                    ) : null}
                    {p.case_number != null ? (
                      <span className="text-[10px] font-semibold text-amber-400">
                        사건 번호 {p.case_number}
                      </span>
                    ) : null}
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPostMenuOpenId((prev) => (prev === p.id ? null : p.id));
                      }}
                      className="px-1 text-zinc-500 hover:text-zinc-300"
                      aria-label="메뉴"
                    >
                      ⋯
                    </button>
                    {postMenuOpenId === p.id ? (
                      <div className="absolute right-0 mt-1 w-32 rounded-md border border-zinc-800 bg-zinc-900 py-1 text-[11px] text-zinc-200 shadow-lg z-20">
                        {isOperatorLoggedIn ? (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm("이 글을 삭제하시겠습니까?")) return;
                              try {
                                const r = await fetch(`/api/admin/delete?type=post&id=${p.id}`, { method: "DELETE" });
                                if (r.ok) {
                                  setRecentPosts((prev) => prev.filter((x) => x.id !== p.id));
                                  setTopGuiltyPost((prev) => (prev?.id === p.id ? null : prev));
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

                {/* 제목 + 내용 요약 */}
                <div className="mb-2">
                  <h4 className="text-base md:text-lg font-bold group-hover:text-amber-400 transition line-clamp-1 text-left break-all">
                    {p.title}
                  </h4>
                  {p.content ? (
                    <p className="text-[11px] text-zinc-400 line-clamp-2 text-left break-all">
                      {p.content}
                    </p>
                  ) : null}
                </div>

                {/* 하단 정보 */}
                <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-zinc-500 mb-2 mt-1">
                  {p.plaintiff === "익명" && p.defendant === "익명" ? (
                    <span>익명</span>
                  ) : (
                    <>
                      {p.plaintiff ? <span>원고 {p.plaintiff}</span> : null}
                      {p.plaintiff && p.defendant ? <span>·</span> : null}
                      {p.defendant ? <span>피고 {p.defendant}</span> : null}
                    </>
                  )}
                </div>
                <p className="text-[11px] text-zinc-500 mb-2 text-center">재판 종료</p>
                
                {/* 투표 현황 (작은 막대 그래프 + 배지) */}
                {(() => {
                  const total = p.guilty + p.not_guilty;
                  const guiltyPct = total ? Math.round((p.guilty / total) * 100) : 0;
                  const notGuiltyPct = total ? Math.round((p.not_guilty / total) * 100) : 0;
                  const verdictText = typeof p.verdict === "string" ? p.verdict : "";
                  const isDefense =
                    p.trial_type === "DEFENSE" ||
                    (verdictText.includes("원고 무죄") && p.trial_type !== "ACCUSATION");
                    return (
                      <div className="mt-auto space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-zinc-500">
                          <span className="text-red-400 text-xs md:text-sm">유죄 {guiltyPct}% ({p.guilty}표)</span>
                          <span className="text-blue-400 text-xs md:text-sm">무죄 {notGuiltyPct}% ({p.not_guilty}표)</span>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
                          <div
                            className="bg-red-500 h-full"
                            style={{ width: `${guiltyPct}%` }}
                          />
                          <div
                            className="bg-blue-500 h-full"
                            style={{ width: `${notGuiltyPct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-center gap-2 text-[10px]">
                          <span className={`px-2 py-0.5 rounded-full font-bold ${isDefense ? "bg-blue-500/20 text-blue-300" : "bg-red-500/20 text-red-300"}`}>
                            {isDefense ? "무죄 우세" : "유죄 우세"}
                          </span>
                        </div>
                      </div>
                    );
                })()}
                </article>
              ))}
            </div>
            {/* 더보기 버튼 */}
            {completedPosts.length > 2 ? (
              <div className="mt-6 text-center">
                <Link
                  href="/trials/completed"
                  className="inline-block rounded-xl border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-8 py-3 text-sm font-bold transition"
                >
                  더보기 ({completedPosts.length - 2}건 더)
                </Link>
              </div>
            ) : null}
              </>
            ) : null}
            </section>

            {/* 명예의 전당 — 연도/주차별 금주의 개판 1위 */}
            <section ref={hallOfFameRef} className="py-12 md:py-16 scroll-mt-32 border-t border-zinc-900 mt-8 md:mt-12">
              <div className="mb-8 md:mb-10">
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-black mb-2">명예의 전당</h3>
                <p className="text-zinc-500 text-xs sm:text-sm">매주 '금주의 개판' 1위로 선정된 사건입니다.</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-4 md:p-6 lg:p-8">
                {weeklyWinners.length === 0 ? (
                  <p className="text-zinc-500 text-xs sm:text-sm text-center py-8">아직 기록된 주차가 없습니다.</p>
                ) : (
                  <>
                    {/* 최신 글 1개만 표시 */}
                    {weeklyWinners.slice(0, 1).map(({ year, week, post }) => (
                      <div
                        key={`${year}-${week}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedPost(post)}
                        onKeyDown={(e) => e.key === "Enter" && setSelectedPost(post)}
                        className="block rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 hover:border-amber-500/40 transition cursor-pointer"
                      >
                        <span className="text-xs font-bold text-amber-500">
                          {year}년 제{week}주
                        </span>
                        <p className="font-bold text-sm sm:text-base text-zinc-100 mt-1 line-clamp-1">{post.title}</p>
                        <p className="text-xs text-zinc-500 mt-1">유죄 {post.guilty}표 · 무죄 {post.not_guilty}표</p>
                      </div>
                    ))}
                    {/* 더보기 버튼 */}
                    {weeklyWinners.length > 1 ? (
                      <div className="mt-6 text-center">
                        <Link
                          href="/hall-of-fame"
                          className="inline-block rounded-xl border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-6 md:px-8 py-2 md:py-3 text-xs sm:text-sm font-bold transition"
                        >
                          더보기 ({weeklyWinners.length - 1}건 더)
                        </Link>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </section>
          </div>

          {/* Sidebar Area (PC only) */}
          <aside className="hidden md:block md:col-span-4 md:pl-6 md:pr-0">
            {/* 실시간 재판소 — 법정 기록 로그 창 */}
            <section className="sticky top-24 py-8 flex flex-col h-[calc(100vh-120px)]">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <h3 className="text-lg md:text-xl font-black mb-1">실시간 재판소</h3>
                  <p className="text-zinc-500 text-xs sm:text-sm">정의는 멈추지 않는다, 지금 이 순간의 판결</p>
                </div>
                <div className="flex items-center gap-2 text-amber-500 font-bold text-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  LIVE
                </div>
              </div>

              <div 
                ref={courtLogsRef}
                className="bg-zinc-900/50 backdrop-blur border-l-4 border-amber-500/30 rounded-xl p-4 flex-1 overflow-y-auto shadow-[0_0_20px_rgba(245,158,11,0.15)]"
                style={{
                  boxShadow: "0 0 20px rgba(245,158,11,0.15), inset 0 0 20px rgba(0,0,0,0.3)",
                }}
              >
                <div className="text-[10px] text-zinc-500/70 mb-3 font-mono uppercase tracking-wider">
                  실시간 법정 기록 (Live Court Minutes)
                </div>
                {courtLogs.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8 text-xs sm:text-sm">아직 판결 기록이 없습니다.</p>
                ) : (
                  <ul className="space-y-2 font-mono text-xs">
                    {courtLogs.map((log) => {
                      const date = new Date(log.created_at);
                      const timeStr = date.toLocaleTimeString("ko-KR", { 
                        hour: "2-digit", 
                        minute: "2-digit", 
                        second: "2-digit",
                        hour12: false 
                      });
                      const isGuilty = log.vote_type === "guilty";
                      return (
                        <li 
                          key={log.id}
                          onClick={() => {
                            const post = recentPosts.find((p) => p.id === log.post_id);
                            if (post) setSelectedPost(post);
                          }}
                          className="text-zinc-300 py-1.5 px-2 rounded border-l-2 border-amber-500/20 bg-black/10 hover:bg-black/20 transition-all duration-300 cursor-pointer"
                          style={{
                            animation: "slideUp 0.3s ease-out",
                          }}
                        >
                          <span className="text-zinc-500 text-[10px] mr-2">[{timeStr}]</span>
                          <span className="text-zinc-500">{log.nickname}님이</span>
                          {log.post_title ? (
                            <>
                              <span className="text-amber-400 font-semibold mx-1">'{log.post_title.length > 25 ? `${log.post_title.slice(0, 25)}…` : log.post_title}'</span>
                              <span className="text-zinc-500">사건의 판결문에 날인했습니다.</span>
                            </>
                          ) : (
                            <span className="text-zinc-500 mx-1">사건의 판결문에 날인했습니다.</span>
                          )}
                          <span className={`font-bold ml-1.5 ${isGuilty ? "text-red-600" : "text-blue-600"}`}>
                            ({isGuilty ? "유죄" : "무죄"})
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* 모바일: 실시간 재판소 하단 티커 */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t-4 border-amber-500/30 bg-zinc-900/95 backdrop-blur">
        <button
          type="button"
          onClick={() => setIsMobileLogOpen(true)}
          className="w-full px-4 py-3 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span className="text-xs font-bold text-amber-400 shrink-0">실시간 재판소</span>
            {courtLogs.length > 0 && courtLogs[0] ? (
              <span className="text-xs text-zinc-400 truncate ml-2">
                {courtLogs[0].nickname}님이 {courtLogs[0].post_title ? `'${courtLogs[0].post_title.length > 20 ? `${courtLogs[0].post_title.slice(0, 20)}…` : courtLogs[0].post_title}'` : '사건'}에 {courtLogs[0].vote_type === "guilty" ? "유죄" : "무죄"} 판결
              </span>
            ) : (
              <span className="text-xs text-zinc-500 ml-2">아직 판결 기록이 없습니다.</span>
            )}
          </div>
          <span className="text-amber-500 text-xs shrink-0 ml-2">↑</span>
        </button>
      </div>

      {/* 모바일: 실시간 재판소 Slide-up 레이어 */}
      {isMobileLogOpen ? (
        <div className="md:hidden fixed inset-0 z-[200] flex flex-col">
          {/* 배경 오버레이 */}
          <button
            type="button"
            onClick={() => setIsMobileLogOpen(false)}
            className="absolute inset-0 bg-black/70"
            aria-label="닫기"
          />
          {/* Slide-up 패널 */}
          <div className="absolute bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur border-t-4 border-amber-500/30 rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] max-h-[80vh] flex flex-col animate-slide-up">
            {/* 헤더 */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div>
                <h3 className="text-lg font-black mb-1">실시간 재판소</h3>
                <p className="text-zinc-500 text-xs">정의는 멈추지 않는다, 지금 이 순간의 판결</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-amber-500 font-bold text-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  LIVE
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileLogOpen(false)}
                  className="text-zinc-400 hover:text-zinc-200 text-xl font-bold"
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
            </div>
            {/* 로그 내용 */}
            <div 
              ref={courtLogsRef}
              className="flex-1 overflow-y-auto p-4"
            >
              <div className="text-[10px] text-zinc-500/70 mb-3 font-mono uppercase tracking-wider">
                실시간 법정 기록 (Live Court Minutes)
              </div>
              {courtLogs.length === 0 ? (
                <p className="text-zinc-500 text-center py-8 text-xs sm:text-sm">아직 판결 기록이 없습니다.</p>
              ) : (
                <ul className="space-y-2 font-mono text-xs">
                  {courtLogs.map((log) => {
                    const date = new Date(log.created_at);
                    const timeStr = date.toLocaleTimeString("ko-KR", { 
                      hour: "2-digit", 
                      minute: "2-digit", 
                      second: "2-digit",
                      hour12: false 
                    });
                    const isGuilty = log.vote_type === "guilty";
                    return (
                      <li 
                        key={log.id}
                        onClick={() => {
                          const post = recentPosts.find((p) => p.id === log.post_id);
                          if (post) {
                            setSelectedPost(post);
                            setIsMobileLogOpen(false);
                          }
                        }}
                        className="text-zinc-300 py-1.5 px-2 rounded border-l-2 border-amber-500/20 bg-black/10 hover:bg-black/20 transition-all duration-300 cursor-pointer"
                        style={{
                          animation: "slideUp 0.3s ease-out",
                        }}
                      >
                        <span className="text-zinc-500 text-[10px] mr-2">[{timeStr}]</span>
                        <span className="text-zinc-500">{log.nickname}님이</span>
                        {log.post_title ? (
                          <>
                            <span className="text-amber-400 font-semibold mx-1">'{log.post_title.length > 25 ? `${log.post_title.slice(0, 25)}…` : log.post_title}'</span>
                            <span className="text-zinc-500">사건의 판결문에 날인했습니다.</span>
                          </>
                        ) : (
                          <span className="text-zinc-500 mx-1">사건의 판결문에 날인했습니다.</span>
                        )}
                        <span className={`font-bold ml-1.5 ${isGuilty ? "text-red-600" : "text-blue-600"}`}>
                          ({isGuilty ? "유죄" : "무죄"})
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* 최근 판결문 상세 모달 */}
      {selectedPost ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden p-3 md:p-4"
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
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 px-3 py-4 md:p-6 border-b border-zinc-800 bg-zinc-950">
              <h3 className="text-lg font-black text-amber-500">판결문 상세</h3>
              <button
                type="button"
                onClick={() => setSelectedPost(null)}
                className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-800 transition"
              >
                닫기
              </button>
            </div>
            <div className="px-3 py-4 space-y-6 md:p-6">
              {(() => {
                const isFinished = !isVotingOpen(selectedPost.created_at, selectedPost.voting_ended_at);
                const total = selectedPost.guilty + selectedPost.not_guilty;
                const guiltyPct = total ? Math.round((selectedPost.guilty / total) * 100) : 0;
                const notGuiltyPct = total ? Math.round((selectedPost.not_guilty / total) * 100) : 0;
                const aiRatio = selectedPost.ratio ?? 50;
                
                // 재판 목적에 따른 승소/패소 판정
                let isAuthorVictory = false;
                if (selectedPost.trial_type === "DEFENSE") {
                  // 무죄 주장(항변): 무죄_표 > 유죄_표 → 승소
                  isAuthorVictory = selectedPost.not_guilty > selectedPost.guilty;
                } else if (selectedPost.trial_type === "ACCUSATION") {
                  // 유죄 주장(기소): 유죄_표 > 무죄_표 → 승소
                  isAuthorVictory = selectedPost.guilty > selectedPost.not_guilty;
                } else {
                  // trial_type이 없는 경우 기존 로직 유지 (하위 호환성)
                  isAuthorVictory = aiRatio >= 50;
                }
                
                // 조합된 닉네임 생성
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
                            referrerPolicy="no-referrer"
                            className="w-full h-auto max-h-[min(36vh,280px)] object-contain bg-zinc-900"
                            onError={(e) => {
                              const el = e.target as HTMLImageElement;
                              el.style.display = "none";
                              const wrap = el.closest("div");
                              if (wrap) {
                                const msg = document.createElement("p");
                                msg.className = "text-xs text-amber-500/80 mt-2";
                                msg.textContent = "이미지를 불러올 수 없습니다. 저장소가 공개 설정인지 확인해 주세요.";
                                wrap.appendChild(msg);
                              }
                            }}
                          />
                        </a>
                        <div className="text-xs font-black tracking-widest uppercase text-zinc-500 mt-2">첨부 이미지</div>
                      </div>
                    ) : null}
                    <div className="flex items-start justify-between gap-4 mb-5">
                        <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {!isFinished && isUrgent(selectedPost.created_at) ? (
                            <span className="text-xs font-black text-red-500">[🔥 판결 임박]</span>
                          ) : null}
                          <span className="text-xs font-black tracking-widest uppercase text-zinc-500">사건 제목</span>
                        </div>
                        <h4 className="text-lg sm:text-xl md:text-2xl font-bold text-zinc-100 break-keep">{selectedPost.title}</h4>
                      </div>
                      <span className="text-xs font-black tracking-widest uppercase text-zinc-500 shrink-0">
                        사건 번호 {selectedPost.case_number != null ? selectedPost.case_number : "—"}
                      </span>
                    </div>
                    
                    {/* 판결 완료 시 승소/패소 UI */}
                    {isFinished && total > 0 ? (
                      <div className={`rounded-2xl border-2 p-4 md:p-8 mb-6 relative overflow-hidden ${
                        isAuthorVictory
                          ? "border-[#FFD700]/60 bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent shadow-[0_0_40px_rgba(255,215,0,0.3)]"
                          : "border-zinc-600 bg-zinc-900/50"
                      }`}>
                        {/* [판결 확정] 도장 효과 - 모바일: 작은 배지, PC: 큰 도장 */}
                        <div className={`absolute top-2 right-2 md:top-4 md:right-4 transform rotate-12 ${
                          isAuthorVictory ? "border-[#FFD700]" : "border-zinc-600"
                        } border-2 px-2 py-0.5 md:px-3 md:py-1 rounded`}>
                          <span className={`text-[10px] md:text-xs font-black ${
                            isAuthorVictory ? "text-[#FFD700]" : "text-zinc-500"
                          }`}>
                            [판결 확정]
                          </span>
                        </div>
                        
                        {/* 승소/패소 메인 텍스트 */}
                        <div className="text-center py-4 md:py-8">
                          <div className={`font-black text-3xl md:text-5xl mb-2 md:mb-4 ${
                            isAuthorVictory
                              ? "text-[#FFD700] bg-gradient-to-r from-[#FFD700] to-amber-500 bg-clip-text text-transparent"
                              : "text-zinc-500"
                          }`}>
                            {isAuthorVictory ? "🏆 최종 승소" : "🔨 최종 패소"}
                          </div>
                          
                          {/* 판결문 연출 */}
                          <p className={`text-sm md:text-base font-bold mt-2 md:mt-4 ${
                            isAuthorVictory ? "text-amber-300" : "text-zinc-400"
                          }`}>
                            {isAuthorVictory
                              ? selectedPost.trial_type === "DEFENSE"
                                ? `${authorName}의 항변이 받아들여졌습니다! [최종 승소]`
                                : `${authorName}의 기소가 성공했습니다! [최종 승소]`
                              : `배심원단이 ${authorName}의 주장을 기각했습니다. [최종 패소]`
                            }
                          </p>
                          
                          {/* 작은 데이터 텍스트 */}
                          <p className="text-[10px] md:text-xs text-zinc-600 mt-1 md:mt-2">
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
                        <p className="text-xs sm:text-sm font-bold text-amber-400">
                          ⏳ 남은 시간 <span className="tabular-nums">{formatCountdown(Math.max(0, getVotingEndsAt(selectedPost.created_at) - countdownNow))}</span>
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-zinc-400">
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
                              const r = await fetch(`/api/admin/delete?type=post&id=${selectedPost.id}`, {
                                method: "DELETE",
                              });
                              if (r.ok) {
                                setSelectedPost(null);
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
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditPostId(selectedPost.id);
                              setEditTitle(selectedPost.title);
                              setEditContent(selectedPost.content ?? "");
                              setEditPassword("");
                              setEditError(null);
                              setPostMenuOpenId(null);
                            }}
                            className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800"
                          >
                            판결문 수정
                          </button>
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
                      {selectedPost.content}
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      작성된 사건 경위가 없습니다.
                    </p>
                  )}
                </div>
              </section>

              <div className="my-6 border-t border-dashed border-zinc-700" />

              {/* 섹션 2: ⚖️ AI 대법관 선고 - 메인 영역 */}
              {(() => {
                const isFinished = !isVotingOpen(selectedPost.created_at, selectedPost.voting_ended_at);
                const aiRatio = selectedPost.ratio ?? 50;
                const verdictText = typeof selectedPost.verdict === "string" ? selectedPost.verdict : "";
                const isDefense =
                  selectedPost.trial_type === "DEFENSE" ||
                  (verdictText.includes("원고 무죄") && selectedPost.trial_type !== "ACCUSATION");
                const notGuiltyPct = isDefense ? aiRatio : 100 - aiRatio;
                const guiltyPct = isDefense ? 100 - aiRatio : aiRatio;
                const primaryLabel = isDefense ? "무죄" : "유죄";
                const primaryPct = isDefense ? notGuiltyPct : guiltyPct;
                const isFiftyFifty = guiltyPct === 50 && notGuiltyPct === 50;
                const neutralReason =
                  "본 사건은 원고와 피고의 주장이 법리적으로 팽팽히 맞서고 있어, 현재의 알고리즘으로는 확정적 판결을 내릴 수 없는 '법리적 난제'입니다.";

                return (
                  <section className="space-y-4">
                    <div>
                      <div className="text-xs font-black tracking-widest uppercase text-zinc-400">
                        ⚖️ AI 대법관 선고
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        이 사건에 대한 AI 대법관의 최종 판단과 그 근거입니다.
                      </p>
                    </div>
                    <div className="relative overflow-hidden rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-zinc-900 to-zinc-950 px-3 py-4 md:px-5 md:py-5 shadow-[0_0_35px_rgba(245,158,11,0.25)] w-full">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs sm:text-base font-semibold text-amber-100 min-w-0 truncate">
                          {isFinished ? "AI 최종 판결" : "AI 현재 예측"}
                        </span>
                        <span className="inline-flex shrink-0 items-center rounded-full border border-amber-400/80 bg-amber-500/15 px-2.5 py-0.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.7)]">
                          AI JUDGMENT
                        </span>
                      </div>
                      <div className="mt-3 md:mt-4 text-center space-y-1 md:space-y-2">
                        {isFiftyFifty ? (
                          <>
                            <p className="text-lg sm:text-2xl md:text-3xl font-black text-amber-400 whitespace-nowrap">
                              [ ⚖️ 판결 유보 : 판단 불가 ]
                            </p>
                            <p className="text-[11px] sm:text-xs text-amber-400/90 whitespace-nowrap tabular-nums">
                              유죄 50% · 무죄 50%
                            </p>
                          </>
                        ) : (
                          <>
                            <p
                              className={`text-lg sm:text-2xl md:text-3xl font-black whitespace-nowrap ${
                                primaryLabel === "유죄" ? "text-red-300" : "text-blue-300"
                              }`}
                            >
                              {primaryLabel} <span className="tabular-nums">{primaryPct}%</span>
                            </p>
                            <p className="text-[11px] sm:text-xs text-zinc-300 whitespace-nowrap">
                              유죄 {guiltyPct}% · 무죄 {notGuiltyPct}%
                            </p>
                          </>
                        )}
                      </div>
                      <div className="mt-3 md:mt-4 relative h-2 rounded-full bg-zinc-800 overflow-visible flex w-full">
                        <div
                          className={`h-full rounded-l-full ${
                            isFiftyFifty ? "bg-red-500/80" : primaryLabel === "유죄" ? "bg-red-500/80" : "bg-blue-500/80"
                          }`}
                          style={{
                            width: `${isFiftyFifty ? 50 : primaryLabel === "유죄" ? guiltyPct : notGuiltyPct}%`,
                          }}
                        />
                        {isFiftyFifty ? (
                          <span
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-amber-400/90 bg-zinc-900 text-[10px] font-black text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                            aria-hidden
                          >
                            ⚡
                          </span>
                        ) : null}
                        <div
                          className={`h-full rounded-r-full ${
                            isFiftyFifty ? "bg-blue-500/80" : primaryLabel === "유죄" ? "bg-blue-500/50" : "bg-red-500/50"
                          }`}
                          style={{
                            width: `${isFiftyFifty ? 50 : primaryLabel === "유죄" ? notGuiltyPct : guiltyPct}%`,
                          }}
                        />
                      </div>
                      <div className="mt-3 md:mt-4 text-[11px] sm:text-xs font-semibold text-amber-100/90">
                        AI 판결 근거
                      </div>
                      <p className="mt-1 text-xs sm:text-base text-amber-50 leading-relaxed whitespace-pre-wrap break-keep">
                        {isFiftyFifty ? neutralReason : verdictText || "AI 판결 이유가 아직 준비되지 않았습니다."}
                      </p>
                    </div>
                  </section>
                );
              })()}

              <div className="my-6 border-t border-dashed border-zinc-700" />

              {/* 섹션 3: 👥 배심원 평결 및 한마디 */}
              <div className="mb-4">
                <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                  <span>👥 배심원 평결 및 한마디</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  AI의 판결에 대해 배심원들이 어떻게 생각하는지 한눈에 볼 수 있습니다.
                </p>
              </div>

              {/* 상세 모달 내 투표 - 무죄주장이면 무죄가 앞(왼쪽) */}
              {isVotingOpen(selectedPost.created_at, selectedPost.voting_ended_at) ? (
                <div className="space-y-3">
                  <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    {(() => {
                      const total = selectedPost.guilty + selectedPost.not_guilty;
                      const guiltyPct = total ? Math.round((selectedPost.guilty / total) * 100) : 0;
                      const notGuiltyPct = total ? Math.round((selectedPost.not_guilty / total) * 100) : 0;
                      const isDefense = selectedPost.trial_type === "DEFENSE";
                      const first = isDefense ? "not_guilty" : "guilty";
                      const second = isDefense ? "guilty" : "not_guilty";
                      return (
                        <>
                          <button
                            type="button"
                            disabled={votingId === selectedPost.id}
                            onClick={() => handleVote(selectedPost.id, first)}
                            className={`w-full md:w-auto rounded-lg px-4 py-2 md:py-1.5 h-16 md:h-auto text-sm md:text-xs font-bold transition disabled:opacity-50 shadow-sm ${
                              first === "not_guilty"
                                ? (userVotes[selectedPost.id] === "not_guilty" ? "bg-blue-500/50 ring-1 ring-blue-400/60 text-blue-100" : "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400")
                                : (userVotes[selectedPost.id] === "guilty" ? "bg-red-500/50 ring-1 ring-red-400/60 text-red-100" : "bg-red-500/20 hover:bg-red-500/30 text-red-400")
                            }`}
                          >
                            {first === "not_guilty" ? (isDefense ? "원고 무죄" : "피고 무죄") : (isDefense ? "원고 유죄" : "피고 유죄")} ({first === "not_guilty" ? notGuiltyPct : guiltyPct}%) {first === "not_guilty" ? selectedPost.not_guilty : selectedPost.guilty}표
                          </button>
                          <button
                            type="button"
                            disabled={votingId === selectedPost.id}
                            onClick={() => handleVote(selectedPost.id, second)}
                            className={`w-full md:w-auto rounded-lg px-4 py-2 md:py-1.5 h-16 md:h-auto text-sm md:text-xs font-bold transition disabled:opacity-50 shadow-sm ${
                              second === "not_guilty"
                                ? (userVotes[selectedPost.id] === "not_guilty" ? "bg-blue-500/50 ring-1 ring-blue-400/60 text-blue-100" : "bg-blue-500/20 hover:bg-blue-500/30 text-blue-400")
                                : (userVotes[selectedPost.id] === "guilty" ? "bg-red-500/50 ring-1 ring-red-400/60 text-red-100" : "bg-red-500/20 hover:bg-red-500/30 text-red-400")
                            }`}
                          >
                            {second === "not_guilty" ? (isDefense ? "원고 무죄" : "피고 무죄") : (isDefense ? "원고 유죄" : "피고 유죄")} ({second === "not_guilty" ? notGuiltyPct : guiltyPct}%) {second === "not_guilty" ? selectedPost.not_guilty : selectedPost.guilty}표
                          </button>
                        </>
                      );
                    })()}
                  </div>
                  {/* 대법관: 재판 완료 버튼만 (투표는 위 유죄/무죄 버튼과 동일) */}
                  {isOperatorLoggedIn ? (
                    <div className="pt-2 border-t border-zinc-800" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm("이 재판을 즉시 완료하시겠습니까?")) return;
                          try {
                            const r = await fetch("/api/admin/complete", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ post_id: selectedPost.id }),
                            });
                            if (r.ok) {
                              window.location.href = (window.location.pathname || "/") + "?tab=completed";
                            }
                          } catch (err) {
                            console.error("완료 실패:", err);
                          }
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-black text-xs font-bold transition"
                      >
                        ✓ 재판 완료
                      </button>
                    </div>
                  ) : null}
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

              {/* 배심원 평결: 유죄/무죄 비율 수평 막대 그래프 (무죄주장일 땐 무죄가 왼쪽). 50:50 시 공유 카드 펀치라인: "당신은 배심원들도 포기한 '희대의 난제' 제조기입니다!" */}
              {(() => {
                const totalVotes = selectedPost.guilty + selectedPost.not_guilty;
                if (!totalVotes) return null;

                const guiltyVotes = selectedPost.guilty;
                const notGuiltyVotes = selectedPost.not_guilty;
                const isJuryFiftyFifty = guiltyVotes === notGuiltyVotes;

                const rawGuiltyPct = Math.round((selectedPost.guilty / totalVotes) * 100);
                const rawNotGuiltyPct = 100 - rawGuiltyPct;
                const isDefense = selectedPost.trial_type === "DEFENSE";

                const leftLabel = isDefense ? "무죄" : "유죄";
                const rightLabel = isDefense ? "유죄" : "무죄";
                const leftPct = isDefense ? rawNotGuiltyPct : rawGuiltyPct;
                const rightPct = isDefense ? rawGuiltyPct : rawNotGuiltyPct;
                const leftColor = isDefense ? "#3b82f6" : "#ef4444";
                const rightColor = isDefense ? "#ef4444" : "#3b82f6";
                const leftIcon = isDefense ? "⚖️" : "🔥";
                const rightIcon = isDefense ? "🔥" : "⚖️";

                return (
                  <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-3 py-4 md:px-4 space-y-3 w-full">
                    {isJuryFiftyFifty ? (
                      <div className="text-center">
                        <p className="text-sm sm:text-base font-black text-amber-400 whitespace-nowrap">
                          [ ⚖️ 민심 교착 : 세기의 난제 ]
                        </p>
                        <p className="mt-0.5 text-[11px] sm:text-xs text-amber-400/80 tabular-nums whitespace-nowrap">
                          유죄 50% · 무죄 50%
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 text-[11px] sm:text-sm text-zinc-200 w-full min-w-0">
                        <div
                          className={`flex items-center gap-1 min-w-0 shrink-0 whitespace-nowrap ${
                            leftLabel === "유죄" ? "text-red-300" : "text-blue-300"
                          }`}
                        >
                          <span>{leftIcon}</span>
                          <span className="font-semibold tabular-nums">
                            {leftLabel} {leftPct}%
                          </span>
                        </div>
                        <div
                          className={`flex items-center gap-1 min-w-0 shrink-0 whitespace-nowrap ${
                            rightLabel === "유죄" ? "text-red-300" : "text-blue-300"
                          }`}
                        >
                          <span className="font-semibold tabular-nums">
                            {rightLabel} {rightPct}%
                          </span>
                          <span>{rightIcon}</span>
                        </div>
                      </div>
                    )}
                    <div className="relative mt-2 h-8 w-full rounded-full bg-zinc-800 overflow-visible">
                      <div className="absolute inset-0 flex items-center justify-between px-3 text-[10px] sm:text-xs font-semibold text-zinc-100/70 pointer-events-none z-[1]">
                        {!isJuryFiftyFifty && (
                          <>
                            <span className="flex items-center gap-1">
                              {leftIcon} <span>{leftLabel}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <span>{rightLabel}</span> {rightIcon}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="relative flex h-full w-full rounded-full overflow-visible">
                        <div
                          className={`h-full transition-all duration-1000 rounded-l-full ${isJuryFiftyFifty ? "animate-pulse" : ""}`}
                          style={{
                            width: `${juryBarAnimated ? (isJuryFiftyFifty ? 50 : leftPct) : 0}%`,
                            backgroundColor: leftColor,
                            minWidth: isJuryFiftyFifty ? "50%" : undefined,
                          }}
                        />
                        {isJuryFiftyFifty ? (
                          <span
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-amber-400/90 bg-zinc-900 text-xs font-black text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.5)] animate-pulse"
                            aria-hidden
                          >
                            ⚡
                          </span>
                        ) : null}
                        <div
                          className={`h-full transition-all duration-1000 rounded-r-full ${isJuryFiftyFifty ? "animate-pulse" : ""}`}
                          style={{
                            width: `${juryBarAnimated ? (isJuryFiftyFifty ? 50 : rightPct) : 0}%`,
                            backgroundColor: rightColor,
                            minWidth: isJuryFiftyFifty ? "50%" : undefined,
                          }}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-center text-zinc-400">
                      {isJuryFiftyFifty ? (
                        <>
                          배심원{" "}
                          <span className="font-semibold text-amber-300">
                            {totalVotes.toLocaleString("ko-KR")}
                          </span>
                          명이 참여했으나, 누구도 승리를 장담할 수 없는 팽팽한 대립이 이어지고 있습니다. 당신의 한 표가 정의를 결정합니다!
                        </>
                      ) : (
                        <>
                          지금까지{" "}
                          <span className="font-semibold text-amber-300">
                            {totalVotes.toLocaleString("ko-KR")}
                          </span>
                          명의 배심원이 참여했습니다.
                        </>
                      )}
                    </p>
                  </div>
                );
              })()}

              {/* 배심원 한마디 (대댓글 지원) */}
              <div className="border-t border-zinc-800 pt-6">
                <div className="mb-3 text-xs font-black tracking-widest uppercase text-zinc-500">
                  배심원 한마디 (댓글)
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
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] sm:text-xs text-amber-200 min-w-0">
                          <span className="min-w-0 flex-1 truncate break-keep">
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
                    ref={commentInputRef}
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    disabled={commentSubmitting}
                    placeholder={replyToId ? "대댓글을 입력하세요 (최대 2000자)" : "익명으로 배심원 한마디를 남기세요 (최대 2000자)"}
                    maxLength={2000}
                    className="w-full min-h-[80px] resize-y rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition disabled:opacity-60 md:px-4 md:py-3"
                  />
                  <input
                    type="password"
                    value={commentFormPassword}
                    onChange={(e) => setCommentFormPassword(e.target.value)}
                    disabled={commentSubmitting}
                    placeholder="삭제 비밀번호 (삭제 시 필요, 20자 이내)"
                    maxLength={20}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-amber-500/60 md:px-4"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] sm:text-xs text-zinc-500 whitespace-nowrap">{commentInput.length}/2000</span>
                    <button
                      type="submit"
                      disabled={!commentInput.trim() || !commentFormPassword.trim() || commentSubmitting}
                      className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs sm:text-sm font-bold text-black hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed md:px-4 md:py-2"
                    >
                      {commentSubmitting ? "등록 중..." : replyToId ? "답글 등록" : "한마디 등록"}
                    </button>
                  </div>
                </form>
                {commentsLoading ? (
                  <div className="mt-4 text-sm text-zinc-500">한마디 불러오는 중...</div>
                ) : (
                  <>
                    <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-4 text-[11px] text-zinc-500">
                      <button
                        type="button"
                        onClick={() => setCommentSort("latest")}
                        className={`shrink-0 whitespace-nowrap ${commentSort === "latest" ? "font-semibold text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
                      >
                        최신순
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommentSort("popular")}
                        className={`shrink-0 whitespace-nowrap ${commentSort === "popular" ? "font-semibold text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
                      >
                        인기순(발도장순)
                      </button>
                    </div>
                    {commentTree.top.length === 0 ? (
                      <p className="mt-4 text-sm text-zinc-500">아직 배심원 한마디가 없습니다.</p>
                    ) : (
                      <div className="mt-4 max-h-[260px] overflow-y-auto pr-1">
                        <ul className="space-y-4">
                    {commentTree.top.map((c) => {
                      const isOperator = c.is_operator === true;
                      return (
                      <li key={c.id} className="space-y-0 w-full min-w-0">
                        <div className={`rounded-xl border px-3 py-2.5 md:px-4 md:py-3 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-keep w-full min-w-0 ${
                          isOperator 
                            ? "border-amber-500/40 bg-amber-500/10 text-zinc-100 shadow-[0_0_12px_rgba(245,158,11,0.15)]" 
                            : "border-zinc-800 bg-zinc-900/80 text-zinc-200"
                        }`}>
                          <div className="mb-1 flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] min-w-0">
                            <span className={`font-bold shrink-0 whitespace-nowrap ${isOperator ? "text-amber-400" : "text-amber-300"}`}>
                              {jurorLabels[c.author_id ?? "__anon__"] ?? "배심원"}
                            </span>
                            {isOperator ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/30 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-black text-amber-200 border border-amber-500/50 whitespace-nowrap">
                                ⚖️ 대법관
                              </span>
                            ) : null}
                            {selectedPost.author_id && c.author_id === selectedPost.author_id ? (
                              <span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-amber-300 whitespace-nowrap">
                                작성자
                              </span>
                            ) : null}
                          </div>
                          <div className={`min-w-0 break-keep ${isOperator ? "font-semibold" : ""}`}>{c.content}</div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-[11px] text-zinc-500 min-w-0">
                              {c.created_at ? (
                                <span className="whitespace-nowrap tabular-nums">
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
                                className={`flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-[11px] shrink-0 whitespace-nowrap ${
                                  likedCommentIds.has(c.id) ? "text-amber-400 font-bold" : "text-zinc-500 hover:text-zinc-300"
                                }`}
                              >
                                <span>🐾</span>
                                <span className="tabular-nums">{c.likes}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setReplyToId(replyToId === c.id ? null : c.id)}
                                className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-[11px] hover:text-zinc-300 shrink-0 whitespace-nowrap"
                                aria-label={replyToId === c.id ? "답글 취소" : "답글"}
                              >
                                <span aria-hidden>💬</span>
                                {replyToId === c.id ? "취소" : ""}
                              </button>
                            </div>
                            <div className="relative shrink-0">
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
                                          const r = await fetch(`/api/admin/delete?type=comment&id=${c.id}`, {
                                            method: "DELETE",
                                          });
                                          if (r.ok) {
                                            setComments((prev) => prev.filter((cc) => cc.id !== c.id));
                                          }
                                        } catch (err) {
                                          console.error("삭제 실패:", err);
                                        }
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
                                        onClick={() => {
                                          setCommentDeleteTargetId(c.id);
                                          setCommentMenuOpenId(null);
                                        }}
                                        className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
                                      >
                                        댓글 삭제
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          openReportModal("comment", c.id);
                                          setCommentMenuOpenId(null);
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
                        {(commentTree.byParent.get(c.id) ?? []).map((reply) => {
                          const isReplyOperator = reply.is_operator === true;
                          return (
                          <div
                            key={reply.id}
                            className={`ml-4 sm:ml-6 pl-3 sm:pl-4 py-1.5 sm:py-2 border-l-2 rounded-r-lg relative cursor-pointer transition w-full min-w-0 ${
                              isReplyOperator
                                ? "border-amber-500/50 bg-amber-500/15 hover:bg-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.1)]"
                                : "border-amber-500/30 bg-zinc-900/50 hover:bg-zinc-800/50"
                            }`}
                            onClick={() => {
                              setReplyToId(reply.id);
                            }}
                          >
                            <span
                              className={`absolute -left-[0.6rem] top-2 text-xs sm:text-sm font-bold leading-none ${
                                isReplyOperator ? "text-amber-400" : "text-amber-500/80"
                              }`}
                              aria-hidden
                            >
                              ㄴ
                            </span>
                            <div className="pl-2 min-w-0">
                              {isReplyOperator ? (
                                <span className="inline-flex shrink-0 items-center gap-1 mb-1 rounded-full bg-amber-500/30 px-1.5 py-0.5 text-[9px] font-black text-amber-200 border border-amber-500/50 whitespace-nowrap">
                                  ⚖️ 대법관
                                </span>
                              ) : null}
                              <p className={`text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-keep min-w-0 ${
                                isReplyOperator ? "text-zinc-100 font-semibold" : "text-zinc-300"
                              }`}>
                                {reply.content}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-[11px] text-zinc-500 min-w-0">
                                  {reply.created_at ? (
                                    <span className="whitespace-nowrap tabular-nums">
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
                                    className={`flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-[11px] shrink-0 whitespace-nowrap ${
                                      likedCommentIds.has(reply.id) ? "text-amber-400 font-bold" : "text-zinc-500 hover:text-zinc-300"
                                    }`}
                                  >
                                    <span>🐾</span>
                                    <span className="tabular-nums">{reply.likes}</span>
                                  </button>
                                </div>
                                <div className="relative shrink-0">
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
                                              const r = await fetch(`/api/admin/delete?type=comment&id=${reply.id}`, {
                                                method: "DELETE",
                                              });
                                              if (r.ok) {
                                                setComments((prev) => prev.filter((cc) => cc.id !== reply.id));
                                              }
                                            } catch (err) {
                                              console.error("삭제 실패:", err);
                                            }
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
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setCommentDeleteTargetId(reply.id);
                                              setCommentMenuOpenId(null);
                                            }}
                                            className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800"
                                          >
                                            댓글 삭제
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              openReportModal("comment", reply.id);
                                              setCommentMenuOpenId(null);
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
                          </div>
                          );
                        })}
                          </li>
                        );
                      })}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <p className="text-zinc-500 text-sm">로딩 중...</p>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}