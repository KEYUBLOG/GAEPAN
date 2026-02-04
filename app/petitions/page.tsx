"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Petition = {
  id: string;
  title: string;
  content: string;
  category: string;
  created_at: string;
  agree_count: number;
  response_threshold: number;
  status: "ongoing" | "completed";
  progress: number;
};

export default function PetitionsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"ongoing" | "completed">("ongoing");
  const [petitions, setPetitions] = useState<Petition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPetitions();
  }, [tab]);

  const loadPetitions = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/petitions?status=${tab}`);
      const data = (await r.json()) as { petitions?: Petition[]; error?: string };
      if (!r.ok || data.error) {
        throw new Error(data.error ?? "청원을 불러오지 못했습니다.");
      }
      setPetitions(data.petitions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "청원을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      {/* 네비게이션 */}
      <nav className="p-6 border-b border-zinc-900 flex justify-between items-center sticky top-0 bg-zinc-950/80 backdrop-blur-md z-50">
        <Link href="/" className="text-2xl font-black tracking-tighter text-amber-500 italic">
          GAEPAN
        </Link>
        <Link
          href="/"
          className="text-sm font-bold text-zinc-400 hover:text-amber-500 transition"
        >
          메인으로
        </Link>
      </nav>

      <div className="max-w-4xl mx-auto py-12 px-6">
        <div className="mb-8">
          <h1 className="text-4xl font-black text-amber-400 mb-2">국민 청원</h1>
          <p className="text-zinc-500">서비스 개선을 위한 여러분의 목소리를 들려주세요</p>
        </div>

        {/* 탭 */}
        <div className="flex gap-4 mb-6 border-b border-zinc-800">
          <button
            onClick={() => setTab("ongoing")}
            className={`px-4 py-2 font-bold transition ${
              tab === "ongoing"
                ? "text-amber-500 border-b-2 border-amber-500"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            청원 진행 중
          </button>
          <button
            onClick={() => setTab("completed")}
            className={`px-4 py-2 font-bold transition ${
              tab === "completed"
                ? "text-amber-500 border-b-2 border-amber-500"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            답변 완료
          </button>
        </div>

        {/* 청원 작성 버튼 */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/petitions/new")}
            className="rounded-xl bg-amber-600 hover:bg-amber-500 text-black px-6 py-3 text-sm font-bold transition"
          >
            + 새 청원 작성하기
          </button>
        </div>

        {/* 에러 메시지 */}
        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 mb-4">
            {error}
          </div>
        ) : null}

        {/* 청원 리스트 */}
        {loading ? (
          <div className="text-center py-12 text-zinc-500">불러오는 중...</div>
        ) : petitions.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            {tab === "ongoing" ? "진행 중인 청원이 없습니다." : "답변 완료된 청원이 없습니다."}
          </div>
        ) : (
          <div className="space-y-4">
            {petitions.map((p) => (
              <Link
                key={p.id}
                href={`/petitions/${p.id}`}
                className={`block rounded-xl border p-6 transition hover:border-amber-500/50 ${
                  p.agree_count >= 50
                    ? "border-amber-500/60 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.15)]"
                    : "border-zinc-800 bg-zinc-900/80"
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-zinc-100 mb-2 line-clamp-1 min-w-0 break-words">{p.title}</h3>
                    <p className="text-sm text-zinc-400 line-clamp-2">{p.content}</p>
                  </div>
                  {p.agree_count >= 50 ? (
                    <span className="text-xs font-black text-amber-400 bg-amber-500/20 px-2 py-1 rounded-full border border-amber-500/50 whitespace-nowrap">
                      ⭐ 인기 청원
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-zinc-800">
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-zinc-500">동의 수: </span>
                      <span className="font-bold text-amber-400">{p.agree_count}명</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">답변 달성률: </span>
                      <span className="font-bold text-blue-400">{p.progress}%</span>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500">
                    {p.created_at
                      ? new Date(p.created_at).toLocaleDateString("ko-KR", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : ""}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
