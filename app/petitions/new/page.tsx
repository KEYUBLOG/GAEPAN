"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Logo } from "@/app/components/Logo";
import { useRouter } from "next/navigation";

export default function NewPetitionPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "",
    content: "",
    category: "",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim() || !form.category || !form.password.trim()) {
      setError("모든 항목을 입력해주세요.");
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const r = await fetch("/api/petitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await r.json()) as { petition?: { id: string }; error?: string };
      if (!r.ok || data.error) {
        throw new Error(data.error ?? "청원 작성에 실패했습니다.");
      }
      if (data.petition?.id) {
        router.push(`/petitions/${data.petition.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "청원 작성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      {/* 네비게이션 */}
      <nav className="p-6 border-b border-zinc-900 flex justify-between items-center sticky top-0 bg-zinc-950/80 backdrop-blur-md z-50">
        <Logo />
        <Link
          href="/petitions"
          className="text-sm font-bold text-zinc-400 hover:text-amber-500 transition"
        >
          ← 청원 목록
        </Link>
      </nav>

      <div className="max-w-2xl mx-auto py-12 px-6">
        <h1 className="text-4xl font-black text-amber-400 mb-8">새 청원 작성</h1>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 mb-6">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-black tracking-widest uppercase text-zinc-400 mb-2">
              청원 분야
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition"
              required
            >
              <option value="">카테고리를 선택하세요</option>
              <option value="기능제안">기능제안</option>
              <option value="카테고리">카테고리</option>
              <option value="기타">기타</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-black tracking-widest uppercase text-zinc-400 mb-2">
              제목
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="청원 제목을 입력하세요"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition"
              required
              maxLength={200}
            />
          </div>

          <div>
            <label className="block text-xs font-black tracking-widest uppercase text-zinc-400 mb-2">
              내용
            </label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              placeholder="청원 내용을 상세히 작성해주세요"
              rows={10}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition resize-y"
              required
              maxLength={2000}
            />
            <div className="mt-2 text-xs text-zinc-500 text-right">
              {form.content.length}/2000
            </div>
          </div>

          <div>
            <label className="block text-xs font-black tracking-widest uppercase text-zinc-400 mb-2">
              청원 삭제 비밀번호
            </label>
            <p className="text-xs text-zinc-500 mb-2">나중에 청원을 삭제할 때 사용할 비밀번호입니다.</p>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="비밀번호 입력"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition"
              required
              maxLength={20}
            />
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-3 text-sm font-bold text-zinc-200 hover:bg-zinc-800 transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting || !form.title.trim() || !form.content.trim() || !form.category || !form.password.trim()}
              className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-500 text-black px-6 py-3 text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "작성 중..." : "청원 작성하기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
