"use client";

import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/app/components/Logo";
import { animate, motion } from "framer-motion";

const CoupangBanner = dynamic(
  () => import("@/app/components/CoupangBanner").then((m) => m.CoupangBanner),
  { ssr: false, loading: () => <div className="h-16 w-full rounded-xl bg-zinc-900/50 animate-pulse" /> }
);
const CoupangLinkBanner = dynamic(
  () => import("@/app/components/CoupangLinkBanner").then((m) => m.CoupangLinkBanner),
  { ssr: false, loading: () => <div className="h-10 w-full rounded-lg bg-zinc-900/50 animate-pulse" /> }
);
const LiveCourtAside = dynamic(
  () => import("@/app/components/LiveCourtSection").then((m) => m.LiveCourtAside),
  { ssr: false, loading: () => <div className="hidden md:block h-64 rounded-xl bg-zinc-900/30 animate-pulse" /> }
);
const LiveCourtTicker = dynamic(
  () => import("@/app/components/LiveCourtSection").then((m) => m.LiveCourtTicker),
  { ssr: false, loading: () => <div className="h-14 bg-zinc-900/50" /> }
);
const ScoreboardSection = dynamic(
  () => import("@/app/components/ScoreboardSection").then((m) => m.ScoreboardSection),
  { ssr: false, loading: () => <div className="h-24 rounded-2xl bg-zinc-900/30 animate-pulse" /> }
);
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { maskCommentIp } from "@/lib/comment";
import { useBlockedKeywords } from "@/lib/useBlockedKeywords";
import { parseImageUrls } from "@/lib/image-urls";
import { sanitizeVerdictDisplay, sanitizeCaseContentDisplay } from "@/lib/sanitize-verdict-display";
import { getPrimaryLabelFromVerdictAndRatio, getConclusionFromVerdictText } from "@/lib/verdict-conclusion";

const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;
const URGENT_THRESHOLD_MS = 3 * 60 * 60 * 1000;

/** 빈 응답/잘못된 JSON으로 인한 JSON.parse 오류 방지 */
async function safeJsonFromResponse<T = object>(r: Response): Promise<T> {
  const text = await r.text();
  if (!text || !text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

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

/** DB ratio 값(피고인 과실 0~100)을 number | null로 정규화 */
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
    imageUrls?: string[];
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

  type PostPreview = {
    id: string;
    title: string;
    plaintiff: string | null;
    defendant: string | null;
    content: string | null;
    verdict: string;
    /** 기소 직후 판결문에 나오는 긴 설명문 (ratio.rationale). 없으면 빈 문자열 */
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
  const [topGuiltyPostCommentCount, setTopGuiltyPostCommentCount] = useState<number | null>(null);
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
    is_post_author?: boolean;
    ip_address?: string | null;
  };
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
  const [juryBarAnimated, setJuryBarAnimated] = useState(false);
  const [commentDeleteError, setCommentDeleteError] = useState<string | null>(null);

  const [reportTarget, setReportTarget] = useState<{
    type: "post" | "comment" | null;
    id: string | null;
  }>({ type: null, id: null });
  const [reportReason, setReportReason] = useState<string>("욕설/비하");

  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [commentSort, setCommentSort] = useState<"oldest" | "latest" | "popular">("oldest");
  const [commentMenuOpenId, setCommentMenuOpenId] = useState<string | null>(null);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const [postMenuOpenId, setPostMenuOpenId] = useState<string | null>(null);
  const [deletePostId, setDeletePostId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteToast, setDeleteToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const [trialTab, setTrialTab] = useState<"ongoing" | "completed">("ongoing");
  const [ongoingSort, setOngoingSort] = useState<"latest" | "votes" | "urgent">("latest");
  const [completedSort, setCompletedSort] = useState<"latest" | "votes">("latest");
  const [liveFeedItems, setLiveFeedItems] = useState<Array<{
    id: string;
    post_id: string;
    post_title: string | null;
    vote_type: string;
    voter_display: string | null;
    created_at: string;
    category: string | null;
  }>>([]);
  type CourtLogVote = {
    kind: "vote";
    id: string;
    post_id: string;
    post_title: string | null;
    vote_type: "guilty" | "not_guilty";
    voter_id: string;
    nickname: string;
    created_at: string;
  };
  type CourtLogComment = {
    kind: "comment";
    id: string;
    post_id: string;
    post_title: string | null;
    nickname: string;
    created_at: string;
  };
  type CourtLogEntry = CourtLogVote | CourtLogComment;
  const [courtLogs, setCourtLogs] = useState<CourtLogEntry[]>([]);
  const courtLogsRef = useRef<HTMLDivElement | null>(null);
  const asideRef = useRef<HTMLDivElement | null>(null);
  const loggedVotes = useRef<Set<string>>(new Set()); // 중복 방지용: "post_id:ip_address" 형식
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [isOperatorLoggedIn, setIsOperatorLoggedIn] = useState(false);
  const [isMobileLogOpen, setIsMobileLogOpen] = useState(false);
  useEffect(() => {
    if (!isMobileLogOpen) courtLogsRef.current = asideRef.current;
  }, [isMobileLogOpen]);
  useLayoutEffect(() => {
    if (!isMobileLogOpen) courtLogsRef.current = asideRef.current;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [todayConfirmed, setTodayConfirmed] = useState<number | null>(null);
  const [yesterdayConfirmed, setYesterdayConfirmed] = useState<number | null>(null);
  const [cumulativeConfirmed, setCumulativeConfirmed] = useState<number | null>(null);
  const [cumulativeStatsError, setCumulativeStatsError] = useState<string | null>(null);
  const [deferredReady, setDeferredReady] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const postsListRef = useRef<HTMLElement | null>(null);
  const hallOfFameRef = useRef<HTMLElement | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const deletePasswordRef = useRef<HTMLInputElement | null>(null);
  const commentDeletePasswordRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const verdictDetailRef = useRef<HTMLDivElement | null>(null);
  const commentsSectionRef = useRef<HTMLDivElement | null>(null);
  const [commentCountsByPostId, setCommentCountsByPostId] = useState<Record<string, number>>({});
  const [viewCountsByPostId, setViewCountsByPostId] = useState<Record<string, number>>({});
  const [scrollToCommentsOnOpen, setScrollToCommentsOnOpen] = useState(false);
  const { mask: maskBlocked } = useBlockedKeywords();

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

  // 실시간 사법 전광판: 오늘/어제/누적 한 번에 조회, 채널·폴링 1개로 통합
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const cols = "id, created_at, voting_ended_at";
    const endedAt = (row: { created_at: string | null; voting_ended_at: string | null }) => {
      if (row.voting_ended_at) return new Date(row.voting_ended_at).getTime();
      const created = row.created_at ? new Date(row.created_at).getTime() : 0;
      return created + TRIAL_DURATION_MS;
    };

    const loadAllBoardStats = async () => {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(startOfToday);
      endOfToday.setDate(endOfToday.getDate() + 1);
      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      const fromDate = new Date(startOfToday);
      fromDate.setDate(fromDate.getDate() - 3);

      try {
        const [recentRes, cumulativeRes] = await Promise.all([
          supabase
            .from("posts")
            .select(cols)
            .neq("status", "판결불가")
            .gte("created_at", fromDate.toISOString()),
          supabase
            .from("posts")
            .select(cols)
            .neq("status", "판결불가")
            .limit(10000),
        ]);

        if (recentRes.error) throw recentRes.error;
        const recentRows = (recentRes.data ?? []) as Array<{ created_at: string | null; voting_ended_at: string | null }>;
        let today = 0;
        let yesterday = 0;
        for (const row of recentRows) {
          if (isVotingOpen(row.created_at ?? null, row.voting_ended_at ?? null)) continue;
          const t = endedAt(row);
          if (t >= startOfToday.getTime() && t < endOfToday.getTime()) today++;
          else if (t >= startOfYesterday.getTime() && t < startOfToday.getTime()) yesterday++;
        }
        setTodayConfirmed(today);
        setYesterdayConfirmed(yesterday);

        if (cumulativeRes.error) throw cumulativeRes.error;
        const cumRows = (cumulativeRes.data ?? []) as Array<{ created_at: string | null; voting_ended_at: string | null }>;
        const cumulative = cumRows.filter((row) =>
          !isVotingOpen(row.created_at ?? null, row.voting_ended_at ?? null),
        ).length;
        setCumulativeConfirmed(cumulative);
        setCumulativeStatsError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[GAEPAN] 전광판 집계 오류:", msg);
        setCumulativeStatsError("누적 확정 사건을 불러오지 못했습니다.");
      }
    };

    loadAllBoardStats();
    const channel = supabase
      .channel("board-stats-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, loadAllBoardStats)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "posts" }, loadAllBoardStats)
      .subscribe(() => {});
    const t = setInterval(loadAllBoardStats, 30_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(t);
    };
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
        window.history.replaceState(null, "", "/");
      });
  }, [searchParams]);

  // 비필수 요청 지연: 첫 페인트 후 실행
  useEffect(() => {
    const t = setTimeout(() => setDeferredReady(true), 1200);
    return () => clearTimeout(t);
  }, []);

  // 운영자 로그인 상태 확인 (지연 실행)
  useEffect(() => {
    if (!deferredReady) return;
    fetch("/api/admin/check")
      .then((r) => safeJsonFromResponse<{ loggedIn?: boolean }>(r))
      .then((data) => {
        setIsOperatorLoggedIn(data.loggedIn === true);
      })
      .catch(() => setIsOperatorLoggedIn(false));
  }, [deferredReady]);

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
    setCreatedPostId(null);
    setJudgeError(null);
    setUploadError(null);
  };

  const canSubmit = useMemo(() => {
    const ok =
      form.title.trim().length > 0 &&
      form.details.trim().length > 0 &&
      form.password.trim().length > 0 &&
      form.category.trim().length > 0;
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
      verdict_rationale:
        (typeof row.verdict_rationale === "string"
          ? row.verdict_rationale
          : typeof (row as Record<string, unknown>).verdictRationale === "string"
            ? String((row as Record<string, unknown>).verdictRationale)
            : "") as string,
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

    const isRlsOrPolicyError = (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      return /row-level security|policy|RLS/i.test(msg);
    };

    const load = async () => {
      setIsLoadingPosts(true);
      setPostsError(null);
      try {
        const postColumns = "id, title, plaintiff, defendant, content, verdict, verdict_rationale, ratio, created_at, guilty, not_guilty, image_url, author_id, case_number, category, trial_type, voting_ended_at, ip_address";
        const [{ data: topData, error: topError }, { data: listData, error: listError }, { data: blockedRows }] =
          await Promise.all([
            supabase
              .from("posts")
              .select(postColumns)
              .neq("status", "판결불가")
              .order("guilty", { ascending: false })
              .limit(1),
            supabase
              .from("posts")
              .select(postColumns)
              .neq("status", "판결불가")
              .order("created_at", { ascending: false })
              .limit(100),
            supabase.from("blocked_ips").select("ip_address"),
          ]);

        if (topError) throw topError;
        if (listError) throw listError;

        const blockedSet = new Set(
          (blockedRows ?? [])
            .map((r) => (r as { ip_address?: string | null }).ip_address)
            .filter((ip): ip is string => typeof ip === "string" && ip.length > 0),
        );

        const mapPost = (row: Record<string, unknown>) => toPostPreview(row);

        const topPost =
          topData?.[0] && !blockedSet.has(String((topData[0] as any).ip_address ?? ""))
            ? mapPost(topData[0] as Record<string, unknown>)
            : null;

        if (topPost) setTopGuiltyPost(topPost);
        else setTopGuiltyPost(null);

        const list = (listData ?? [])
          .filter((row) => {
            const ip = (row as any).ip_address as string | null | undefined;
            return !ip || !blockedSet.has(String(ip));
          })
          .map((row) => mapPost(row as Record<string, unknown>));

        setRecentPosts(list);
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

  // 실시간 재판소: vote_events 구독 (지연 실행으로 초기 로딩 완화)
  useEffect(() => {
    if (!deferredReady) return;
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
  }, [deferredReady, recentPosts]);

  // 실시간 재판소: votes 구독 (법정 기록 로그 창용, 지연 실행)
  useEffect(() => {
    if (!deferredReady) return;
    const supabase = getSupabaseBrowserClient();
    
    // 초기 데이터 로드 (최근 50개) — 진행 중/확정 구분 없이 최근 기록 표시
    supabase
      .from("votes")
      .select("id, post_id, ip_address, choice, created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        const voteLogs: CourtLogEntry[] = [];
        const seen = new Set<string>();
        if (data?.length) {
          const reversed = [...data].reverse();
          for (const item of reversed) {
            const postId = String(item.post_id ?? "");
            const voterId = String(item.ip_address ?? "");
            const key = `${postId}:${voterId}`;
            if (seen.has(key)) continue;
            const post = recentPosts.find((p) => p.id === postId);
            seen.add(key);
            const nickname = generateCourtNickname(postId, voterId);
            voteLogs.push({
              kind: "vote",
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
        }

        // 댓글 초기 로드 후 투표 로그와 병합 (진행 중/확정 모두 포함)
        void Promise.resolve(
          supabase
            .from("comments")
            .select("id, post_id, ip_address, created_at")
            .order("created_at", { ascending: false })
            .limit(50)
        )
          .then(({ data: commentData }) => {
            const commentLogs: CourtLogEntry[] = (commentData ?? []).map((c: Record<string, unknown>) => {
              const postId = String(c.post_id ?? "");
              const voterId = String(c.ip_address ?? "");
              const post = recentPosts.find((p) => p.id === postId);
              return {
                kind: "comment" as const,
                id: `comment-${c.id}`,
                post_id: postId,
                post_title: post?.title ?? null,
                nickname: generateCourtNickname(postId, voterId),
                created_at: String(c.created_at ?? ""),
              };
            });
            const merged = [...voteLogs.reverse(), ...commentLogs].sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
            setCourtLogs(merged.slice(0, 100));
          })
          .catch(() => {
            setCourtLogs(voteLogs.reverse());
          });
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
          
          if (loggedVotes.current.has(key)) return;
          const post = recentPosts.find((p) => p.id === postId);
          loggedVotes.current.add(key);
          const nickname = generateCourtNickname(postId, voterId);
          const voteType = (row.choice === "guilty" ? "guilty" : "not_guilty") as "guilty" | "not_guilty";
          
          const newLog: CourtLogEntry = {
            kind: "vote",
            id: String(row?.id ?? ""),
            post_id: postId,
            post_title: post?.title ?? null,
            vote_type: voteType,
            voter_id: voterId,
            nickname,
            created_at: String(row?.created_at ?? ""),
          };

          setCourtLogs((prev) => {
            const updated = [newLog, ...prev];
            return updated.slice(0, 100);
          });

          setTimeout(() => {
            courtLogsRef.current?.scrollTo({
              top: courtLogsRef.current.scrollHeight,
              behavior: "smooth",
            });
          }, 100);
        },
      )
      .subscribe(() => {});

    // 실시간 재판소: comments 구독 (배심원 한마디)
    const commentsChannel = supabase
      .channel("comments-live-court-log")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const postId = String(row?.post_id ?? "");
          const voterId = String(row?.ip_address ?? "");
          const post = recentPosts.find((p) => p.id === postId);
          const newLog: CourtLogEntry = {
            kind: "comment",
            id: `comment-${row?.id ?? ""}`,
            post_id: postId,
            post_title: post?.title ?? null,
            nickname: generateCourtNickname(postId, voterId),
            created_at: String(row?.created_at ?? ""),
          };
          setCourtLogs((prev) => {
            const updated = [newLog, ...prev];
            return updated.slice(0, 100);
          });
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
      supabase.removeChannel(commentsChannel);
    };
  }, [deferredReady, recentPosts]);

  // courtLogs가 업데이트될 때마다 자동 스크롤 (최신 기록이 위에 오도록 상단으로)
  useEffect(() => {
    if (courtLogs.length > 0) {
      setTimeout(() => {
        courtLogsRef.current?.scrollTo({
          top: 0,
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
      .then((r) => safeJsonFromResponse<{ comments?: Comment[]; likedCommentIds?: string[]; error?: string }>(r))
      .then((data) => {
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
        if (!map[key]) map[key] = "검사";
      } else {
        if (!map[key]) map[key] = `배심원 ${idx++}`;
      }
    }
    setJurorLabels(map);
  }, [comments]);

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
      setJudgeError("판결문 삭제 비밀번호를 입력해 주세요.");
      return;
    }

    setIsReviewing(true);
    setJudgeResult(null);
    setJudgeError(null);

    const submittedAt = new Date().toISOString();
    console.log("[GAEPAN][Accuse] submit", {
      title: form.title.trim().slice(0, 50),
      detailsLength: form.details.trim().length,
      category: form.category,
      submittedAt,
    });

    try {
      const imageUrls: string[] = [];
      if (imageFiles.length > 0) {
        setUploadError(null);
        for (let i = 0; i < imageFiles.length; i++) {
          const fd = new FormData();
          fd.append("file", imageFiles[i]);
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
          const url = uploadData.url ?? null;
          if (!url && uploadRes.ok) {
            setUploadError("업로드된 이미지 주소를 받지 못했습니다.");
            return;
          }
          if (url) imageUrls.push(url);
        }
      }

      console.log("[GAEPAN][Accuse] calling /api/judge");
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
        | { ok: true; mock?: boolean; verdict: JudgeVerdict; post_id?: string | null }
        | { ok: true; status: "판결불가"; verdict: null; post_id?: string | null }
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

      console.log("[GAEPAN][Accuse] /api/judge response meta", {
        status: r.status,
        ok: r.ok,
        hasBody: !!data,
        type: data && "status" in data ? data.status : "verdict",
      });

      if (!r.ok || !data || !data.ok) {
        const msg = (data && "error" in data && data.error) || (r.status >= 500 ? "사건 접수가 지연되고 있습니다. 잠시 후 다시 시도해 주세요." : `요청 실패 (${r.status} ${r.statusText})`);
        setJudgeError(msg);
        console.error("[GAEPAN][Accuse] judge error", msg);
        return;
      }

      if ("status" in data && data.status === "판결불가") {
        const msg = (data as { message?: string }).message ?? "판결할 수 없습니다.";
        setJudgeError(msg);
        console.warn("[GAEPAN][Accuse] 판결불가 응답", data);
        return;
      }

      const verdictPayload = (data as any).verdict as JudgeVerdict;
      console.log("[GAEPAN][Accuse] judge verdict received", {
        title: verdictPayload?.title?.slice(0, 80),
        ratio: verdictPayload?.ratio,
        verdict: verdictPayload?.verdict?.slice(0, 120),
        hasRationale:
          typeof verdictPayload?.ratio?.rationale === "string" &&
          verdictPayload.ratio.rationale.length > 0,
      });

      setJudgeResult({
        mock: (data as any).mock ?? false,
        verdict: verdictPayload,
        imageUrl: imageUrls.length > 0 ? imageUrls[0] : null,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      });
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

  const handleVote = async (postId: string, type: "guilty" | "not_guilty") => {
    if (votingId) return;
    setVotingId(postId);
    try {
      const r = await fetch(`/api/posts/${postId}/vote`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await safeJsonFromResponse<{
        guilty?: number;
        not_guilty?: number;
        currentVote?: "guilty" | "not_guilty" | null;
        error?: string;
      }>(r);
      if (!r.ok) throw new Error(data.error);
      const newGuilty = data.guilty ?? 0;
      const newNotGuilty = data.not_guilty ?? 0;

      setUserVotes((prev) => {
        const next = { ...prev };
        if (data.currentVote) next[postId] = data.currentVote;
        else delete next[postId];
        return next;
      });
      setStoredVote(postId, data.currentVote ?? null);

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

  /** 판결문 공유: 링크 복사/공유 후 해당 판결문 링크로 이동 */
  const sharePost = async (postId: string, title: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/?post=${postId}`;
    const shareTitle = title || "개판 - 판결문";
    const text = `${shareTitle} - 개판에서 배심원 투표와 최종 선고를 확인하세요.`;
    const isLocal = /localhost|127\.0\.0\.1/.test(origin);
    try {
      if (!isLocal && typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: shareTitle, url, text });
        setPostMenuOpenId(null);
        window.location.href = url;
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        window.alert(
          isLocal
            ? "로컬 환경: 링크가 복사되었습니다. 배포(gaepanai.com) 후에는 SNS 등으로 공유할 수 있습니다."
            : "링크가 복사되었습니다. 원하는 곳에 붙여넣어 공유하세요."
        );
        setPostMenuOpenId(null);
        window.location.href = url;
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        setPostMenuOpenId(null);
        window.location.href = url;
        return;
      }
    }
    window.alert(`공유 링크 (복사하여 사용): ${url}`);
    setPostMenuOpenId(null);
    window.location.href = url;
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

  const handleDeletePost = async (postId: string, password: string) => {
    if (typeof window === "undefined") return;
    if (!postId?.trim()) {
      setDeleteToast({ message: "삭제할 판결문을 찾을 수 없습니다.", isError: true });
      setTimeout(() => setDeleteToast(null), 4000);
      return;
    }
    const trimmed = password.trim();
    if (!trimmed) {
      setDeleteToast({ message: "판결문 삭제 비밀번호를 입력해 주세요.", isError: true });
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
      const aT = new Date(a.created_at ?? 0).getTime();
      const bT = new Date(b.created_at ?? 0).getTime();
      return commentSort === "oldest" ? aT - bT : bT - aT;
    });
    const topRoots = sorted.filter((c) => !c.parent_id);
    // 대법관 댓글을 최상단에, 나머지는 기존 정렬 유지. 대댓글은 byParent에서 기존 순서 유지.
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
    const byVotes = [...ongoingPosts].sort((a, b) => (b.guilty + b.not_guilty) - (a.guilty + a.not_guilty));
    return byVotes[0] ?? null;
  }, [filteredRecentPosts]);

  // 오늘의 개판 카드용 댓글 수 (배심원 참여 문구)
  useEffect(() => {
    const postId = filteredTopGuiltyPost?.id;
    if (!postId) {
      setTopGuiltyPostCommentCount(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/posts/${postId}/comments`)
      .then((r) => safeJsonFromResponse<{ comments?: Array<{ author_id?: string | null }>; error?: string }>(r))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data.comments) ? data.comments : [];
        const uniqueAuthors = new Set(list.map((c) => c.author_id ?? "anonymous"));
        setTopGuiltyPostCommentCount(uniqueAuthors.size);
      })
      .catch(() => {
        if (!cancelled) setTopGuiltyPostCommentCount(null);
      });
    return () => { cancelled = true; };
  }, [filteredTopGuiltyPost?.id]);

  const weeklyWinners = useMemo(() => {
    const ended = recentPosts.filter((p) => !isVotingOpen(p.created_at, p.voting_ended_at) && p.guilty > 0);
    const currentWeek = getCurrentWeek();

    const byWeek = new Map<string, { year: number; week: number; post: (typeof ended)[0] }>();

    for (const p of ended) {
      const key = getWeekFromEndAt(p.voting_ended_at, p.created_at);
      if (!key) continue;
      if (key.year === currentWeek.year && key.week === currentWeek.week) continue;

      const k = `${key.year}-${key.week}`;
      const totalVotes = p.guilty + p.not_guilty;
      const cur = byWeek.get(k);

      if (!cur) {
        byWeek.set(k, { ...key, post: p });
        continue;
      }
      const curTotal = cur.post.guilty + cur.post.not_guilty;
      if (totalVotes > curTotal) {
        byWeek.set(k, { ...key, post: p });
      } else if (totalVotes === curTotal && p.created_at && cur.post.created_at && p.created_at < cur.post.created_at) {
        // 동점이면 먼저 올린 글(created_at 더 이른 글) 등록
        byWeek.set(k, { ...key, post: p });
      }
    }
    return Array.from(byWeek.values()).sort((a, b) => b.year - a.year || b.week - a.week);
  }, [recentPosts]);

  // 현재 주차에서 투표 합계가 가장 높은 게시글 (오늘의 개판 하이라이트)
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

  // 판결 완료된 사건 정렬 (최신순 / 인기순)
  const completedPostsSorted = useMemo(() => {
    const list = [...completedPosts];
    if (completedSort === "latest") {
      list.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    } else {
      list.sort((a, b) => (b.guilty + b.not_guilty) - (a.guilty + a.not_guilty));
    }
    return list;
  }, [completedPosts, completedSort]);

  // 명예의 전당에 올라간 글의 주차 정보 (판결 완료 카드 배지용)
  const winnerWeekByPostId = useMemo(() => {
    const m = new Map<string, { year: number; week: number }>();
    weeklyWinners.forEach((w) => m.set(w.post.id, { year: w.year, week: w.week }));
    return m;
  }, [weeklyWinners]);

  // 카드용 댓글 수 (visible post IDs)
  const visiblePostIdsForCommentCount = useMemo(() => {
    const ids = new Set<string>();
    if (filteredTopGuiltyPost?.id) ids.add(filteredTopGuiltyPost.id);
    ongoingPosts.forEach((p) => ids.add(p.id));
    completedPostsSorted.forEach((p) => ids.add(p.id));
    weeklyWinners.forEach((w) => ids.add(w.post.id));
    return Array.from(ids);
  }, [filteredTopGuiltyPost?.id, ongoingPosts, completedPostsSorted, weeklyWinners]);

  const [debouncedCountIds, setDebouncedCountIds] = useState("");
  useEffect(() => {
    const raw = visiblePostIdsForCommentCount.join(",");
    const t = setTimeout(() => setDebouncedCountIds(raw), 400);
    return () => clearTimeout(t);
  }, [visiblePostIdsForCommentCount.join(",")]);

  useEffect(() => {
    if (!debouncedCountIds) {
      setCommentCountsByPostId({});
      setViewCountsByPostId({});
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch(`/api/posts/comment-counts?ids=${debouncedCountIds}`).then((r) => r.json().catch(() => ({ counts: {} }))),
      fetch(`/api/posts/view-counts?ids=${debouncedCountIds}`).then((r) => r.json().catch(() => ({ counts: {} }))),
    ]).then(([commentData, viewData]) => {
      if (cancelled) return;
      setCommentCountsByPostId((commentData as { counts?: Record<string, number> }).counts ?? {});
      setViewCountsByPostId((viewData as { counts?: Record<string, number> }).counts ?? {});
    }).catch(() => {
      if (!cancelled) {
        setCommentCountsByPostId({});
        setViewCountsByPostId({});
      }
    });
    return () => { cancelled = true; };
  }, [debouncedCountIds]);

  // 게시글 상세(모달) 열릴 때 조회 기록 (IP당 1회, 기존 글 포함) 후 조회수 갱신
  useEffect(() => {
    if (!selectedPost?.id) return;
    fetch(`/api/posts/${selectedPost.id}/view`, { method: "POST" })
      .then(() => {
        const ids = new Set(visiblePostIdsForCommentCount);
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
        @keyframes hall-of-fame-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(52,211,153,0.2), 0 0 40px rgba(52,211,153,0.08), inset 0 0 20px rgba(0,0,0,0.2); }
          50% { box-shadow: 0 0 28px rgba(52,211,153,0.35), 0 0 56px rgba(52,211,153,0.12), inset 0 0 20px rgba(0,0,0,0.2); }
        }
        .animate-hall-of-fame-glow {
          animation: hall-of-fame-glow 3s ease-in-out infinite;
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
      <nav className="px-4 py-3 md:py-6 md:px-16 border-b border-zinc-900 flex justify-between items-center sticky top-0 bg-zinc-950/80 backdrop-blur-md z-50">
        <Logo className="pr-2" />

        {/* 우측 상단 메뉴 버튼 (막대기 세개, 모바일/PC 공통) */}
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

      {/* 실시간 사법 전광판 (동적 로드) */}
      <div className="max-w-6xl mx-auto px-4 md:px-16 mt-4 md:mt-6 mb-4">
        <CoupangLinkBanner className="mb-4" />
        <ScoreboardSection
          todayConfirmed={todayConfirmed}
          yesterdayConfirmed={yesterdayConfirmed}
          cumulativeConfirmed={cumulativeConfirmed}
          cumulativeStatsError={cumulativeStatsError}
        />
      </div>

      {/* Main Grid Container — 모바일 16px 패딩, 데스크톱 32px */}
      <div className="max-w-6xl mx-auto px-4 md:px-16 w-full overflow-x-hidden">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Main Content Area */}
          <div className="md:col-span-12 space-y-12 min-w-0">
            {/* Hero Section */}
            <main className="pt-6 md:pt-8 pb-12 md:pb-20 text-center">
              <div className="inline-block px-4 py-1.5 mb-3 md:mb-6 text-xs font-bold tracking-widest uppercase bg-zinc-900 border border-zinc-800 rounded-full text-amber-500">
                24/7 무자비한 AI 법정
              </div>
              <h2 className="text-4xl sm:text-6xl md:text-8xl font-black mb-6 md:mb-8 tracking-tighter leading-tight mt-2 md:mt-0">
                누가 <span className="text-amber-500 underline decoration-zinc-800">죄인</span>인가?
              </h2>
              <p className="text-zinc-500 text-base sm:text-lg md:text-2xl mb-8 md:mb-12 font-medium leading-relaxed md:leading-relaxed px-4 text-center">
                당신의 억울한 사연, <br className="md:hidden" /> 
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

            {/* 진행 중: 오늘의 개판 / 완료: 최근 마감된 재판 (클릭 시 상세 모달) */}
            {filteredTopGuiltyPost ? (
              <section className="pt-4 md:pt-12 pb-4 md:pb-16 space-y-3 md:space-y-4 min-w-0 overflow-x-hidden">
                <div className="flex flex-col gap-1">
                  {/* 모바일: 제목 + LIVE 한 줄 / 데스크톱도 동일 */}
                  <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1">
                    <h3 className="text-2xl md:text-3xl font-bold text-left flex items-center gap-2">
                      <span>🔥</span>
                      <span>오늘의 개판</span>
                    </h3>
                  </div>
                  <p className="text-zinc-500 text-sm max-w-2xl">
                    오늘 진행 중인 재판중 가장 핫한 재판입니다.
                  </p>
                </div>
          {/* 오늘의 개판 카드 — 모바일 좌우 여백 컨테이너 px-4와 동일하게 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setSelectedPost(filteredTopGuiltyPost)}
            onKeyDown={(e) => e.key === "Enter" && setSelectedPost(filteredTopGuiltyPost)}
            className="group w-full min-w-0 rounded-[1.25rem] md:rounded-[1.75rem] border bg-zinc-950 cursor-pointer select-none flex flex-col gap-2 overflow-x-hidden break-all relative"
            style={{
              borderColor: "rgba(255, 215, 0, 0.9)",
            }}
          >
            <div className="rounded-[1.25rem] md:rounded-[1.75rem] px-4 md:px-6 py-6 md:py-9 max-[480px]:px-4 max-[480px]:py-6 flex flex-col gap-3 relative overflow-hidden min-w-0">
              {/* 상단: 카테고리·오늘의 개판 배지(좌) + 사건번호·메뉴(우) */}
              <div className="flex items-center justify-between mb-2 text-[11px] text-zinc-500">
                <div className="flex items-center gap-2 shrink-0">
                  {filteredTopGuiltyPost.category ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-zinc-900/80 border border-zinc-800 text-zinc-400">
                      {filteredTopGuiltyPost.category}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 border border-amber-400/70 text-amber-300 whitespace-nowrap">
                    <span>🔥</span>
                    <span>오늘의 개판</span>
                  </span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {filteredTopGuiltyPost.case_number != null ? (
                    <span className="inline-flex items-center px-3 py-1 text-[10px] font-bold text-zinc-500 whitespace-nowrap leading-none">
                      사건 번호 {filteredTopGuiltyPost.case_number}
                    </span>
                  ) : null}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPostMenuOpenId((prev) => (prev === filteredTopGuiltyPost.id ? null : filteredTopGuiltyPost.id));
                      }}
                      className="p-0.5 text-zinc-500 hover:text-zinc-300"
                      aria-label="메뉴"
                    >
                      ⋯
                    </button>
                    {postMenuOpenId === filteredTopGuiltyPost.id ? (
                      <div className="absolute right-0 mt-1 w-32 rounded-md border border-zinc-800 bg-zinc-900 py-1 text-[11px] text-zinc-200 shadow-lg z-20">
                        <button type="button" onClick={(e) => { e.stopPropagation(); sharePost(filteredTopGuiltyPost.id, filteredTopGuiltyPost.title); }} className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800">공유하기</button>
                        {isOperatorLoggedIn ? (
                          <button type="button" onClick={async (e) => { e.stopPropagation(); if (!confirm("이 글을 삭제하시겠습니까?")) return; try { const r = await fetch(`/api/admin/delete?type=post&id=${filteredTopGuiltyPost.id}`, { method: "DELETE" }); if (r.ok) window.location.reload(); } catch (err) { console.error("삭제 실패:", err); } setPostMenuOpenId(null); }} className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800">⚖️ 삭제</button>
                        ) : (
                          <>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setDeletePostId(filteredTopGuiltyPost.id); setPostMenuOpenId(null); }} className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-zinc-800">판결문 삭제</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); openReportModal("post", filteredTopGuiltyPost.id); setPostMenuOpenId(null); }} className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800">신고하기</button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* 제목 + 내용 요약 — 제목 크기 더 키우고 강조 */}
              <div className="mb-2">
                {trialTab === "ongoing" && isUrgent(filteredTopGuiltyPost.created_at) ? (
                  <span className="text-[10px] md:text-[11px] font-bold text-red-500 block mb-1 text-left">[🔥 판결 임박]</span>
                ) : null}
                <h4 className="text-lg md:text-2xl font-extrabold text-amber-50 group-hover:text-amber-200 transition duration-200 ease-out line-clamp-1 text-left overflow-hidden text-ellipsis break-words">
                  {maskBlocked(filteredTopGuiltyPost.title)}
                </h4>
                {filteredTopGuiltyPost.content ? (
                  <p className="text-[11px] text-zinc-400 line-clamp-2 text-left break-all whitespace-normal min-w-0">
                    {(() => { const t = (filteredTopGuiltyPost.content || "").trim().replace(/\s+/g, " "); return t.slice(0, 100) + (t.length > 100 ? "…" : ""); })()}
                  </p>
                ) : null}
              </div>

              {/* 하단 정보 — 진행 중 카드와 동일 (카드에서는 익명 텍스트 미표시) */}
              <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-zinc-500 mb-2 mt-1 break-all whitespace-normal min-w-0">
                {filteredTopGuiltyPost.plaintiff === "익명" && filteredTopGuiltyPost.defendant === "익명" ? null : (
                  <>
                    {filteredTopGuiltyPost.plaintiff ? <span>검사 {filteredTopGuiltyPost.plaintiff}</span> : null}
                    {filteredTopGuiltyPost.plaintiff && filteredTopGuiltyPost.defendant ? <span>·</span> : null}
                    {filteredTopGuiltyPost.defendant ? <span>피고인 {filteredTopGuiltyPost.defendant}</span> : null}
                  </>
                )}
              </div>
              {isVotingOpen(filteredTopGuiltyPost.created_at, filteredTopGuiltyPost.voting_ended_at) ? (
                <p className="text-[11px] font-bold text-amber-400 mb-2 tabular-nums text-center">
                  ⏳ 남은 시간 {formatCountdown(Math.max(0, getVotingEndsAt(filteredTopGuiltyPost.created_at) - countdownNow))}
                </p>
              ) : (
                <p className="text-[11px] text-zinc-500 mb-2 text-center">재판 종료</p>
              )}
              {/* 투표 현황 — 막대 + 배심원 참여 문구 (판결문 상세와 동일) */}
              {(() => {
                const total = filteredTopGuiltyPost.guilty + filteredTopGuiltyPost.not_guilty;
                const guiltyPct = total ? Math.round((filteredTopGuiltyPost.guilty / total) * 100) : 0;
                const notGuiltyPct = total ? Math.round((filteredTopGuiltyPost.not_guilty / total) * 100) : 0;
                const isTie = total > 0 && filteredTopGuiltyPost.guilty === filteredTopGuiltyPost.not_guilty;
                return (
                  <div className="mb-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span className="text-red-400 text-xs md:text-sm">유죄 {guiltyPct}% ({filteredTopGuiltyPost.guilty}표)</span>
                      <span className="text-blue-400 text-xs md:text-sm">무죄 {notGuiltyPct}% ({filteredTopGuiltyPost.not_guilty}표)</span>
                    </div>
                    <div className="relative w-full h-1.5 bg-zinc-800 rounded-full overflow-visible flex">
                      <div className="bg-red-500 h-full transition-all duration-300 rounded-l-full" style={{ width: `${guiltyPct}%` }} />
                      <div className="bg-blue-500 h-full transition-all duration-300 rounded-r-full" style={{ width: `${notGuiltyPct}%` }} />
                      {isTie ? (
                        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-amber-400/90 bg-zinc-900 text-[10px] font-black text-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]" aria-hidden>⚡</span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex items-center justify-start gap-2 text-[10px] text-zinc-500">
                      <span className="inline-flex items-center gap-0.5" aria-label="조회수"><span aria-hidden>👁</span><span>{viewCountsByPostId[filteredTopGuiltyPost.id] ?? 0}</span></span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedPost(filteredTopGuiltyPost); setScrollToCommentsOnOpen(true); }}
                        className="flex items-center gap-0.5 hover:text-zinc-400 transition"
                        aria-label="댓글 보기"
                      >
                        <span aria-hidden>💬</span>
                        <span>{commentCountsByPostId[filteredTopGuiltyPost.id] ?? 0}</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
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
                <p className="mt-1 text-xs text-zinc-500">
                  24시간 동안 배심원 투표 후, 선고문이 작성됩니다.
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
                    <div className="font-black">선고문 초안 검토 중입니다. 배심원 의견을 반영해 선고문을 작성하고 있습니다.</div>
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div className="h-3 w-5/6 rounded-full bg-amber-200/10 animate-pulse" />
                    <div className="h-3 w-4/6 rounded-full bg-amber-200/10 animate-pulse" />
                    <div className="h-3 w-3/6 rounded-full bg-amber-200/10 animate-pulse" />
                  </div>
                </div>
              ) : null}

              {judgeResult ? (
                <div ref={verdictDetailRef} className="rounded-[2rem] border border-zinc-800 bg-zinc-950/60 p-5 md:p-6">
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
                    {(() => {
                      const urls = judgeResult.imageUrls?.length
                        ? judgeResult.imageUrls
                        : judgeResult.imageUrl
                          ? [judgeResult.imageUrl]
                          : imagePreviewUrls.length > 0
                            ? imagePreviewUrls
                            : [];
                      return urls.length > 0 ? (
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                          <div className="text-xs font-black tracking-widest uppercase text-zinc-400 mb-2">첨부 증거 ({urls.length}장)</div>
                          <div className="flex flex-wrap gap-3">
                            {urls.map((src, i) => (
                              <a
                                key={i}
                                href={src.startsWith("blob:") ? undefined : src}
                                target={src.startsWith("blob:") ? undefined : "_blank"}
                                rel={src.startsWith("blob:") ? undefined : "noopener noreferrer"}
                                className="block rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900 flex-shrink-0"
                              >
                                <img
                                  src={src}
                                  alt={`첨부 ${i + 1}`}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-auto max-h-[280px] object-contain bg-zinc-900"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    })()}
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
                          const label = getPrimaryLabelFromVerdictAndRatio(
                            judgeResult.verdict.verdict,
                            judgeResult.verdict.ratio?.defendant,
                            judgeResult.verdict.ratio?.rationale
                          );
                          if (label === "판결 유보") {
                            return <span className="text-amber-200">판결 유보 : 판단 불가</span>;
                          }
                          return (
                            <span className={label === "유죄" ? "text-red-300" : "text-blue-300"}>
                              피고인 {label}
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

      {/* 진행 중인 재판 섹션 — 모바일 간격 축소 */}
      <section className="pt-4 md:pt-12 pb-4 md:pb-16 space-y-3 md:space-y-4 min-w-0 overflow-x-hidden">
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
              onClick={() => setOngoingSort("votes")}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                ongoingSort === "votes"
                  ? "bg-amber-500 text-black"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-amber-500/50"
              }`}
            >
              인기순
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
            <div className="grid md:grid-cols-2 gap-3 md:gap-6 mt-4 md:mt-6 overflow-x-hidden break-all min-w-0">
              {ongoingPosts.slice(0, 2).map((p) => (
                <article
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPost(p)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedPost(p)}
                  className="group w-full min-w-0 rounded-[1.25rem] md:rounded-[1.75rem] border border-zinc-900 bg-zinc-950 px-4 md:px-6 py-6 md:py-9 hover:border-amber-500/40 transition-all cursor-pointer select-none flex flex-col gap-2 overflow-x-hidden break-all"
                >
                {/* 상단: 카테고리·오늘의 개판(좌) + 사건번호·메뉴(우측) */}
                <div className="flex items-center justify-between mb-2 text-[11px] text-zinc-500">
                  <div className="flex items-center gap-2 shrink-0">
                    {p.category ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-zinc-900/80 border border-zinc-800 text-zinc-400">
                        {p.category}
                      </span>
                    ) : null}
                    {filteredTopGuiltyPost && p.id === filteredTopGuiltyPost.id ? (
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
                                      setRecentPosts((prev) => prev.filter((x) => x.id !== p.id));
                                      setTopGuiltyPost((prev) => (prev?.id === p.id ? null : prev));
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
                  <h4 className="text-sm md:text-lg font-bold group-hover:text-amber-400 transition line-clamp-1 text-left overflow-hidden text-ellipsis break-words">
                    {maskBlocked(p.title)}
                  </h4>
                  {p.content ? (
                    <p className="text-[11px] text-zinc-400 line-clamp-2 text-left break-all min-w-0">
                      {(() => { const t = (p.content || "").trim().replace(/\s+/g, " "); return t.slice(0, 100) + (t.length > 100 ? "…" : ""); })()}
                    </p>
                  ) : null}
                </div>

                {/* 하단 정보 (카드에서는 익명 텍스트 미표시) */}
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
                {/* 투표 현황 (막대) + 배심원 참여 문구 (판결문 상세와 동일) */}
                {(() => {
                  const total = p.guilty + p.not_guilty;
                  const guiltyPct = total ? Math.round((p.guilty / total) * 100) : 0;
                  const notGuiltyPct = total ? Math.round((p.not_guilty / total) * 100) : 0;
                  const isTie = total > 0 && p.guilty === p.not_guilty;
                  return (
                    <div className="mb-2 space-y-1 mt-auto">
                      <div className="flex items-center justify-between text-[10px] text-zinc-500">
                        <span className="text-red-400 text-xs md:text-sm">유죄 {guiltyPct}% ({p.guilty}표)</span>
                        <span className="text-blue-400 text-xs md:text-sm">무죄 {notGuiltyPct}% ({p.not_guilty}표)</span>
                      </div>
                      <div className="relative w-full h-1.5 bg-zinc-800 rounded-full overflow-visible flex">
                        <div className="bg-red-500 h-full rounded-l-full" style={{ width: `${guiltyPct}%` }} />
                        <div className="bg-blue-500 h-full rounded-r-full" style={{ width: `${notGuiltyPct}%` }} />
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

            {/* 판결 완료된 재판 섹션 — 모바일 간격 축소 */}
            <section className="py-4 md:py-12 min-w-0 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4 md:mb-6">
          <div>
            <h3 className="text-2xl md:text-3xl font-black mb-1">판결 완료된 사건</h3>
            <p className="text-zinc-500 text-sm">GAEPAN 법정을 거친 판결들입니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCompletedSort("latest")}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                completedSort === "latest"
                  ? "bg-amber-500 text-black"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-amber-500/50"
              }`}
            >
              최신순
            </button>
            <button
              type="button"
              onClick={() => setCompletedSort("votes")}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                completedSort === "votes"
                  ? "bg-amber-500 text-black"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-amber-500/50"
              }`}
            >
              인기순
            </button>
          </div>
        </div>

        {postsError ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {postsError}
          </div>
        ) : null}

        {isLoadingPosts && completedPostsSorted.length === 0 ? (
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

        {!isLoadingPosts && completedPostsSorted.length === 0 && !postsError ? (
          <div className="mt-6 text-sm text-zinc-500">
            판결 완료된 사건이 없습니다.
          </div>
        ) : null}

        {completedPostsSorted.length > 0 ? (
          <>
            <div className="grid md:grid-cols-2 gap-3 md:gap-6 mt-4 md:mt-6 overflow-x-hidden break-all min-w-0">
              {completedPostsSorted.slice(0, 2).map((p) => {
                const total = p.guilty + p.not_guilty;
                const guiltyPct = total ? Math.round((p.guilty / total) * 100) : 0;
                const notGuiltyPct = total ? Math.round((p.not_guilty / total) * 100) : 0;
                const verdictText = typeof p.verdict === "string" ? p.verdict : "";
                const isDefense =
                  p.trial_type === "DEFENSE" ||
                  ((verdictText.includes("피고인 무죄") || verdictText.includes("불기소") || verdictText.includes("원고 무죄")) && p.trial_type !== "ACCUSATION");
                const isWinner = winnerWeekByPostId.has(p.id);
                const weekInfo = winnerWeekByPostId.get(p.id);
                return (
                <article
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPost(p)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedPost(p)}
                  className={
                    isWinner
                      ? "group relative w-full min-w-0 max-w-full mx-auto rounded-[1.25rem] md:rounded-[1.75rem] border border-emerald-500/25 bg-gradient-to-br from-emerald-500/15 via-zinc-800/50 to-zinc-950/95 px-4 md:px-6 py-6 md:py-9 hover:border-emerald-400/35 hover:from-emerald-400/20 transition-all cursor-pointer select-none flex flex-col gap-3 overflow-x-hidden break-all shadow-[0_0_0_1px_rgba(52,211,153,0.08)_inset,0_4px_24px_rgba(0,0,0,0.4),0_0_40px_rgba(52,211,153,0.08)] hover:shadow-[0_0_0_1px_rgba(52,211,153,0.12)_inset,0_8px_32px_rgba(0,0,0,0.45),0_0_50px_rgba(52,211,153,0.1)]"
                      : "group relative w-full min-w-0 max-w-full mx-auto rounded-[1.25rem] md:rounded-[1.75rem] border border-zinc-700/80 bg-zinc-950/60 px-4 md:px-6 py-6 md:py-9 hover:border-zinc-600/80 transition-all cursor-pointer select-none flex flex-col gap-3 overflow-x-hidden break-all opacity-90 saturate-[0.85] hover:opacity-95 hover:saturate-100"
                  }
                  style={{
                    backgroundImage: isWinner
                      ? "repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(52,211,153,0.04) 6px, rgba(52,211,153,0.04) 12px)"
                      : "repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(255,255,255,0.02) 6px, rgba(255,255,255,0.02) 12px)",
                  }}
                >
                {/* [판결 완료] 도장 스탬프 — 우측 상단 비스듬히 */}
                <div
                  className="absolute top-4 right-4 md:top-5 md:right-5 z-10 pointer-events-none select-none"
                  style={{ transform: "rotate(12deg)" }}
                >
                  <span className="inline-block px-2 py-1 md:px-2.5 md:py-1.5 border-2 border-red-600/90 text-red-500/95 text-[10px] md:text-xs font-black tracking-widest rounded shadow-md bg-black/20">
                    [ 판 결 완 료 ]
                  </span>
                </div>

                {/* 상단: 카테고리·주차(좌) + 사건번호·메뉴(우측) */}
                <div className="flex items-center justify-between mb-2 text-[11px] text-zinc-500">
                  <div className="flex items-center gap-2 shrink-0">
                    {p.category ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800/80 border border-zinc-700 text-zinc-500">
                        {p.category}
                      </span>
                    ) : null}
                    {isWinner && weekInfo ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-500/40 bg-emerald-500/15 text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.2)]">
                        <span className="text-amber-400" aria-hidden>🏆</span>
                        {weekInfo.year}년 제{weekInfo.week}주
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {p.case_number != null ? (
                      <span className="inline-flex items-center px-3 py-1 text-[10px] font-bold text-zinc-500 whitespace-nowrap leading-none">
                        사건 번호 {p.case_number}
                      </span>
                    ) : null}
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
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
                                      setRecentPosts((prev) => prev.filter((x) => x.id !== p.id));
                                      setTopGuiltyPost((prev) => (prev?.id === p.id ? null : prev));
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
                <div className="mb-2 pr-16">
                  <h4 className={`text-base md:text-lg font-bold line-clamp-1 text-left break-all transition ${isWinner ? "text-zinc-100 group-hover:text-emerald-100" : "text-zinc-300 group-hover:text-amber-400/90"}`}>
                    {maskBlocked(p.title)}
                  </h4>
                  {p.content ? (
                    <p className="text-[11px] text-zinc-500 line-clamp-2 text-left break-all">
                      {(() => { const t = (p.content || "").trim().replace(/\s+/g, " "); return t.slice(0, 100) + (t.length > 100 ? "…" : ""); })()}
                    </p>
                  ) : null}
                </div>

                {/* 검사·피고인 (그레이스케일 톤, 카드에서는 익명 텍스트 미표시) */}
                <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-zinc-500 mb-2">
                  {p.plaintiff === "익명" && p.defendant === "익명" ? null : (
                    <>
                      {p.plaintiff ? <span>검사 {p.plaintiff}</span> : null}
                      {p.plaintiff && p.defendant ? <span>·</span> : null}
                      {p.defendant ? <span>피고인 {p.defendant}</span> : null}
                    </>
                  )}
                </div>

                {/* 최종 스코어 보드 — 하단 전체 폭 바 + 최종 선고 확정 라벨 (0%인 쪽은 렌더 안 함 → 색 섞임 방지). 동점 시 번개 표시 */}
                <div className="mt-auto space-y-2">
                  <div className={`relative w-full h-3 md:h-4 rounded-full overflow-visible flex ${isWinner ? "bg-zinc-800/80 border border-emerald-500/25" : "bg-zinc-800"}`}>
                    {guiltyPct > 0 ? (
                      <div
                        className="bg-red-600/90 h-full min-w-0 flex items-center justify-end pr-1 shrink-0 rounded-l-full"
                        style={{ width: `${guiltyPct}%` }}
                      >
                        {guiltyPct >= 50 && p.guilty !== p.not_guilty ? (
                          <span className="text-[9px] md:text-[10px] font-bold text-red-200/90 whitespace-nowrap" aria-label="최종 선고 확정">최종 선고 확정</span>
                        ) : null}
                      </div>
                    ) : null}
                    {notGuiltyPct > 0 ? (
                      <div
                        className="bg-blue-600/90 h-full min-w-0 flex items-center justify-start pl-1 shrink-0 rounded-r-full"
                        style={{ width: `${notGuiltyPct}%` }}
                      >
                        {notGuiltyPct >= 50 && p.guilty !== p.not_guilty ? (
                          <span className="text-[9px] md:text-[10px] font-bold text-blue-200/90 whitespace-nowrap" aria-label="최종 선고 확정">최종 선고 확정</span>
                        ) : null}
                      </div>
                    ) : null}
                    {total > 0 && p.guilty === p.not_guilty ? (
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-amber-400/90 bg-zinc-900 text-xs font-black text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]" aria-hidden>⚡</span>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-500">
                    <span className="text-red-400/80">유죄 {guiltyPct}% ({p.guilty}표)</span>
                    <span className="text-blue-400/80">무죄 {notGuiltyPct}% ({p.not_guilty}표)</span>
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

                {/* 하단 버튼: 판결문 전문 보기 / 나도 사연 올리기 */}
                <div className="flex flex-col sm:flex-row gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPost(p);
                    }}
                    className={isWinner ? "flex-1 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 px-4 py-2.5 text-xs md:text-sm font-bold transition shadow-[0_0_16px_rgba(52,211,153,0.15)]" : "flex-1 rounded-xl border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-4 py-2.5 text-xs md:text-sm font-bold transition"}
                  >
                    선고문 전문 보기
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMobileMenuOpen(false);
                      openAccuse();
                    }}
                    className="flex-1 rounded-xl border border-zinc-600 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 px-4 py-2.5 text-xs md:text-sm font-bold transition"
                  >
                    나도 사연 올리기
                  </button>
                </div>
                </article>
                );
              })}
            </div>
            {/* 더보기 버튼 */}
            {completedPostsSorted.length > 2 ? (
              <div className="mt-6 text-center">
                <Link
                  href="/trials/completed"
                  className="inline-block rounded-xl border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-8 py-3 text-sm font-bold transition"
                >
                  더보기 ({completedPostsSorted.length - 2}건 더)
                </Link>
              </div>
            ) : null}
              </>
            ) : null}
            </section>

            {/* 명예의 전당 — 연도/주차별 오늘의 개판 1위 (판결문/속보형 카드) */}
            <section ref={hallOfFameRef} className="py-12 md:py-16 scroll-mt-32 border-t border-zinc-900 mt-8 md:mt-12">
              <div className="mb-8 md:mb-10">
                <h3 className="text-2xl sm:text-3xl md:text-4xl font-black mb-2">🏆 명예의 전당</h3>
                <p className="text-zinc-500 text-xs sm:text-sm">매주 투표수 1위를 기록한 사건입니다.</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-4 md:p-6 lg:p-8">
                {weeklyWinners.length === 0 ? (
                  <p className="text-zinc-500 text-xs sm:text-sm text-center py-8">아직 기록된 주차가 없습니다.</p>
                ) : (
                  <>
                    {(() => {
                      const w = weeklyWinners[0];
                      const p = w.post;
                      const totalVotes = p.guilty + p.not_guilty;
                      const guiltyPct = totalVotes ? Math.round((p.guilty / totalVotes) * 100) : 50;
                      const notGuiltyPct = totalVotes ? 100 - guiltyPct : 50;
                      const contentPreview = (typeof p.content === "string" ? p.content : "").trim().replace(/\s+/g, " ").slice(0, 100);
                      return (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedPost(p)}
                          onKeyDown={(e) => e.key === "Enter" && setSelectedPost(p)}
                          className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950/60 via-zinc-900 to-zinc-950 px-5 md:px-6 py-7 md:py-9 hover:border-emerald-400/50 transition-all cursor-pointer animate-hall-of-fame-glow"
                          style={{
                            backgroundImage: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(52,211,153,0.08) 0%, transparent 50%), repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(52,211,153,0.03) 8px, rgba(52,211,153,0.03) 16px)",
                          }}
                        >
                          {/* 워터마크: 천칭 */}
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06]" aria-hidden>
                            <svg viewBox="0 0 64 64" className="w-32 h-32 md:w-40 md:h-40 text-emerald-400" fill="currentColor">
                              <path d="M32 8v48M20 24h24M20 40h24M26 24l-6 16h16l-6-16M38 24l-6 16h16l-6-16M32 8l-4 8h8l-4-8z" stroke="currentColor" strokeWidth="2" fill="none" />
                            </svg>
                            <span className="absolute text-6xl md:text-7xl text-emerald-400/80 select-none">⚖️</span>
                          </div>

                          <div className="relative z-10">
                            {/* 카테고리 + 주차 + 트로피 */}
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              {p.category ? (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800/80 border border-zinc-700 text-zinc-400">
                                  {p.category}
                                </span>
                              ) : null}
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.2)]">
                                <span className="text-amber-400" aria-hidden>🏆</span>
                                {w.year}년 제{w.week}주
                              </span>
                            </div>

                            {/* 사연 제목 */}
                            <h4 className="text-lg md:text-xl lg:text-2xl font-black text-zinc-50 leading-snug mb-3 line-clamp-2 drop-shadow-sm">
                              {maskBlocked(p.title) || "제목 없음"}
                            </h4>

                            {/* 본문 내용 일부 */}
                            {contentPreview ? (
                              <div className="rounded-xl border border-zinc-600/80 bg-zinc-800/50 px-3 py-2.5 mb-4">
                                <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed line-clamp-3 whitespace-pre-wrap break-words">
                                  {contentPreview}
                                  {(typeof p.content === "string" ? p.content : "").trim().replace(/\s+/g, " ").length > 100 ? "…" : ""}
                                </p>
                              </div>
                            ) : null}

                            {/* 유죄 vs 무죄 게이지 바 (동점 시 번개) */}
                            <div className="mb-3">
                              <div className="relative flex h-3 rounded-full overflow-visible bg-zinc-800 border border-zinc-700/80 shadow-inner">
                                <div
                                  className="h-full bg-red-500/90 transition-all duration-500 rounded-l-full"
                                  style={{ width: `${guiltyPct}%` }}
                                />
                                <div
                                  className="h-full bg-blue-500/90 transition-all duration-500 rounded-r-full"
                                  style={{ width: `${notGuiltyPct}%` }}
                                />
                                {totalVotes > 0 && p.guilty === p.not_guilty ? (
                                  <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2 border-amber-400/90 bg-zinc-900 text-xs font-black text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]" aria-hidden>⚡</span>
                                ) : null}
                              </div>
                              <div className="flex justify-between mt-1.5 text-[10px] font-bold">
                                <span className="text-red-400">유죄 {guiltyPct}% ({p.guilty.toLocaleString()}표)</span>
                                <span className="text-blue-400">무죄 {notGuiltyPct}% ({p.not_guilty.toLocaleString()}표)</span>
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

                            {/* 배심원 한마디 유도 */}
                            <p className="mt-2 text-[11px] text-zinc-500">클릭하면 판결문 상세 · 배심원 한마디를 볼 수 있습니다</p>
                          </div>
                        </div>
                      );
                    })()}
                    {weeklyWinners.length > 1 ? (
                      <div className="mt-6 text-center">
                        <Link
                          href="/hall-of-fame"
                          className="inline-block rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 px-6 md:px-8 py-2 md:py-3 text-xs sm:text-sm font-bold transition shadow-[0_0_16px_rgba(52,211,153,0.15)]"
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

          {/* 실시간 재판소 (코드 분할) */}
          <LiveCourtAside
            courtLogs={courtLogs}
            recentPosts={recentPosts.map((p) => ({ id: p.id, title: p.title }))}
            scrollRef={asideRef}
            onSelectPost={(p) => {
              const full = recentPosts.find((x) => x.id === p.id);
              if (full) setSelectedPost(full);
            }}
          />
        </div>
      </div>

      <LiveCourtTicker
        courtLogs={courtLogs}
        recentPosts={recentPosts.map((p) => ({ id: p.id, title: p.title }))}
        scrollRef={courtLogsRef}
        onSelectPost={(p) => {
          const full = recentPosts.find((x) => x.id === p.id);
          if (full) setSelectedPost(full);
        }}
        isMobileLogOpen={isMobileLogOpen}
        onMobileLogOpenChange={setIsMobileLogOpen}
      />

      {/* 최근 판결문 상세 모달 */}
      {selectedPost ? (
        (() => {
          const isModalWinner = winnerWeekByPostId.has(selectedPost.id);
          return (
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
          <div
            className={
              isModalWinner
                ? "relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] border border-emerald-500/25 bg-gradient-to-b from-emerald-500/10 to-zinc-950 shadow-[0_0_0_1px_rgba(52,211,153,0.08)_inset,0_0_60px_rgba(0,0,0,0.6),0_0_40px_rgba(52,211,153,0.1)]"
                : "relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[2rem] border border-zinc-800 bg-zinc-950 shadow-[0_0_60px_rgba(0,0,0,0.8)]"
            }
          >
            <div
              className={
                isModalWinner
                  ? "sticky top-0 z-10 flex items-center justify-between gap-4 px-3 py-4 md:p-6 border-b border-emerald-500/30 bg-zinc-950/95 backdrop-blur-sm"
                  : "sticky top-0 z-10 flex items-center justify-between gap-4 px-3 py-4 md:p-6 border-b border-zinc-800 bg-zinc-950"
              }
            >
              <h3 className={isModalWinner ? "text-lg font-black text-emerald-200" : "text-lg font-black text-amber-500"}>판결문 상세</h3>
              <div className="flex items-center gap-2">
                {selectedPost.case_number != null ? (
                  <span className="inline-flex items-center px-3 py-1 text-[10px] font-bold text-zinc-400 whitespace-nowrap leading-none rounded-full border border-zinc-700/80 bg-zinc-900/60">
                    사건 번호 {selectedPost.case_number}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelectedPost(null)}
                  className={
                    isModalWinner
                      ? "rounded-2xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-200 hover:bg-emerald-500/25 transition"
                      : "rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-zinc-800 transition"
                  }
                >
                  닫기
                </button>
              </div>
            </div>
            <div className="px-3 py-4 space-y-6 md:p-6">
              {(() => {
                const isFinished = !isVotingOpen(selectedPost.created_at, selectedPost.voting_ended_at);
                const total = selectedPost.guilty + selectedPost.not_guilty;
                const guiltyPct = total ? Math.round((selectedPost.guilty / total) * 100) : 0;
                const notGuiltyPct = total ? Math.round((selectedPost.not_guilty / total) * 100) : 0;
                const aiRatio = selectedPost.ratio ?? 50;
                
                // 재판 목적에 따른 승소/패소 판정 (과반수 기준, 동점 시 AI 대법관 캐스팅 보트)
                const isTie = selectedPost.guilty === selectedPost.not_guilty;
                let isAuthorVictory = false;
                if (selectedPost.trial_type === "DEFENSE") {
                  if (isTie) isAuthorVictory = aiRatio < 50; // 동점 시 AI가 피고인 쪽 과실 50 미만이면 무죄(승소)
                  else isAuthorVictory = selectedPost.not_guilty > selectedPost.guilty;
                } else if (selectedPost.trial_type === "ACCUSATION") {
                  if (isTie) isAuthorVictory = aiRatio >= 50; // 동점 시 AI가 피고인 쪽 50 이상이면 유죄(승소)
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
                        <h4 className="text-lg sm:text-xl md:text-2xl font-bold text-zinc-100 break-words">{maskBlocked(selectedPost.title)}</h4>
                      </div>
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
                            {isAuthorVictory
                              ? (selectedPost.trial_type === "DEFENSE" ? "🏆 무죄 확정" : "🏆 유죄 확정")
                              : (selectedPost.trial_type === "DEFENSE" ? "🔨 유죄 확정" : "🔨 무죄 확정")}
                          </div>
                          
                          {/* 판결문 연출 */}
                          <p className={`text-sm md:text-base font-bold mt-2 md:mt-4 ${
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
                                const r = await fetch(`/api/admin/delete?type=post&id=${selectedPost.id}`, {
                                  method: "DELETE",
                                });
                                if (r.ok) {
                                  setSelectedPost(null);
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
                    검사가 직접 작성한 사건의 경위입니다.
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

              {/* 섹션 2: ⚖️ 최종 선고 - 메인 영역 */}
              {(() => {
                const isFinished = !isVotingOpen(selectedPost.created_at, selectedPost.voting_ended_at);
                const verdictText = typeof selectedPost.verdict === "string" ? selectedPost.verdict : "";
                const rationaleForLabel = selectedPost.verdict_rationale ?? (selectedPost as Record<string, unknown>).verdictRationale ?? "";
                const primaryLabel = getPrimaryLabelFromVerdictAndRatio(verdictText, selectedPost.ratio, typeof rationaleForLabel === "string" ? rationaleForLabel : "");
                const isFiftyFifty = primaryLabel === "판결 유보";
                const aiRatio = selectedPost.ratio ?? 50;
                const isDefense =
                  selectedPost.trial_type === "DEFENSE" ||
                  ((verdictText.includes("피고인 무죄") || verdictText.includes("불기소") || verdictText.includes("원고 무죄")) && selectedPost.trial_type !== "ACCUSATION");
                const notGuiltyPct = isDefense ? aiRatio : 100 - aiRatio;
                const guiltyPct = isDefense ? 100 - aiRatio : aiRatio;

                return (
                  <section className="space-y-4" aria-label="최종 선고">
                    <div>
                      <div className="text-xs font-black tracking-widest uppercase text-zinc-400">
                        ⚖️ 최종 선고
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        이 사건에 대한 최종 선고와 그 근거입니다. 유사 판례는 국가법령정보센터 법령 API로 검색·반영됩니다.
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
                        const verdictShort = typeof selectedPost.verdict === "string" ? selectedPost.verdict : "";
                        const displayText =
                          sanitizeVerdictDisplay(rationale) ||
                          sanitizeVerdictDisplay(verdictShort) ||
                          "상세 판결 근거가 기록되지 않은 사건입니다. 이전 버전에서 작성된 사건이거나 기록이 누락되었을 수 있습니다.";
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
                            {first === "not_guilty" ? "피고인 무죄" : "피고인 유죄"} ({first === "not_guilty" ? notGuiltyPct : guiltyPct}%) {first === "not_guilty" ? selectedPost.not_guilty : selectedPost.guilty}표
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
                            {second === "not_guilty" ? "피고인 무죄" : "피고인 유죄"} ({second === "not_guilty" ? notGuiltyPct : guiltyPct}%) {second === "not_guilty" ? selectedPost.not_guilty : selectedPost.guilty}표
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
                    const verdictText = typeof selectedPost.verdict === "string" ? selectedPost.verdict : "";
                    const aiConclusion = getConclusionFromVerdictText(verdictText);
                    const aiDefendantPct = selectedPost.ratio ?? 50;
                    const aiVerdict =
                      aiConclusion === "guilty"
                        ? "유죄"
                        : aiConclusion === "not_guilty"
                          ? "무죄"
                          : aiDefendantPct >= 50
                            ? "유죄"
                            : "무죄";
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
              <div ref={commentsSectionRef} className="border-t border-zinc-800 pt-6">
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
                        onClick={() => setCommentSort("oldest")}
                        className={`shrink-0 whitespace-nowrap ${commentSort === "oldest" ? "font-semibold text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
                      >
                        작성순
                      </button>
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
                      <div className="mt-4 pr-1">
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
                              {jurorLabels[getCommentLabelKey(c)] ?? "배심원"}
                              {!isOperator && maskCommentIp(c.ip_address) ? ` (${maskCommentIp(c.ip_address)})` : ""}
                            </span>
                            {isOperator ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/30 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-black text-amber-200 border border-amber-500/50 whitespace-nowrap">
                                ⚖️ 대법관
                              </span>
                            ) : null}
                            {c.is_post_author ? (
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
                              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                                <span className={`font-bold shrink-0 whitespace-nowrap text-[10px] sm:text-[11px] ${isReplyOperator ? "text-amber-400" : "text-amber-500/80"}`}>
                                  {jurorLabels[getCommentLabelKey(reply)] ?? "배심원"}
                                  {!isReplyOperator && maskCommentIp(reply.ip_address) ? ` (${maskCommentIp(reply.ip_address)})` : ""}
                                </span>
                                {isReplyOperator ? (
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/30 px-1.5 py-0.5 text-[9px] font-black text-amber-200 border border-amber-500/50 whitespace-nowrap">
                                    ⚖️ 대법관
                                  </span>
                                ) : null}
                                {reply.is_post_author ? (
                                  <span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-amber-300 whitespace-nowrap">
                                    작성자
                                  </span>
                                ) : null}
                              </div>
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
                                  {!isReplyOperator ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCommentDeleteTargetId(reply.id);
                                        setCommentMenuOpenId(null);
                                      }}
                                      className="text-[10px] sm:text-[11px] text-zinc-500 hover:text-red-400 whitespace-nowrap"
                                    >
                                      삭제
                                    </button>
                                  ) : null}
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
      ); })() ) : null}
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