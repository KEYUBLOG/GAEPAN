"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;

function getRemainingMs(createdAt: string | null, votingEndedAt?: string | null): number {
  if (votingEndedAt) return 0;
  if (!createdAt) return 0;
  const end = new Date(createdAt).getTime() + TRIAL_DURATION_MS;
  return Math.max(0, end - Date.now());
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "재판 종료";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type Post = {
  id: string;
  title: string | null;
  content: string | null;
  created_at: string | null;
  guilty: number;
  not_guilty: number;
  case_number: number | null;
  category: string | null;
  voting_ended_at: string | null;
};

/** 판결문을 1080x1920 슬라이드로 표시. /slides/verdict?post=판결문ID */
function VerdictSlideContent() {
  const searchParams = useSearchParams();
  const postId = searchParams.get("post");
  const caseNum = searchParams.get("case");
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(!!(postId || caseNum));
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string>("00:00:00");

  useEffect(() => {
    if (!postId?.trim() && !caseNum?.trim()) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    let query = supabase
      .from("posts")
      .select("id, title, content, created_at, guilty, not_guilty, case_number, category, voting_ended_at")
      .neq("status", "판결불가");
    if (postId?.trim()) {
      query = query.eq("id", postId);
    } else if (caseNum?.trim()) {
      const n = parseInt(caseNum, 10);
      if (Number.isFinite(n)) query = query.eq("case_number", n);
    }
    query.maybeSingle().then(({ data, error: err }) => {
      setLoading(false);
      if (err) {
        setError(err.message);
        return;
      }
      if (data) setPost(data as Post);
      else setError("판결문을 찾을 수 없습니다.");
    });
  }, [postId, caseNum]);

  useEffect(() => {
    if (!post?.created_at) return;
    const tick = () => {
      const ms = getRemainingMs(post.created_at, post.voting_ended_at);
      setCountdown(formatCountdown(ms));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [post?.created_at, post?.voting_ended_at]);

  const dateStr = post?.created_at
    ? new Date(post.created_at).toLocaleString("ko-KR", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  if (!postId && !caseNum) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 text-zinc-400">
        <p className="text-lg">URL에 판결문 ID 또는 사건 번호를 붙여 주세요.</p>
        <p className="text-sm mt-2">예: /slides/verdict?post=UUID 또는 /slides/verdict?case=16</p>
        <Link href="/" className="mt-6 text-amber-500 font-bold hover:underline">
          메인으로
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        불러오는 중...
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 text-zinc-400">
        <p className="text-lg">{error ?? "판결문을 찾을 수 없습니다."}</p>
        <Link href="/" className="mt-6 text-amber-500 font-bold hover:underline">
          메인으로
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <p className="text-zinc-500 text-xs mb-2">
        1080×1920. 캡처: 개발자도구 → 슬라이드 영역 선택 → 노드 스크린샷 캡처
      </p>
      <div
        className="relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl flex flex-col"
        style={{ width: 1080, height: 1920 }}
      >
        {/* 상단: 판결문 상세 + 사건번호 + 닫기 */}
        <div className="flex items-center justify-between px-10 py-6 border-b border-zinc-800 shrink-0">
          <h1 className="text-2xl font-black text-amber-500">판결문 상세</h1>
          <div className="flex items-center gap-4">
            {post.case_number != null && (
              <span className="text-zinc-400 text-sm font-bold">사건 번호 {post.case_number}</span>
            )}
            <Link
              href="/"
              className="rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-bold text-zinc-200 hover:bg-zinc-800"
            >
              닫기
            </Link>
          </div>
        </div>

        {/* 본문 스크롤 */}
        <div className="flex-1 overflow-y-auto px-10 py-8">
          <h2 className="text-[32px] font-black text-zinc-100 leading-tight mb-4">
            {post.title || "(제목 없음)"}
          </h2>
          <div className="flex items-center gap-4 mb-6 text-zinc-400">
            <span className="flex items-center gap-2 text-amber-500">
              <span className="text-lg">⏱</span>
              <span className="text-xl font-bold tabular-nums">남은 시간 {countdown}</span>
            </span>
            <span className="text-lg">
              익명 {dateStr}
            </span>
          </div>
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-sm bg-amber-600/80" />
              <span className="text-lg font-bold text-zinc-400">사건의 발단</span>
            </div>
            <p className="text-sm text-zinc-500 mb-4">원고가 직접 작성한 사건의 경위입니다.</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-6">
            <p className="text-[22px] leading-relaxed text-zinc-300 whitespace-pre-wrap">
              {post.content || "(내용 없음)"}
            </p>
          </div>
        </div>

        {/* 하단 브랜드 */}
        <div className="shrink-0 px-10 py-5 border-t border-zinc-800 text-center">
          <span className="text-amber-500 font-black italic tracking-tighter text-lg">개판 AI</span>
          <span className="text-zinc-500 font-bold text-lg ml-2">개인들의 판결소</span>
        </div>
      </div>
    </div>
  );
}

export default function VerdictSlidePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        불러오는 중...
      </div>
    }>
      <VerdictSlideContent />
    </Suspense>
  );
}
