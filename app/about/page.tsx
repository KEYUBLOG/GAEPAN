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
          개판 AI(이하 &quot;서비스&quot;)는 24시간 동안 배심원 투표 후 최종 선고문이 작성되는 GAEPAN 법정 서비스입니다.
        </p>

        <section className="space-y-6 text-sm text-zinc-300">
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">서비스 개요</h2>
            <p>
              누군가를 기소하면 재판이 열리고, 이용자들이 유죄·무죄에 투표합니다.
              24시간 투표 기간이 끝나면 최종 선고문이 작성되며, 실시간으로 확정된 사건이 전광판에 반영됩니다.
              <strong className="text-zinc-200"> 명예의 전당</strong>에서 주차별 확정 사건을 볼 수 있습니다.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">주요 기능</h2>
            <p>
              기소·항변 작성, 유죄/무죄 투표, 댓글·좋아요, 선고문·판결 근거 확인, 확정 사건 전광판, 명예의 전당 등
              서비스가 제공하는 기능을 자유롭게 이용할 수 있습니다.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">선고문과 판례</h2>
            <p>
              개판은 <strong className="text-zinc-200">기소·항변</strong> 형식으로 사건을 접수합니다.
              배심원(이용자) 투표 후 선고문이 작성되며, 가능한 경우 <strong className="text-zinc-200">대법원·하급심 판례</strong>(국가법령정보센터 law.go.kr)를 참조합니다.
              선고: 재판 결과를 공식적으로 알리는 것. 주문: 선고문에서 &quot;무엇을 하라&quot;고 정한 결론 부분입니다.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">참고</h2>
            <p>
              본 선고문은 <strong className="text-amber-400/90">참고용</strong>이며 <strong className="text-amber-400/90">법적 효력이 없습니다.</strong> 실제 법적 분쟁은 변호사·법원에 문의하세요. 이용약관 및 개인정보처리방침은 하단 링크에서 확인해 주세요.
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
