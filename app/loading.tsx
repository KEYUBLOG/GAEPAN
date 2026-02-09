import { Logo } from "@/app/components/Logo";

export default function Loading() {
  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col items-center justify-center gap-6">
      <Logo />
      <div
        className="h-8 w-8 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin"
        aria-hidden
      />
      <p className="text-sm text-zinc-500">불러오는 중...</p>
    </div>
  );
}
