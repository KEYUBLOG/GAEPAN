"use client";

import React, { useEffect, useState } from "react";

const STORAGE_KEY = "gaepan_interstitial_closed";

type Props = {
  oncePerSession?: boolean;
  imageUrl: string;
  linkUrl: string;
  delayMs?: number;
};

export function InterstitialAd({
  oncePerSession = true,
  imageUrl,
  linkUrl,
  delayMs = 0,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    if (oncePerSession && sessionStorage.getItem(STORAGE_KEY) === "1") return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [mounted, oncePerSession, delayMs]);

  const handleClose = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (oncePerSession) sessionStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="전면 광고"
    >
      <div className="relative w-full max-w-sm max-h-[90dvh] flex flex-col overflow-y-auto overflow-x-hidden bg-white shadow-xl rounded-lg">
        {/* TOP: 헤드라인 + 닫기 */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
          <p className="text-[15px] font-semibold text-zinc-800 leading-snug flex-1 min-w-0">
            사연 읽느라 굳어버린 몸, 그대로 잠들 건가요?
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 p-1 -m-1 text-zinc-400 hover:text-zinc-600 transition-colors rounded"
            aria-label="닫기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="px-5 pb-2 text-[10px] text-zinc-300 leading-snug" aria-hidden>
          쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
        </p>

        {/* MIDDLE: 히노끼 숲 이미지 (클릭 시 링크 이동) */}
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="block w-full aspect-[4/5] bg-zinc-100 overflow-hidden"
        >
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </a>

        {/* BOTTOM: 서브 카피 */}
        <p className="px-5 pt-4 pb-2 text-[13px] text-zinc-600 leading-relaxed">
          집에서 즐기는 정통 온천의 향, 바스로망 히노끼 입욕제 ♨️
        </p>

        {/* FOOTER: CTA 버튼 */}
        <div className="px-5 pb-5 pt-1 flex flex-col gap-3">
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="block w-full py-3.5 text-center text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors rounded"
          >
            쿠팡 최저가 확인하기
          </a>
          <button
            type="button"
            onClick={handleClose}
            className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
