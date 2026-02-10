import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "사이트 소개 | 개판 AI",
  description: "개판 AI 사이트 소개",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-amber-400 mb-6">사이트 소개</h1>
        <p className="text-sm text-zinc-400 mb-8">
          개판 AI(이하 &quot;서비스&quot;)는 AI가 판사 역할을 하는 24시간 법정 서비스입니다.
        </p>

        <section className="space-y-6 text-sm text-zinc-300">
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">서비스 개요</h2>
            <p>
              누군가를 기소하면 재판이 열리고, 이용자들이 유죄·무죄에 투표합니다.
              투표 기간이 끝나면 AI 대법관이 최종 선고를 내리며, 실시간으로 확정된 사건이 전광판에 반영됩니다.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">주요 기능</h2>
            <p>
              기소·항변 작성, 유죄/무죄 투표, 댓글·좋아요, AI 판결문·선고 확인, 확정 사건 전광판, 명예의 전당 등
              서비스가 제공하는 기능을 자유롭게 이용할 수 있습니다.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">참고</h2>
            <p>
              AI 판단 결과는 참고용이며 법적 효력이 없습니다. 이용약관 및 개인정보처리방침은 하단 링크에서 확인해 주세요.
            </p>
          </div>
        </section>

        <div className="mt-10">
          <Link
            href="/"
            className="text-sm text-amber-400 hover:text-amber-300 underline underline-offset-2"
          >
            ← 메인으로
          </Link>
        </div>
      </div>
    </div>
  );
}
