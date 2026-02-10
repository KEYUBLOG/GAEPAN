"use client";

import { useState, useEffect, useCallback } from "react";
import { maskBlockedKeywords } from "./blocked-keywords";

export function useBlockedKeywords(): { mask: (text: string) => string; keywords: string[] } {
  const [keywords, setKeywords] = useState<string[]>([]);

  // 초기 로딩 경쟁 완화: 첫 페인트 후 지연 요청
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/blocked-keywords")
        .then((r) => r.json().catch(() => ({ keywords: [] })))
        .then((data: { keywords?: string[] }) => {
          setKeywords(Array.isArray(data.keywords) ? data.keywords : []);
        })
        .catch(() => setKeywords([]));
    }, 600);
    return () => clearTimeout(t);
  }, []);

  const mask = useCallback(
    (text: string) => {
      if (!text) return text;
      return maskBlockedKeywords(text, keywords);
    },
    [keywords],
  );

  return { mask, keywords };
}
