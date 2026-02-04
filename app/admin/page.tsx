"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [reports, setReports] = useState<Array<{
    id: string;
    target_type: "post" | "comment";
    target_id: string;
    reason: string | null;
    created_at: string;
    target?: {
      id: string;
      title?: string;
      content?: string;
      created_at?: string;
      author_id?: string | null;
    } | null;
    post_title?: string | null;
  }>>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const router = useRouter();

  const handleConfirmReport = async (reportId: string) => {
    setConfirmingId(reportId);
    try {
      const r = await fetch(`/api/admin/reports/${reportId}`, { method: "DELETE" });
      const data = (await r.json()) as { ok?: boolean; error?: string };
      if (r.ok && data.ok) {
        setReports((prev) => prev.filter((r) => r.id !== reportId));
      } else {
        alert(data.error ?? "확인완료 처리에 실패했습니다.");
      }
    } catch (err) {
      alert("요청 중 오류가 발생했습니다.");
      console.error(err);
    } finally {
      setConfirmingId(null);
    }
  };

  useEffect(() => {
    // 세션 확인
    fetch("/api/admin/check")
      .then((r) => r.json())
      .then((data: { loggedIn?: boolean }) => {
        setIsLoggedIn(data.loggedIn === true);
        setChecking(false);
      })
      .catch(() => {
        setChecking(false);
      });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });
      const data = (await r.json()) as { success?: boolean; error?: string };
      if (!r.ok || !data.success) {
        throw new Error(data.error ?? "로그인 실패");
      }
      // 로그인 성공 후 세션 확인
      const checkRes = await fetch("/api/admin/check");
      const checkData = (await checkRes.json()) as { loggedIn?: boolean };
      setIsLoggedIn(checkData.loggedIn === true);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      setIsLoggedIn(false);
    } catch (err) {
      console.error("로그아웃 실패:", err);
    }
  };

  useEffect(() => {
    if (isMobilePreviewOpen || isReportsOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobilePreviewOpen, isReportsOpen]);

  const loadReports = async () => {
    setReportsLoading(true);
    try {
      const r = await fetch("/api/admin/reports");
      const data = (await r.json()) as { reports?: typeof reports; error?: string };
      if (r.ok && data.reports) {
        setReports(data.reports);
        setIsReportsOpen(true);
      } else {
        alert(data.error ?? "신고 목록을 불러오지 못했습니다.");
      }
    } catch (err) {
      alert("신고 목록을 불러오는 중 오류가 발생했습니다.");
      console.error(err);
    } finally {
      setReportsLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-zinc-400">확인 중...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-black text-amber-400 mb-2">⚖️ 대법관 로그인</h1>
              <p className="text-sm text-zinc-500">대법관 전용 페이지입니다</p>
            </div>
            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-black tracking-widest uppercase text-zinc-400 mb-2">
                  비밀번호
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="대법관 비밀번호를 입력하세요"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/10 transition"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={!password.trim() || isLoading}
                className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-black hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "로그인 중..." : "로그인"}
              </button>
            </form>
            <div className="pt-4 border-t border-zinc-800">
              <button
                onClick={() => router.push("/")}
                className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition"
              >
                ← 메인으로 돌아가기
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-amber-400 mb-1">⚖️ 대법관 페이지</h1>
              <p className="text-sm text-zinc-500">로그인되어 있습니다</p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-xl bg-red-600 hover:bg-red-500 px-6 py-3 text-sm font-bold text-white transition whitespace-nowrap"
            >
              로그아웃
            </button>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-200 mb-4">대법관 기능</h2>
            <div className="space-y-3 text-sm text-zinc-400">
              <p>• 대법관으로 로그인한 상태에서 작성한 댓글은 대법관 댓글로 표시됩니다.</p>
              <p>• 대법관 댓글은 특별한 스타일로 강조되어 표시됩니다.</p>
              <p>• 로그아웃하면 일반 사용자로 전환됩니다.</p>
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-200 mb-4">관리 기능</h2>
            <button
              onClick={loadReports}
              disabled={reportsLoading}
              className="w-full rounded-xl border border-red-500/50 bg-red-500/20 px-6 py-3 text-sm font-bold text-red-400 hover:bg-red-500/30 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>🚨</span>
              <span>{reportsLoading ? "불러오는 중..." : "신고된 글 확인하기"}</span>
            </button>
            <p className="text-xs text-zinc-500 mt-2">
              신고된 게시글과 댓글을 확인할 수 있습니다.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-200 mb-4">개발 도구</h2>
            <button
              onClick={() => setIsMobilePreviewOpen(true)}
              className="w-full rounded-xl border border-amber-500/50 bg-amber-500/20 px-6 py-3 text-sm font-bold text-amber-400 hover:bg-amber-500/30 transition flex items-center justify-center gap-2"
            >
              <span>📱</span>
              <span>모바일 화면 미리보기</span>
            </button>
            <p className="text-xs text-zinc-500 mt-2">
              모바일 화면 크기(375x812)로 메인 페이지를 미리봅니다.
            </p>
          </div>
          <div className="pt-4 border-t border-zinc-800">
            <button
              onClick={() => router.push("/")}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-bold text-zinc-200 hover:bg-zinc-800 transition"
            >
              메인으로 돌아가기
            </button>
          </div>
        </div>
      </div>

      {/* 신고된 글 확인 모달 */}
      {isReportsOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl flex flex-col">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-red-400 mb-1">🚨 신고된 글</h2>
                <p className="text-sm text-zinc-500">총 {reports.length}건의 신고</p>
              </div>
              <button
                onClick={() => setIsReportsOpen(false)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-black text-zinc-200 hover:bg-zinc-800 transition"
              >
                닫기
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {reports.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  신고된 글이 없습니다.
                </div>
              ) : (
                <div className="space-y-4">
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-1 rounded text-xs font-bold ${
                              report.target_type === "post"
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            }`}
                          >
                            {report.target_type === "post" ? "게시글" : "댓글"}
                          </span>
                          {report.reason && (
                            <span className="text-xs text-zinc-400">사유: {report.reason}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-500">
                            {new Date(report.created_at).toLocaleString("ko-KR")}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleConfirmReport(report.id)}
                            disabled={confirmingId === report.id}
                            className="rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-400 hover:bg-amber-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {confirmingId === report.id ? "처리 중..." : "확인완료"}
                          </button>
                        </div>
                      </div>
                      {report.target ? (
                        <div className="space-y-2">
                          {report.target_type === "post" ? (
                            <>
                              <div className="text-sm font-bold text-zinc-200">
                                제목: {report.target.title || "(제목 없음)"}
                              </div>
                              <div className="text-xs text-zinc-400 line-clamp-3">
                                {report.target.content || "(내용 없음)"}
                              </div>
                              <Link
                                href={`/?post=${report.target_id}`}
                                onClick={() => setIsReportsOpen(false)}
                                className="inline-block text-xs text-amber-400 hover:text-amber-300 transition"
                              >
                                게시글 보기 →
                              </Link>
                            </>
                          ) : (
                            <>
                              <div className="text-sm font-bold text-zinc-200">
                                {report.post_title ? `게시글: ${report.post_title}` : "댓글"}
                              </div>
                              <div className="text-xs text-zinc-400 line-clamp-2">
                                {report.target?.content || "(내용 없음)"}
                              </div>
                              {report.target && "post_id" in report.target && report.target.post_id && (
                                <Link
                                  href={`/?post=${(report.target as { post_id?: string }).post_id}`}
                                  onClick={() => setIsReportsOpen(false)}
                                  className="inline-block text-xs text-amber-400 hover:text-amber-300 transition"
                                >
                                  게시글 보기 →
                                </Link>
                              )}
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500">삭제된 항목입니다.</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* 모바일 미리보기 모달 */}
      {isMobilePreviewOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-[400px] flex flex-col items-center">
            {/* 모바일 프레임 */}
            <div className="relative w-full max-w-[375px] aspect-[375/812] bg-zinc-900 rounded-[3rem] p-2 shadow-2xl border-8 border-zinc-800 overflow-hidden">
              {/* 상단 노치 시뮬레이션 */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[30px] bg-black rounded-b-3xl z-10 pointer-events-none"></div>
              
              {/* iframe */}
              <div className="w-full h-full rounded-[2.5rem] border-0 bg-white overflow-hidden">
                <iframe
                  src="/"
                  className="w-full h-full border-0"
                  style={{
                    pointerEvents: "auto",
                  }}
                  title="모바일 미리보기"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                />
              </div>
            </div>
            
            {/* 닫기 버튼 */}
            <button
              onClick={() => setIsMobilePreviewOpen(false)}
              className="mt-6 rounded-xl bg-red-600 hover:bg-red-500 px-6 py-3 text-sm font-bold text-white transition"
            >
              닫기
            </button>
            <p className="mt-2 text-xs text-zinc-500 text-center">
              모바일 화면 크기: 375x812px (iPhone 기본 크기)
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
