"use client";

import React from "react";

const DEFAULT_COUPANG_LINK = "https://link.coupang.com/a/dHLvG2";

type Props = {
  href?: string;
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

/** 쿠팡 파트너스 배너: 본문과 어울리는 깔끔한 박스, 우측에 흐린 AD 표시 */
export function CoupangBanner({ href = DEFAULT_COUPANG_LINK }: Props) {
  return (
    <div className="w-full max-w-md md:max-w-lg">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="relative block rounded-full border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 w-full overflow-hidden min-w-0 cursor-pointer hover:border-zinc-600 hover:bg-zinc-900 transition-colors"
        aria-label="쿠팡 파트너스 링크"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-red-500/90 text-white"
              aria-hidden
            >
              <ShoppingIcon className="w-3 h-3" />
            </span>
            <span className="text-[12px] font-bold text-white leading-tight">
              답답한 사연 읽고 고구마 먹은 기분?
              <br className="md:hidden" />
              <span className="text-amber-400 font-extrabold">&apos;두쫀쿠&apos;</span>로 달달하게 보충해 보세요.
            </span>
          </div>
          <span className="text-[10px] text-zinc-600 font-medium tracking-wider select-none shrink-0" aria-label="광고">
            AD
          </span>
        </div>
      </a>
      <p className="mt-1.5 text-[8px] md:text-[10px] text-zinc-500 leading-snug" style={{ color: "#666" }}>
        * 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
      </p>
    </div>
  );
}
