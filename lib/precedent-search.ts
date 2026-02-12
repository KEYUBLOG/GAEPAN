/**
 * 국가법령정보센터(law.go.kr) 판례 검색 API 연동
 * - 사용 전 open.law.go.kr 에서 API 신청 후 OC(이메일 ID) 발급 필요
 * - env: LAW_GO_KR_OC
 * - org=400201: 대법원 판례만 조회
 */

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawSearch.do";
/** 대법원 판례만 검색 (org: 400201) */
const ORG_SUPREME_COURT = "400201";

function extractKeywords(title: string, details: string, maxDetailChars = 350): string {
  const t = (title || "").trim();
  const d = (details || "").trim().slice(0, maxDetailChars);
  const combined = `${t} ${d}`.replace(/\s+/g, " ").trim();
  if (combined.length > 100) return combined.slice(0, 100);
  return combined || "판례";
}

/**
 * 판례 검색에 쓸 쿼리 문자열 결정.
 * queryOverride가 있으면 그걸 정규화해서 쓰고, 없으면 제목+경위에서 추출.
 */
function getQueryString(title: string, details: string, queryOverride?: string | null): string {
  if (queryOverride && queryOverride.trim()) {
    const oneLine = queryOverride.trim().replace(/\s+/g, " ").slice(0, 100);
    return oneLine || extractKeywords(title, details);
  }
  return extractKeywords(title, details);
}

/**
 * 판례 목록 조회. OC 미설정 또는 API 오류 시 null 반환.
 * @param queryOverride - 사건 본문 분석으로 얻은 검색 키워드(있으면 이걸로 검색, 없으면 제목+경위에서 추출)
 */
export async function searchPrecedents(
  title: string,
  details: string,
  limit = 10,
  queryOverride?: string | null
): Promise<string | null> {
  const oc = process.env.LAW_GO_KR_OC?.trim();
  if (!oc || typeof window !== "undefined") return null;

  const queryString = getQueryString(title, details, queryOverride);
  const query = encodeURIComponent(queryString);
  /** search=2: 본문 검색(판례 내용까지 검색) → 대법원 판례를 확실히 찾기 위해 본문 검색 */
  const search = 2;
  const url = `${LAW_API_BASE}?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&query=${query}&search=${search}&org=${ORG_SUPREME_COURT}&display=${Math.min(Math.max(limit, 15), 20)}`;

  try {
    let res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;

    let raw = await res.text();
    if (!raw?.trim()) return null;

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }

    let rawItems =
      (data as Record<string, unknown>)?.prec ??
      (data as Record<string, unknown>)?.Prec ??
      (data as Record<string, unknown>)?.판례 ??
      (Array.isArray(data) ? data : null);
    let rawList: unknown[] = Array.isArray(rawItems) ? rawItems : [];

    // AI 키워드로 검색했는데 결과 없으면: 제목 + 경위 앞부분으로 재검색(대법원 판례 확보용)
    if (rawList.length === 0 && queryOverride?.trim()) {
      const fallbackQuery = getQueryString(title, details, null);
      if (fallbackQuery !== queryString) {
        const fallbackUrl = `${LAW_API_BASE}?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&query=${encodeURIComponent(fallbackQuery)}&search=${search}&org=${ORG_SUPREME_COURT}&display=20`;
        const res2 = await fetch(fallbackUrl, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (res2.ok) {
          const raw2 = await res2.text();
          if (raw2?.trim()) {
            try {
              data = JSON.parse(raw2);
              rawItems =
                (data as Record<string, unknown>)?.prec ??
                (data as Record<string, unknown>)?.Prec ??
                (data as Record<string, unknown>)?.판례 ??
                (Array.isArray(data) ? data : null);
              rawList = Array.isArray(rawItems) ? rawItems : [];
            } catch {
              // keep rawList as is (empty)
            }
          }
        }
      }
    }

    if (rawList.length === 0) return null;

    // 확실한 정보만 사용: 사건명이 있고, 사건번호 또는 선고일자·법원명 중 하나라도 있는 항목만 포함
    const validRows: { name: string; no: string; date: string; court: string }[] = [];
    for (const p of rawList) {
      const row = p as Record<string, unknown>;
      const name = String(row?.사건명 ?? row?.caseNm ?? "").trim();
      const no = String(row?.사건번호 ?? row?.caseNo ?? "").trim();
      const date = String(row?.선고일자 ?? row?.선고일 ?? row?.jugdDe ?? "").trim();
      const court = String(row?.법원명 ?? row?.courtNm ?? "").trim();
      const hasName = name.length > 0 && name !== "-";
      const hasIdentifier = no.length > 0 || date.length > 0 || court.length > 0;
      if (hasName && hasIdentifier) {
        validRows.push({ name, no, date, court });
      }
    }
    if (validRows.length === 0) return null;

    const lines = validRows.slice(0, limit).map((r, i) => {
      const num = i + 1;
      return `${num}. ${r.name} (${r.court} ${r.date} 선고 ${r.no})`;
    });

    return `---참조 판례 (국가법령정보센터 실시간 검색) ---\n${lines.join("\n")}\n---위 판례를 인용·적용하여 rationale에 논증하라---`;
  } catch {
    return null;
  }
}
