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
  hasAgreed: boolean;
};

type Comment = {
  id: string;
  content: string;
  created_at: string;
  is_operator: boolean;
};

export default function PetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [petitionId, setPetitionId] = useState<string | null>(null);
  const [petition, setPetition] = useState<Petition | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [agreeLoading, setAgreeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOperatorLoggedIn, setIsOperatorLoggedIn] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [deletePetitionId, setDeletePetitionId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteToast, setDeleteToast] = useState<{ message: string; isError?: boolean } | null>(null);

  useEffect(() => {
    params.then((p) => setPetitionId(p.id));
  }, [params]);

  useEffect(() => {
    if (!petitionId) return;
    loadPetition();
    loadComments();
    checkOperatorStatus();
  }, [petitionId]);

  const checkOperatorStatus = async () => {
    try {
      const r = await fetch("/api/admin/check");
      const data = (await r.json()) as { loggedIn?: boolean };
      setIsOperatorLoggedIn(data.loggedIn === true);
    } catch {
      setIsOperatorLoggedIn(false);
    }
  };

  const loadPetition = async () => {
    if (!petitionId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/petitions/${petitionId}`);
      const data = (await r.json()) as { petition?: Petition; error?: string };
      if (!r.ok || data.error) {
        throw new Error(data.error ?? "청원을 불러오지 못했습니다.");
      }
      setPetition(data.petition ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "청원을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async () => {
    if (!petitionId) return;
    try {
      const r = await fetch(`/api/petitions/${petitionId}/comments`);
      const data = (await r.json()) as { comments?: Comment[]; error?: string };
      if (!r.ok || data.error) {
        throw new Error(data.error ?? "댓글을 불러오지 못했습니다.");
      }
      setComments(data.comments ?? []);
    } catch (err) {
      console.error("댓글 로드 실패:", err);
    }
  };

  const handleAgree = async () => {
    if (!petitionId || agreeLoading) return;
    setAgreeLoading(true);
    try {
      const r = await fetch(`/api/petitions/${petitionId}/agree`, {
        method: "POST",
      });
      const data = (await r.json()) as { success?: boolean; error?: string; agreeCount?: number };
      if (!r.ok || !data.success) {
        throw new Error(data.error ?? "동의 처리에 실패했습니다.");
      }
      // 성공 팝업
      window.alert("동의가 접수되었습니다.");
      // 페이지 새로고침
      loadPetition();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "동의 처리에 실패했습니다.");
    } finally {
      setAgreeLoading(false);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!petitionId || !commentInput.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const r = await fetch(`/api/petitions/${petitionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentInput.trim() }),
      });
      const data = (await r.json()) as { comment?: Comment; error?: string };
      if (!r.ok || data.error) {
        throw new Error(data.error ?? "답변 작성에 실패했습니다.");
      }
      setCommentInput("");
      loadComments();
      loadPetition(); // 상태 업데이트를 위해
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "답변 작성에 실패했습니다.");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const closeDeleteModal = () => {
    setDeletePetitionId(null);
    setDeletePassword("");
    setDeleteSubmitting(false);
  };

  const handleDeletePetition = async (petitionId: string, password: string) => {
    if (!petitionId?.trim()) {
      setDeleteToast({ message: "삭제할 청원을 찾을 수 없습니다.", isError: true });
      setTimeout(() => setDeleteToast(null), 4000);
      return;
    }
    const trimmed = password.trim();
    if (!trimmed) {
      setDeleteToast({ message: "비밀번호를 입력해 주세요.", isError: true });
      setTimeout(() => setDeleteToast(null), 4000);
      return;
    }
    setDeleteSubmitting(true);
    try {
      const url = `/api/petitions/${petitionId}`;
      const r = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: trimmed }),
      });
      const raw = await r.text();
      let data: { ok?: boolean; error?: string } | null = null;
      try {
        data = raw ? (JSON.parse(raw) as { ok?: boolean; error?: string }) : null;
      } catch {
        // ignore
      }
      if (!r.ok) {
        const msg = data?.error ?? `청원 삭제에 실패했습니다. (${r.status})`;
        setDeleteToast({ message: msg, isError: true });
        setTimeout(() => setDeleteToast(null), 5000);
        setDeleteSubmitting(false);
        return;
      }
      if (data && data.ok === false) {
        const msg = data?.error ?? "청원 삭제에 실패했습니다.";
        setDeleteToast({ message: msg, isError: true });
        setTimeout(() => setDeleteToast(null), 5000);
        setDeleteSubmitting(false);
        return;
      }
      setDeleteToast({ message: "청원이 삭제되었습니다." });
      setTimeout(() => {
        setDeleteToast(null);
        router.push("/petitions");
      }, 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "청원 삭제에 실패했습니다.";
      setDeleteToast({ message: msg, isError: true });
      setTimeout(() => setDeleteToast(null), 5000);
      setDeleteSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-zinc-400">불러오는 중...</div>
      </div>
    );
  }

  if (error || !petition) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error ?? "청원을 찾을 수 없습니다."}</p>
          <Link
            href="/petitions"
            className="text-amber-500 hover:text-amber-400 transition"
          >
            ← 청원 목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* 삭제 결과 토스트 */}
      {deleteToast ? (
        <div
          role="alert"
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-5 py-3 rounded-xl text-sm font-bold shadow-lg max-w-[90vw] ${
            deleteToast.isError
              ? "bg-red-500/95 text-white border border-red-400"
              : "bg-amber-500 text-black border border-amber-400"
          }`}
        >
          {deleteToast.message}
        </div>
      ) : null}
      {/* 청원 삭제 비밀번호 모달 */}
      {deletePetitionId ? (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-950 border border-zinc-800 p-5 space-y-4">
            <h4 className="text-sm font-black text-zinc-100">청원 삭제</h4>
            <p className="text-xs text-zinc-400">
              청원 작성 시 설정한 삭제 비밀번호를 입력하세요.
            </p>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (deletePassword.trim()) handleDeletePetition(deletePetitionId, deletePassword);
                }
                if (e.key === "Escape") closeDeleteModal();
              }}
              placeholder="삭제 비밀번호"
              maxLength={20}
              autoComplete="current-password"
              disabled={deleteSubmitting}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 outline-none disabled:opacity-60"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteSubmitting}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => handleDeletePetition(deletePetitionId, deletePassword)}
                disabled={!deletePassword.trim() || deleteSubmitting}
                className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteSubmitting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* 네비게이션 */}
      <nav className="p-6 border-b border-zinc-900 flex justify-between items-center sticky top-0 bg-zinc-950/80 backdrop-blur-md z-50">
        <Link href="/" className="text-2xl font-black tracking-tighter text-amber-500 italic">
          GAEPAN
        </Link>
        <Link
          href="/petitions"
          className="text-sm font-bold text-zinc-400 hover:text-amber-500 transition"
        >
          ← 청원 목록
        </Link>
      </nav>

      <div className="max-w-4xl mx-auto py-12 px-6">
        {/* 청원 정보 헤더 */}
        <div
          className={`rounded-2xl border p-8 mb-6 ${
            petition.agree_count >= 50
              ? "border-amber-500/60 bg-amber-500/10 shadow-[0_0_30px_rgba(245,158,11,0.2)]"
              : "border-zinc-800 bg-zinc-900/80"
          }`}
        >
          <div className="mb-6">
            <div className="text-sm font-black tracking-widest uppercase text-amber-400 mb-2">
              청원 분야
            </div>
            <div className="text-3xl font-black text-zinc-100">{petition.category}</div>
          </div>
          <div className="mb-6">
            <div className="text-sm font-black tracking-widest uppercase text-amber-400 mb-2">
              청원인
            </div>
            <div className="text-xl font-bold text-zinc-300">익명의 배심원</div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-zinc-500">동의 수: </span>
              <span className="font-bold text-amber-400">{petition.agree_count}명</span>
            </div>
            <div>
              <span className="text-zinc-500">답변 달성률: </span>
              <span className="font-bold text-blue-400">{petition.progress}%</span>
            </div>
          </div>
        </div>

        {/* 청원 내용 */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 mb-6 relative">
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDeletePetitionId(petition.id)}
              className="px-2 py-1 text-xs font-bold text-red-400 hover:text-red-300 transition"
            >
              삭제
            </button>
          </div>
          <h2 className="text-2xl font-black text-zinc-100 mb-4 pr-16 line-clamp-1 min-w-0 break-words">{petition.title}</h2>
          <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{petition.content}</div>
        </div>

        {/* 동의하기 버튼 */}
        {petition.status === "ongoing" && (
          <div className="mb-8">
            <button
              onClick={handleAgree}
              disabled={petition.hasAgreed || agreeLoading}
              className={`w-full py-6 rounded-xl text-xl font-black transition ${
                petition.hasAgreed
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-amber-600 hover:bg-amber-500 text-black"
              }`}
            >
              {agreeLoading
                ? "처리 중..."
                : petition.hasAgreed
                ? "✓ 이미 동의하셨습니다"
                : "동의하기"}
            </button>
          </div>
        )}

        {/* 대법관 답변 작성 폼 */}
        {isOperatorLoggedIn && petition.status === "ongoing" && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 mb-8">
            <h3 className="text-lg font-black text-amber-300 mb-4">⚖️ 대법관 답변 작성</h3>
            <form onSubmit={handleSubmitComment} className="space-y-4">
              <textarea
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder="청원에 대한 답변을 작성해주세요"
                rows={6}
                className="w-full rounded-xl border border-amber-500/30 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition resize-y"
                required
                maxLength={2000}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">{commentInput.length}/2000</span>
                <button
                  type="submit"
                  disabled={!commentInput.trim() || commentSubmitting}
                  className="rounded-xl bg-amber-600 hover:bg-amber-500 text-black px-6 py-2 text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {commentSubmitting ? "작성 중..." : "답변 작성"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 대법관 답변 */}
        {comments.length > 0 && (
          <div className="space-y-4 mb-8">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className={`rounded-xl border p-6 ${
                  comment.is_operator
                    ? "border-amber-500/50 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.15)]"
                    : "border-zinc-800 bg-zinc-900/80"
                }`}
              >
                {comment.is_operator ? (
                  <div className="mb-3">
                    <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/30 px-3 py-1 text-sm font-black text-amber-200 border border-amber-500/50">
                      ⚖️ 대법관의 답변
                    </span>
                  </div>
                ) : null}
                <div className={`text-zinc-200 leading-relaxed whitespace-pre-wrap ${
                  comment.is_operator ? "font-semibold" : ""
                }`}>
                  {comment.content}
                </div>
                {comment.created_at ? (
                  <div className="mt-3 text-xs text-zinc-500">
                    {new Date(comment.created_at).toLocaleString("ko-KR")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* 답변 완료 상태 */}
        {petition.status === "completed" && comments.length === 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center">
            <p className="text-amber-300 font-bold">답변이 완료되었습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
