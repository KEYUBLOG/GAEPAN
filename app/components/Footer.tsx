"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="shrink-0 w-full border-t border-zinc-800 bg-zinc-950 py-4">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 text-center text-sm text-zinc-400">
        <Link
          href="/about"
          className="hover:text-amber-400 transition-colors underline underline-offset-2"
        >
          사이트 소개
        </Link>
        <span className="text-zinc-600" aria-hidden>|</span>
        <Link
          href="/privacy"
          className="hover:text-amber-400 transition-colors underline underline-offset-2"
        >
          개인정보처리방침
        </Link>
        <span className="text-zinc-600" aria-hidden>|</span>
        <Link
          href="/terms"
          className="hover:text-amber-400 transition-colors underline underline-offset-2"
        >
          이용약관
        </Link>
      </div>
    </footer>
  );
}
