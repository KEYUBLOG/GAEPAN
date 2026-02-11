"use client";

import React, { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";

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

export function ScoreboardSection({
  todayConfirmed,
  yesterdayConfirmed,
  cumulativeConfirmed,
  cumulativeStatsError,
}: {
  todayConfirmed: number | null;
  yesterdayConfirmed: number | null;
  cumulativeConfirmed: number | null;
  cumulativeStatsError: string | null;
}) {
  return (
    <div className="bg-black/40 backdrop-blur-md border border-zinc-800/60 rounded-2xl px-4 py-4 md:px-6 md:py-5 shadow-[0_0_30px_rgba(0,0,0,0.6)]">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-4 mb-3 text-center">
        <h3 className="text-[11px] md:text-xs font-semibold tracking-[0.2em] uppercase text-zinc-400">
          실시간 사법 전광판
        </h3>
      </div>
      {cumulativeStatsError ? (
        <p className="text-[11px] text-red-400 text-center">{cumulativeStatsError}</p>
      ) : (
        <div className="flex flex-row items-stretch justify-center gap-4 md:gap-6">
          <div className="flex flex-col items-center justify-center text-center flex-1 min-w-0">
            <span className="text-[11px] text-zinc-500 mb-1">오늘 확정된 사건</span>
            <div className="text-xl md:text-2xl font-black text-zinc-200">
              <AnimatedNumber value={todayConfirmed ?? 0} />
            </div>
          </div>
          <div className="flex flex-col items-center justify-center text-center flex-1 min-w-0 border-l border-zinc-700 pl-4 md:pl-6">
            <span className="text-[11px] text-zinc-500 mb-1">어제 확정된 사건</span>
            <div className="text-xl md:text-2xl font-black text-zinc-300">
              <AnimatedNumber value={yesterdayConfirmed ?? 0} />
            </div>
          </div>
          <div className="flex flex-col items-center justify-center text-center flex-1 min-w-0 border-l border-zinc-700 pl-4 md:pl-6">
            <span className="text-[11px] text-amber-400/90 mb-1 font-semibold">누적 확정된 사건</span>
            <div className="text-xl md:text-2xl font-black text-amber-400">
              <AnimatedNumber value={cumulativeConfirmed ?? 0} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
