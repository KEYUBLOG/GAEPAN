"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/** 빈 응답/잘못된 JSON으로 인한 JSON.parse 오류 방지 */
async function safeJsonFromResponse<T = object>(r: Response): Promise<T> {
  const text = await r.text();
  if (!text || !text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isBlockedOpen, setIsBlockedOpen] = useState(false);
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
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<Array<{
    ip_address: string;
    created_at: string;
    posts: { id: string; title: string | null; created_at: string | null }[];
  }>>([]);
  const [blockedKeywords, setBlockedKeywords] = useState<Array<{ id: string; keyword: string; created_at: string }>>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [keywordLoading, setKeywordLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 세션 확인
    fetch("/api/admin/check")
      .then((r) => safeJsonFromResponse<{ loggedIn?: boolean }>(r))
      .then((data) => {
        setIsLoggedIn(data.loggedIn === true);
        setChecking(false);
      })
      .catch(() => {
        setChecking(false);
      });
  }, []);

  useEffect(() => {
    if (isLoggedIn) loadBlockedKeywords();
  }, [isLoggedIn]);

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
      const data = await safeJsonFromResponse<{ success?: boolean; error?: string }>(r);
      if (!r.ok || !data.success) {
        throw new Error(data.error ?? "로그인 실패");
      }
      // 로그인 성공 후 세션 확인
      const checkRes = await fetch("/api/admin/check");
      const checkData = await safeJsonFromResponse<{ loggedIn?: boolean }>(checkRes);
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
    if (isMobilePreviewOpen || isReportsOpen || isBlockedOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobilePreviewOpen, isReportsOpen, isBlockedOpen]);

  const loadReports = async () => {
    setReportsLoading(true);
    try {
      const r = await fetch("/api/admin/reports");
      const data = await safeJsonFromResponse<{ reports?: typeof reports; error?: string }>(r);
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

  const loadBlockedUsers = async () => {
    setBlockedLoading(true);
    try {
      const r = await fetch("/api/admin/blocked");
      const data = await safeJsonFromResponse<{
        blocked?: typeof blockedUsers;
        error?: string;
      }>(r);
      if (r.ok && data.blocked) {
        setBlockedUsers(data.blocked);
        setIsBlockedOpen(true);
      } else {
        alert(data.error ?? "차단된 사용자 목록을 불러오지 못했습니다.");
      }
    } catch (err) {
      console.error("차단된 사용자 목록 조회 실패:", err);
      alert("차단된 사용자 목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setBlockedLoading(false);
    }
  };

  const unblockUser = async (ip: string) => {
    if (!confirm(`IP ${ip} 사용자를 차단 해제하시겠습니까?`)) return;
    try {
      const r = await fetch("/api/admin/blocked", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip_address: ip }),
      });
      const data = (await r.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!r.ok || !data?.success) {
        alert(data?.error ?? "차단 해제에 실패했습니다.");
        return;
      }
      setBlockedUsers((prev) => prev.filter((b) => b.ip_address !== ip));
    } catch (err) {
      console.error("차단 해제 실패:", err);
      alert("차단 해제 중 오류가 발생했습니다.");
    }
  };

  const loadBlockedKeywords = async () => {
    setKeywordLoading(true);
    try {
      const r = await fetch("/api/admin/blocked-keywords");
      const data = await safeJsonFromResponse<{ keywords?: typeof blockedKeywords; error?: string }>(r);
      if (r.ok && data.keywords) {
        setBlockedKeywords(data.keywords);
      } else {
        alert(data?.error ?? "키워드 목록을 불러오지 못했습니다.");
      }
    } catch (err) {
      console.error("키워드 목록 조회 실패:", err);
      alert("키워드 목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setKeywordLoading(false);
    }
  };

  const addBlockedKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    const kw = keywordInput.trim();
    if (!kw || keywordLoading) return;
    setKeywordLoading(true);
    try {
      const r = await fetch("/api/admin/blocked-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw }),
      });
      const data = await safeJsonFromResponse<{ keyword?: { id: string; keyword: string; created_at: string }; error?: string }>(r);
      if (r.ok && data.keyword) {
        setBlockedKeywords((prev) => [...prev, data.keyword!].sort((a, b) => a.keyword.localeCompare(b.keyword)));
        setKeywordInput("");
      } else {
        alert(data?.error ?? "키워드 추가에 실패했습니다.");
      }
    } catch (err) {
      console.error("키워드 추가 실패:", err);
      alert("키워드 추가 중 오류가 발생했습니다.");
    } finally {
      setKeywordLoading(false);
    }
  };

  const removeBlockedKeyword = async (keyword: string) => {
    if (!confirm(`"${keyword}" 차단을 해제하시겠습니까?`)) return;
    try {
      const r = await fetch("/api/admin/blocked-keywords", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      const data = await safeJsonFromResponse<{ ok?: boolean; error?: string }>(r);
      if (r.ok && data.ok) {
        setBlockedKeywords((prev) => prev.filter((k) => k.keyword !== keyword));
      } else {
        alert(data?.error ?? "키워드 삭제에 실패했습니다.");
      }
    } catch (err) {
      console.error("키워드 삭제 실패:", err);
      alert("키워드 삭제 중 오류가 발생했습니다.");
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">확인 중...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
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
    <div className="min-h-screen bg-zinc-950 py-12 px-4">
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
            <button
              onClick={loadBlockedUsers}
              disabled={blockedLoading}
              className="w-full rounded-xl border border-amber-500/50 bg-amber-500/15 px-6 py-3 text-sm font-bold text-amber-400 hover:bg-amber-500/30 transition flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
            >
              <span>🚫</span>
              <span>{blockedLoading ? "불러오는 중..." : "차단된 사용자 확인하기"}</span>
            </button>
            <p className="text-xs text-zinc-500 mt-2">
              차단된 사용자의 IP와 작성한 글을 확인하고 차단을 해제할 수 있습니다.
            </p>
            <div className="mt-6 pt-6 border-t border-zinc-800">
              <h3 className="text-base font-bold text-zinc-200 mb-3">🔑 키워드 차단</h3>
              <p className="text-xs text-zinc-500 mb-3">
                등록한 키워드가 포함된 글·댓글은 작성할 수 없고, 이미 작성된 글·댓글은 표시 시 ***로 마스킹됩니다.
              </p>
              <form onSubmit={addBlockedKeyword} className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  placeholder="차단할 키워드 입력"
                  className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-amber-500/60"
                  disabled={keywordLoading}
                />
                <button
                  type="submit"
                  disabled={!keywordInput.trim() || keywordLoading}
                  className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  추가
                </button>
              </form>
              <button
                type="button"
                onClick={loadBlockedKeywords}
                disabled={keywordLoading}
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-700 transition disabled:opacity-50 mb-3"
              >
                {keywordLoading ? "불러오는 중..." : "차단 키워드 목록 새로고침"}
              </button>
              {blockedKeywords.length > 0 ? (
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                  {blockedKeywords.map((k) => (
                    <li key={k.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm">
                      <span className="text-zinc-200 font-medium">{k.keyword}</span>
                      <button
                        type="button"
                        onClick={() => removeBlockedKeyword(k.keyword)}
                        className="text-red-400 hover:text-red-300 text-xs font-bold"
                      >
                        삭제
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-zinc-500">등록된 차단 키워드가 없습니다. 위에서 추가 후 목록 새로고침을 누르세요.</p>
              )}
            </div>
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
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
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
                        <span className="text-xs text-zinc-500">
                          {new Date(report.created_at).toLocaleString("ko-KR")}
                        </span>
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
                              <a
                                href={`/?post=${report.target_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block text-xs text-amber-400 hover:text-amber-300 transition"
                              >
                                게시글 보기 →
                              </a>
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
                                <a
                                  href={`/?post=${report.target.post_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block text-xs text-amber-400 hover:text-amber-300 transition"
                                >
                                  게시글 보기 →
                                </a>
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

      {/* 차단된 사용자 모달 */}
      {isBlockedOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl flex flex-col">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-amber-400 mb-1">🚫 차단된 사용자</h2>
                <p className="text-sm text-zinc-500">
                  총 {blockedUsers.length}개의 IP가 차단되어 있습니다.
                </p>
              </div>
              <button
                onClick={() => setIsBlockedOpen(false)}
                className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-black text-zinc-200 hover:bg-zinc-800 transition"
              >
                닫기
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {blockedUsers.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-sm">
                  차단된 사용자가 없습니다.
                </div>
              ) : (
                <div className="space-y-4">
                  {blockedUsers.map((b) => (
                    <div
                      key={b.ip_address}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="text-sm font-bold text-amber-300">
                            IP: <span className="font-mono">{b.ip_address}</span>
                          </div>
                          <div className="text-xs text-zinc-500">
                            차단 시각:{" "}
                            {new Date(b.created_at).toLocaleString("ko-KR")}
                          </div>
                          <div className="text-xs text-zinc-500">
                            작성한 글: {b.posts.length}건 (최근 5개 기준)
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => unblockUser(b.ip_address)}
                          className="shrink-0 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-bold text-zinc-200 hover:bg-zinc-800 transition"
                        >
                          차단 해제
                        </button>
                      </div>
                      {b.posts.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {b.posts.map((p) => (
                            <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                              <div className="flex-1 min-w-0">
                                <div className="text-zinc-200 truncate">
                                  {p.title || "(제목 없음)"}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                  {p.created_at
                                    ? new Date(p.created_at).toLocaleString("ko-KR")
                                    : ""}
                                </div>
                              </div>
                              <a
                                href={`/?post=${p.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 text-[11px] text-amber-400 hover:text-amber-300"
                              >
                                글 보기 →
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : null}
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
            <div className="relative w-[375px] h-[812px] bg-zinc-900 rounded-[3rem] p-2 shadow-2xl border-8 border-zinc-800 overflow-hidden">
              {/* 상단 노치 시뮬레이션 */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[30px] bg-black rounded-b-3xl z-10 pointer-events-none"></div>
              
              {/* iframe */}
              <div className="w-full h-full rounded-[2.5rem] border-0 bg-white overflow-hidden">
                <iframe
                  src="/?mobile_preview=true"
                  className="w-full h-full border-0"
                  style={{
                    width: "100%",
                    height: "100%",
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
