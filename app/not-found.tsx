import Link from "next/link";
import { Logo } from "@/app/components/Logo";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col items-center justify-center px-4">
      <Logo className="mb-8" />
      <div className="max-w-md w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
        <p className="text-6xl font-black text-zinc-700 mb-2">404</p>
        <p className="text-lg font-bold text-amber-400 mb-2">페이지를 찾을 수 없습니다</p>
        <p className="text-sm text-zinc-400 mb-6">
          요청하신 주소가 없거나 이동되었을 수 있습니다.
        </p>
        <Link
          href="/"
          className="inline-block rounded-xl border border-amber-500/50 bg-amber-500/20 px-6 py-3 text-sm font-bold text-amber-400 hover:bg-amber-500/30 transition"
        >
          메인으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
