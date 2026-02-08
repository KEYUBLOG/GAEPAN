"use client";

import React, { forwardRef } from "react";

export type StoryShareCardProps = {
  title: string;
  isAuthorVictory: boolean;
  guiltyPct: number;
  notGuiltyPct: number;
  authorName: string;
  trialType: "DEFENSE" | "ACCUSATION" | null;
};

/** 인스타 스토리용 결과 카드. 360x640 렌더 → scale 3 시 1080x1920 */
const StoryShareCardInner = forwardRef<HTMLDivElement, StoryShareCardProps>(
  function StoryShareCardInner(
    { title, isAuthorVictory, guiltyPct, notGuiltyPct, authorName, trialType },
    ref
  ) {
    const subText = isAuthorVictory
      ? trialType === "DEFENSE"
        ? `배심원 ${notGuiltyPct}%의 지지로 무죄 판결`
        : `배심원 ${guiltyPct}%의 지지로 유죄 판결`
      : trialType === "DEFENSE"
        ? `배심원 ${guiltyPct}%의 지지로 유죄 판결`
        : `배심원 ${notGuiltyPct}%의 지지로 무죄 판결`;

    return (
      <div
        ref={ref}
        style={{ width: 360, height: 640 }}
        className="flex flex-col items-center justify-between bg-[#0a0a0a] text-white overflow-hidden rounded-none"
      >
        {/* 상단: 브랜드 */}
        <div className="w-full pt-12 pb-4 text-center">
          <p className="text-amber-500 font-black text-xl tracking-tighter italic">
            GAEPAN
          </p>
          <p className="text-[10px] text-zinc-500 mt-1 tracking-widest uppercase">
            AI 대법관 판결문
          </p>
        </div>

        {/* 중앙: 사건 제목 + 결과 */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 w-full">
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest mb-3">
            사건 제목
          </p>
          <h2 className="text-zinc-100 font-bold text-center text-lg leading-tight line-clamp-2 mb-8">
            {title}
          </h2>
          <div
            className={
              isAuthorVictory
                ? "text-[#FFD700] font-black text-4xl"
                : "text-zinc-500 font-black text-4xl"
            }
          >
            {isAuthorVictory ? "🏆 최종 승소" : "🔨 최종 패소"}
          </div>
          <p className="text-zinc-400 text-xs mt-4 text-center max-w-[280px]">
            {isAuthorVictory
              ? trialType === "DEFENSE"
                ? `${authorName}의 항변이 받아들여졌습니다`
                : `${authorName}의 기소가 성공했습니다`
              : `배심원단이 ${authorName}의 주장을 기각했습니다`}
          </p>
          <p className="text-zinc-500 text-[10px] mt-2">{subText}</p>
        </div>

        {/* 하단 */}
        <div className="w-full pb-10 text-center">
          <p className="text-zinc-600 text-[10px]">
            개판에서 확인한 판결
          </p>
        </div>
      </div>
    );
  }
);

export { StoryShareCardInner as StoryShareCard };
