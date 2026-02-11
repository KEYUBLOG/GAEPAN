/**
 * 국가법령정보센터(law.go.kr) 판례 검색 API 연동
 * - 사용 전 open.law.go.kr 에서 API 신청 후 OC(이메일 ID) 발급 필요
 * - env: LAW_GO_KR_OC
 */

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawSearch.do";

function extractKeywords(title: string, details: string): string {
  const t = (title || "").trim();
  const d = (details || "").trim().slice(0, 200);
  const combined = `${t} ${d}`.replace(/\s+/g, " ").trim();
  if (combined.length > 80) return combined.slice(0, 80);
  return combined || "판례";
}

/**
 * 판례 목록 조회. OC 미설정 또는 API 오류 시 null 반환.
 */
export async function searchPrecedents(
  title: string,
  details: string,
  limit = 10
): Promise<string | null> {
  const oc = process.env.LAW_GO_KR_OC?.trim();
  if (!oc || typeof window !== "undefined") return null;

  const query = encodeURIComponent(extractKeywords(title, details));
  const url = `${LAW_API_BASE}?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&query=${query}&org=400201&display=${Math.min(limit, 20)}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const raw = await res.text();
    if (!raw?.trim()) return null;

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }

    const rawItems =
      (data as Record<string, unknown>)?.prec ??
      (data as Record<string, unknown>)?.Prec ??
      (data as Record<string, unknown>)?.판례 ??
      (Array.isArray(data) ? data : null);
    const items: unknown[] = Array.isArray(rawItems) ? rawItems : [];
    if (items.length === 0) return null;

    const lines = items.slice(0, limit).map((p, i) => {
      const num = i + 1;
      const row = p as Record<string, unknown>;
      const name = String(row?.사건명 ?? row?.caseNm ?? "-");
      const no = String(row?.사건번호 ?? row?.caseNo ?? "");
      const date = String(row?.선고일자 ?? row?.선고일 ?? row?.jugdDe ?? "");
      const court = String(row?.법원명 ?? row?.courtNm ?? "");
      return `${num}. ${name} (${court} ${date} 선고 ${no})`;
    });

    return `---참조 판례 (국가법령정보센터 실시간 검색) ---\n${lines.join("\n")}\n---위 판례를 인용·적용하여 rationale에 논증하라---`;
  } catch {
    return null;
  }
}
