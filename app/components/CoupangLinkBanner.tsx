"use client";

import React from "react";

const DEFAULT_HREF = "https://shop.coupang.com/apple?source=brandstore_sdp_atf_topbadge&pid=9024167576&viid=93437609640&platform=p&brandId=0&btcEnableForce=false";

type Props = {
  href?: string;
  className?: string;
};

/** 쇼핑백 아이콘 (24x24) */
function ShoppingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

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
        <span className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-red-500/90 text-white" aria-hidden>
          <ShoppingIcon className="w-3.5 h-3.5" />
        </span>
        <span className="text-[11px] md:text-xs font-bold text-zinc-200">
          쿠팡이 추천하는 Apple 공식 브랜드관 특가 보기
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
