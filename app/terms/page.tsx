import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "이용약관 | 개판 AI",
  description: "개판 AI 이용약관",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-amber-400 mb-6">이용약관</h1>
        <p className="text-sm text-zinc-400 mb-8">
          개판 AI(이하 &quot;서비스&quot;) 이용과 관련한 약관입니다.
        </p>

        <section className="space-y-6 text-sm text-zinc-300">
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">제1조 (목적)</h2>
            <p>
              본 약관은 서비스 이용 조건 및 운영자와 이용자 간 권리·의무를 정함을 목적으로 합니다.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">제2조 (서비스 이용)</h2>
            <p>
              이용자는 기소·항변 제출, 투표, 댓글 등 서비스가 제공하는 기능을 이용할 수 있습니다.
              법령 및 공서양속에 위배되는 이용, 타인 비방·명예훼손, 스팸·허위 정보 게시 등은 금지됩니다.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">제3조 (운영)</h2>
            <p>
              운영자는 서비스 품질 유지, 부적절한 이용 제한, 이용약관·개인정보처리방침 변경 등을 할 수 있습니다.
              중대한 변경 시 서비스 내 공지 등으로 안내합니다.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">제4조 (면책)</h2>
            <p>
              서비스는 이용자가 게시한 내용에 대해 사실 여부를 보증하지 않으며,
              AI 판단 결과는 참고용이며 법적 효력이 없습니다. 이용 간 분쟁은 당사자 간 해결을 원칙으로 합니다.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">제5조 (준거법)</h2>
            <p>
              본 약관과 서비스 이용에 관한 분쟁에는 대한민국 법률이 적용됩니다.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">제6조 (문의)</h2>
            <p>
              이용약관 및 서비스 이용과 관련한 문의는{" "}
              <a href="mailto:mire71278@gmail.com" className="text-amber-400 hover:text-amber-300 underline underline-offset-2">
                mire71278@gmail.com
              </a>
              으로 연락해 주세요.
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
