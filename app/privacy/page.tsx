import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침 | 개판 AI",
  description: "개판 AI 개인정보처리방침",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-amber-400 mb-6">개인정보처리방침</h1>
        <p className="text-sm text-zinc-400 mb-8">
          개판 AI(이하 &quot;서비스&quot;)는 이용자의 개인정보를 소중히 하며, 관련 법령을 준수합니다.
        </p>

        <section className="space-y-6 text-sm text-zinc-300">
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">1. 수집하는 개인정보</h2>
            <p>
              서비스는 기소·댓글·투표 등 이용 시 IP 주소, 작성 내용(제목·본문·댓글)을 수집할 수 있습니다.
              삭제용 비밀번호는 암호화되어 저장됩니다.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">2. 이용 목적</h2>
            <p>
              수집된 정보는 서비스 제공, 부정 이용 방지, 분쟁 해결, 법령 준수 목적으로만 이용됩니다.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">3. 보유 및 파기</h2>
            <p>
              개인정보는 목적 달성 후 지체 없이 파기하거나, 법령에 따른 보존 기간 동안만 보관합니다.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">4. 제3자 제공</h2>
            <p>
              이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 단, 법령에 따른 경우는 예외로 합니다.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-200 mb-2">5. 문의</h2>
            <p>
              개인정보 처리와 관련한 문의는{" "}
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
