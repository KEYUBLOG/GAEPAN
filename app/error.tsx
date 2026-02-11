"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/app/components/Logo";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GAEPAN] Error boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-4">
      <Logo className="mb-8" />
      <div className="max-w-md w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
        <p className="text-lg font-bold text-amber-400 mb-2">문제가 발생했습니다</p>
        <p className="text-sm text-zinc-400 mb-6">
          일시적인 오류일 수 있습니다. 사건 접수가 지연된 것일 수 있으니 다시 시도하거나 메인으로 돌아가 주세요.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-amber-500/50 bg-amber-500/20 px-6 py-3 text-sm font-bold text-amber-400 hover:bg-amber-500/30 transition"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="rounded-xl border border-zinc-700 bg-zinc-800 px-6 py-3 text-sm font-bold text-zinc-200 hover:bg-zinc-700 transition text-center"
          >
            메인으로
          </Link>
        </div>
      </div>
    </div>
  );
}
