"use client";

import React, { type RefObject } from "react";

export type CourtLogEntry =
  | {
      kind: "vote";
      id: string;
      post_id: string;
      post_title: string | null;
      vote_type: "guilty" | "not_guilty";
      voter_id: string;
      nickname: string;
      created_at: string;
    }
  | {
      kind: "comment";
      id: string;
      post_id: string;
      post_title: string | null;
      nickname: string;
      created_at: string;
    };

export type PostMinimal = { id: string; title: string | null };

type CommonProps = {
  courtLogs: CourtLogEntry[];
  recentPosts: PostMinimal[];
  onSelectPost: (post: PostMinimal) => void;
};

function LogList({
  courtLogs,
  recentPosts,
  onSelectPost,
  onItemClick,
  className,
}: {
  courtLogs: CourtLogEntry[];
  recentPosts: PostMinimal[];
  onSelectPost: (post: PostMinimal) => void;
  onItemClick?: () => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[10px] text-zinc-500/70 mb-3 font-mono uppercase tracking-wider">
        실시간 법정 기록 (Live Court Minutes)
      </div>
      {courtLogs.length === 0 ? (
        <p className="text-zinc-500 text-center py-8 text-xs sm:text-sm">아직 판결 기록이 없습니다.</p>
      ) : (
        <ul className="space-y-2 font-mono text-xs">
          {courtLogs.map((log) => {
            const date = new Date(log.created_at);
            const dateStr = date.toLocaleDateString("ko-KR", {
              year: "2-digit",
              month: "2-digit",
              day: "2-digit",
            });
            const timeStr = date.toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            });
            const isVote = log.kind === "vote";
            const isGuilty = isVote && log.vote_type === "guilty";
            const post = recentPosts.find((p) => p.id === log.post_id);
            return (
              <li
                key={log.id}
                onClick={() => {
                  if (post) {
                    onSelectPost(post);
                    onItemClick?.();
                  }
                }}
                className="text-zinc-300 py-1.5 px-2 rounded border-l-2 border-amber-500/20 bg-black/10 hover:bg-black/20 transition-all duration-300 cursor-pointer"
                style={{ animation: "slideUp 0.3s ease-out" }}
              >
                <span className="text-zinc-500 text-[10px] mr-2">[{dateStr} {timeStr}]</span>
                <span className="text-zinc-500">{log.nickname}님이</span>
                {log.post_title ? (
                  <>
                    <span className="text-amber-400 font-semibold mx-1">
                      &apos;{log.post_title.length > 25 ? `${log.post_title.slice(0, 25)}…` : log.post_title}&apos;
                    </span>
                    <span className="text-zinc-500">
                      {isVote ? "사건의 판결문에 날인했습니다." : "사건에 배심원 한마디를 남겼습니다."}
                    </span>
                  </>
                ) : (
                  <span className="text-zinc-500 mx-1">
                    {isVote ? "사건의 판결문에 날인했습니다." : "사건에 배심원 한마디를 남겼습니다."}
                  </span>
                )}
                {isVote ? (
                  <span className={`font-bold ml-1.5 ${isGuilty ? "text-red-600" : "text-blue-600"}`}>
                    ({isGuilty ? "유죄" : "무죄"})
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** 그리드 내 사이드바용 (PC) */
export function LiveCourtAside({
  courtLogs,
  recentPosts,
  scrollRef,
  onSelectPost,
}: CommonProps & {
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <aside className="hidden md:col-span-4 md:pl-6 md:pr-0">
      <section className="sticky top-24 pt-4 md:pt-6 pb-8 flex flex-col h-[calc(100vh-120px)]">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h3 className="text-lg md:text-xl font-black mb-1">실시간 재판소</h3>
            <p className="text-zinc-500 text-[11px] sm:text-[13px]">정의는 멈추지 않는다, 지금 이 순간의 판결</p>
          </div>
          <div className="flex items-center gap-2 text-amber-500 font-bold text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            LIVE
          </div>
        </div>
        <div
          ref={scrollRef}
          className="bg-zinc-900/50 backdrop-blur border-l-4 border-amber-500/30 rounded-xl p-4 flex-1 overflow-y-auto shadow-[0_0_20px_rgba(245,158,11,0.15)]"
          style={{
            boxShadow: "0 0 20px rgba(245,158,11,0.15), inset 0 0 20px rgba(0,0,0,0.3)",
          }}
        >
          <LogList courtLogs={courtLogs} recentPosts={recentPosts} onSelectPost={onSelectPost} />
        </div>
      </section>
    </aside>
  );
}

/** 하단 티커 + 슬라이드업 패널 (모바일·PC 공통) */
export function LiveCourtTicker({
  courtLogs,
  recentPosts,
  scrollRef,
  onSelectPost,
  isMobileLogOpen,
  onMobileLogOpenChange,
}: CommonProps & {
  /** 모바일 슬라이드업 열렸을 때 이 ref에 스크롤 영역을 넣어 스크롤 제어 */
  scrollRef: RefObject<HTMLDivElement | null>;
  isMobileLogOpen: boolean;
  onMobileLogOpenChange: (open: boolean) => void;
}) {
  const setScrollRef = React.useCallback(
    (el: HTMLDivElement | null) => {
      const mutable = scrollRef as React.MutableRefObject<HTMLDivElement | null>;
      if (isMobileLogOpen) mutable.current = el;
      else if (!el) mutable.current = null;
    },
    [scrollRef, isMobileLogOpen]
  );
  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t-4 border-amber-500/30 bg-zinc-900/95 backdrop-blur">
        <button
          type="button"
          onClick={() => onMobileLogOpenChange(true)}
          className="w-full px-4 py-3 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <span className="text-xs font-bold text-amber-400 shrink-0">실시간 재판소</span>
            {courtLogs.length > 0 && courtLogs[0] ? (
              <span className="text-xs text-zinc-400 truncate ml-2">
                {courtLogs[0].kind === "vote"
                  ? `${courtLogs[0].nickname}님이 ${courtLogs[0].post_title ? `'${courtLogs[0].post_title.length > 20 ? `${courtLogs[0].post_title.slice(0, 20)}…` : courtLogs[0].post_title}'` : "사건"}에 ${courtLogs[0].vote_type === "guilty" ? "유죄" : "무죄"} 판결`
                  : `${courtLogs[0].nickname}님이 ${courtLogs[0].post_title ? `'${courtLogs[0].post_title.length > 20 ? `${courtLogs[0].post_title.slice(0, 20)}…` : courtLogs[0].post_title}'` : "사건"}에 배심원 한마디를 남겼습니다.`}
              </span>
            ) : (
              <span className="text-xs text-zinc-500 ml-2">아직 판결 기록이 없습니다.</span>
            )}
          </div>
          <span className="text-amber-500 text-xs shrink-0 ml-2">↑</span>
        </button>
      </div>

      {isMobileLogOpen ? (
        <div className="fixed inset-0 z-[200] flex flex-col">
          <button
            type="button"
            onClick={() => onMobileLogOpenChange(false)}
            className="absolute inset-0 bg-black/70"
            aria-label="닫기"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur border-t-4 border-amber-500/30 rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] max-h-[80vh] flex flex-col animate-slide-up">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div>
                <h3 className="text-lg font-black mb-1">실시간 재판소</h3>
                <p className="text-zinc-500 text-[11px]">정의는 멈추지 않는다, 지금 이 순간의 판결</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-amber-500 font-bold text-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                  </span>
                  LIVE
                </div>
                <button
                  type="button"
                  onClick={() => onMobileLogOpenChange(false)}
                  className="text-zinc-400 hover:text-zinc-200 text-xl font-bold"
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
            </div>
            <div ref={setScrollRef} className="flex-1 overflow-y-auto p-4">
              <LogList
                courtLogs={courtLogs}
                recentPosts={recentPosts}
                onSelectPost={onSelectPost}
                onItemClick={() => onMobileLogOpenChange(false)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
