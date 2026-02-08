"use client";

import React from "react";

const DEFAULT_HREF = "https://link.coupang.com/a/dIhc8f";

type Props = {
  href?: string;
  className?: string;
};

/** 쿠팡 파트너스 링크 배너 — 로고 아래·전광판 위 등에 배치용 슬림 배너 */
export function CoupangLinkBanner({ href = DEFAULT_HREF, className = "" }: Props) {
  return (
    <div className={className}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 w-full min-w-0 hover:border-zinc-600 hover:bg-zinc-800/90 transition-colors"
        aria-label="쿠팡 파트너스 링크"
      >
        <span className="shrink-0 text-lg leading-none" aria-hidden>✈️</span>
        <span className="text-[11px] md:text-xs font-bold text-zinc-200">
          쿠팡에서 설 황금연휴 여행 특가 보기
        </span>
        <span className="text-[9px] text-zinc-500 font-medium tracking-wider select-none shrink-0">
          AD
        </span>
      </a>
      <p className="mt-1 text-[8px] md:text-[9px] text-zinc-500 leading-snug text-center">
        쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
      </p>
    </div>
  );
}
