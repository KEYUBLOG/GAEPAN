/**
 * 국가법령정보센터(law.go.kr) 판례 검색 API 연동
 *
 * 【판례 검색 조건 — 이걸 만족해야 선고문에 판례 반영됨】
 * 1. 환경 변수 LAW_GO_KR_OC가 설정되어 있어야 함 (open.law.go.kr에서 발급한 OC).
 * 2. 서버에서만 동작 (브라우저에서는 호출 안 함).
 * 3. API 호출 성공 + 응답에 prec/Prec/판례/precList 중 하나로 판례 배열이 와야 함.
 * 4. 각 항목에 사건명 + (사건번호 또는 선고일자 또는 법원명) 중 하나 이상 있어야 유효 행으로 인정.
 *
 * 위 조건 중 하나라도 불만족 시 null 반환 → Judge는 "참조 판례 미제공"으로 진행.
 */

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawSearch.do";
const LAW_SERVICE_BASE = "https://www.law.go.kr/DRF/lawService.do";
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

/** API 응답에서 판례 배열 추출 */
function parsePrecList(data: unknown): unknown[] {
  const rawItems =
    (data as Record<string, unknown>)?.prec ??
    (data as Record<string, unknown>)?.Prec ??
    (data as Record<string, unknown>)?.판례 ??
    (data as Record<string, unknown>)?.precList ??
    (Array.isArray(data) ? data : null);
  return Array.isArray(rawItems) ? rawItems : [];
}

type PrecRow = { name: string; no: string; date: string; court: string; id?: string };

/** 한 건의 판례에서 사건명·번호·일자·법원·일련번호 추출 (상세 API 호출용) */
function toRow(p: unknown): PrecRow | null {
  const row = p as Record<string, unknown>;
  const name = String(row?.사건명 ?? row?.caseNm ?? "").trim();
  const no = String(row?.사건번호 ?? row?.caseNo ?? "").trim();
  const date = String(row?.선고일자 ?? row?.선고일 ?? row?.jugdDe ?? "").trim();
  const court = String(row?.법원명 ?? row?.courtNm ?? "").trim();
  const idRaw = row?.판례정보일련번호 ?? row?.precSeq ?? row?.ID ?? row?.id;
  const id = idRaw != null ? String(idRaw).trim() : undefined;
  const hasName = name.length > 0 && name !== "-";
  const hasIdentifier = no.length > 0 || date.length > 0 || court.length > 0;
  if (hasName && hasIdentifier) return { name, no, date, court, id: id || undefined };
  return null;
}

/** 대법원 판례 사건명에 자주 나오는 단일 검색어 — 0건일 때 이걸로 한 번씩 더 검색 */
const SINGLE_WORD_QUERIES = [
  "사기",
  "배임",
  "횡령",
  "상해",
  "과실치사",
  "명예훼손",
  "모욕",
  "손해배상",
  "협박",
  "폭행",
  "절도",
  "강도",
  "살인",
  "교통사고",
  "업무상과실",
  "부작위",
  "정당방위",
  "공동정범",
  "불법행위",
  "탈영",
  "군무이탈",
];

/**
 * 판례 상세 API로 판시사항·판결요지 조회. 실패 시 null.
 */
async function fetchPrecedentDetail(precId: string): Promise<{ 판시사항?: string; 판결요지?: string; 판례내용?: string } | null> {
  const oc = process.env.LAW_GO_KR_OC?.trim();
  if (!oc) return null;
  const url = `${LAW_SERVICE_BASE}?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&ID=${encodeURIComponent(precId)}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const raw = await res.text();
    if (!raw?.trim()) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    const 판시사항 = typeof data?.판시사항 === "string" ? data.판시사항.trim() : undefined;
    const 판결요지 = typeof data?.판결요지 === "string" ? data.판결요지.trim() : undefined;
    const 판례내용 = typeof data?.판례내용 === "string" ? data.판례내용.trim() : undefined;
    if (판시사항 || 판결요지 || 판례내용) return { 판시사항, 판결요지, 판례내용 };
    return null;
  } catch {
    return null;
  }
}

/** 텍스트에서 SINGLE_WORD_QUERIES 중 포함된 것 최대 3개 반환 (0건 시 단일어 검색용) */
function pickSingleWordsFromText(text: string): string[] {
  const t = (text || "").trim();
  if (!t) return [];
  const out: string[] = [];
  for (const w of SINGLE_WORD_QUERIES) {
    if (t.includes(w)) {
      out.push(w);
      if (out.length >= 3) break;
    }
  }
  return out;
}

export type SearchPrecedentsOptions = {
  /** 학습된 우선 키워드 (이전에 단일어 검색 성공한 것) */
  preferredSingleWords?: string[];
  /** 단일어 검색으로 판례를 찾았을 때 호출 (자동 학습용) */
  onSingleWordSuccess?: (keyword: string) => void;
};

/**
 * 판례 목록 조회. OC 미설정 또는 API 오류 시 null 반환.
 * 사건명 검색(search=1) + 본문 검색(search=2) 둘 다 수행해 결과를 합치고, 중복 제거 후 반환.
 * @param queryOverride - 사건 본문 분석으로 얻은 검색 키워드(있으면 이걸로 검색, 없으면 제목+경위에서 추출)
 * @param options - preferredSingleWords: 학습된 키워드 우선 시도, onSingleWordSuccess: 단일어 성공 시 콜백(학습)
 */
export async function searchPrecedents(
  title: string,
  details: string,
  limit = 10,
  queryOverride?: string | null,
  options?: SearchPrecedentsOptions | null
): Promise<string | null> {
  const oc = process.env.LAW_GO_KR_OC?.trim();
  if (typeof window !== "undefined") return null;
  if (!oc) {
    console.log("[GAEPAN][판례] 검색 스킵: LAW_GO_KR_OC 미설정. Vercel/서버에 LAW_GO_KR_OC 환경 변수를 추가한 뒤 재배포하세요.");
    return null;
  }

  const display = Math.min(Math.max(limit, 15), 20);
  const seen = new Set<string>();
  const validRows: PrecRow[] = [];
  let singleWordsTried: string[] = [];
  const onSingleWordSuccess = options?.onSingleWordSuccess;

  const runSearch = async (queryStr: string, search: 1 | 2): Promise<void> => {
    const query = encodeURIComponent(queryStr);
    const url = `${LAW_API_BASE}?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&query=${query}&search=${search}&org=${ORG_SUPREME_COURT}&display=${display}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return;
      const raw = await res.text();
      if (!raw?.trim()) return;
      const data = JSON.parse(raw) as unknown;
      for (const p of parsePrecList(data)) {
        const row = toRow(p);
        if (!row) continue;
        const key = row.no || `${row.name}|${row.date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        validRows.push(row);
      }
    } catch {
      // ignore
    }
  };

  try {
    const queryString = getQueryString(title, details, queryOverride);
    const queryShort = queryString.slice(0, 60).trim();

    await runSearch(queryShort, 1);
    await runSearch(queryShort, 2);

    if (validRows.length === 0) {
      const fallbackQuery = getQueryString(title, details, null);
      if (fallbackQuery !== queryString) {
        await runSearch(fallbackQuery.slice(0, 80), 1);
        await runSearch(fallbackQuery.slice(0, 80), 2);
      }
    }

    if (validRows.length === 0) {
      const combined = `${queryString} ${title} ${(details || "").slice(0, 200)}`;
      const fromText = pickSingleWordsFromText(combined);
      const preferred = options?.preferredSingleWords ?? [];
      singleWordsTried = [...new Set([...preferred, ...fromText])];
      for (const w of singleWordsTried) {
        const before = validRows.length;
        await runSearch(w, 1);
        await runSearch(w, 2);
        if (validRows.length > before && onSingleWordSuccess) onSingleWordSuccess(w);
        if (validRows.length >= limit) break;
      }
    }

    if (validRows.length === 0) {
      console.log("[GAEPAN][판례] 검색 결과 0건. 쿼리:", queryShort.slice(0, 60), "단일어 시도:", singleWordsTried);
      return null;
    }

    const rowsToShow = validRows.slice(0, limit);
    const detailCount = 2;
    const rowsWithDetail = rowsToShow.filter((r) => r.id).slice(0, detailCount);
    const detailTexts: string[] = [];
    for (const r of rowsWithDetail) {
      if (!r.id) continue;
      const detail = await fetchPrecedentDetail(r.id);
      if (!detail) continue;
      const parts: string[] = [];
      if (detail.판시사항) parts.push(`[판시사항] ${detail.판시사항.slice(0, 1200)}`);
      if (detail.판결요지) parts.push(`[판결요지] ${detail.판결요지.slice(0, 1200)}`);
      if (parts.length === 0 && detail.판례내용) parts.push(`[요지] ${detail.판례내용.slice(0, 1200)}`);
      if (parts.length) detailTexts.push(`${r.name}\n${parts.join("\n")}`);
    }

    const lines = rowsToShow.map((r, i) => {
      const num = i + 1;
      return `${num}. ${r.name} (${r.court} ${r.date} 선고 ${r.no})`;
    });
    let block = `---참조 판례 (국가법령정보센터 법령 API 실시간 검색) ---\n${lines.join("\n")}`;
    if (detailTexts.length > 0) {
      block += `\n\n---아래 판례 요지(상세) ---\n${detailTexts.join("\n\n")}`;
    }
    block += `\n---위 판례를 인용·적용하여 rationale에 논증하라---`;
    return block;
  } catch {
    return null;
  }
}
