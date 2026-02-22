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

import iconv from "iconv-lite";

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

/** API 응답에서 판례 배열 추출 (다양한 응답 형태 지원). 법령정보 API는 최상위 키가 PrecSearch 인 경우 있음 */
function parsePrecList(data: unknown): unknown[] {
  const d = data as Record<string, unknown>;
  const precSearch = d?.PrecSearch ?? d?.precSearch;
  const fromPrecSearch =
    Array.isArray(precSearch)
      ? precSearch
      : typeof precSearch === "object" && precSearch !== null
        ? (precSearch as Record<string, unknown>).prec ??
          (precSearch as Record<string, unknown>).Prec ??
          (precSearch as Record<string, unknown>).precList ??
          (precSearch as Record<string, unknown>).판례
        : undefined;
  const rawItems =
    d?.prec ??
    d?.Prec ??
    d?.판례 ??
    d?.precList ??
    (d?.PrecList as unknown) ??
    fromPrecSearch ??
    (typeof d?.result === "object" && d.result !== null ? (d.result as Record<string, unknown>).prec : undefined) ??
    (Array.isArray(data) ? data : null);
  return Array.isArray(rawItems) ? rawItems : [];
}

type PrecRow = { name: string; no: string; date: string; court: string; id?: string };
/** 검색 시 어떤 쿼리로 찾았는지 기록 — 사건명 검색어로 찾은 판례 우선 정렬용 */
type PrecRowWithSource = PrecRow & { sourceQuery?: string };

/** 본문(제목+경위)과 판례 사건명·검색어의 유사도. searchTerms·priorityCount 있으면 상위 N개 검색어로 찾은 판례에 가산. */
function precedentRelevanceScore(
  row: PrecRow & { sourceQuery?: string },
  caseTitle: string,
  caseDetails: string,
  searchTerms?: string[],
  priorityQueryCount = 0
): number {
  const toWords = (s: string) =>
    (s || "")
      .replace(/[\s,.\-·]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w: string) => w.length >= 2);
  const caseWords = new Set([...toWords(caseTitle), ...toWords((caseDetails || "").slice(0, 500))]);
  const nameWords = toWords(row.name);
  const nameLower = row.name;
  let score = 0;
  for (const w of nameWords) {
    if (caseWords.has(w)) score += 2;
    else if ([...caseWords].some((c) => c.includes(w) || w.includes(c))) score += 1;
  }
  for (const c of caseWords) {
    if (nameLower.includes(c)) score += 2;
  }
  if (searchTerms?.length) {
    for (const term of searchTerms) {
      const t = (term || "").trim();
      if (t.length < 2) continue;
      if (nameLower.includes(t)) score += 2;
      else if (toWords(t).some((tw: string) => nameLower.includes(tw))) score += 1;
    }
  }
  if (priorityQueryCount > 0 && searchTerms?.length && row.sourceQuery) {
    const rq = (row.sourceQuery || "").trim();
    const isPriority = searchTerms.slice(0, priorityQueryCount).some((t) => (t || "").trim() === rq);
    if (isPriority) score += 40;
  }
  return score;
}

/** 두 텍스트 간 단어 겹침 점수 (판시사항·본문 비교용). 본문 단어가 판례에 포함돼도 인정. */
function textOverlapScore(caseText: string, precedentText: string): number {
  const toWords = (s: string) =>
    (s || "")
      .replace(/[\s,.\-·]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w: string) => w.length >= 2);
  const caseWords = toWords(caseText.slice(0, 800));
  const caseSet = new Set(caseWords);
  const precWords = toWords(precedentText.slice(0, 1500));
  const precLower = precedentText.slice(0, 1500);
  let n = 0;
  for (const w of precWords) {
    if (caseSet.has(w)) n += 2;
    else if ([...caseSet].some((c: string) => c.includes(w) || w.includes(c))) n += 1;
  }
  for (const c of caseWords) {
    if (precLower.includes(c)) n += 2;
  }
  return n;
}

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

/** 본문과 유사도가 이 점수 미만이면 참조 판례 블록에 넣지 않음 (단, 유사 사건명 검색으로 찾은 판례는 1점 이상이면 포함) */
const MIN_RELEVANCE_SCORE = 2;

/** queryList 검색 0건이고 본문에서 단일어를 못 뽑았을 때 시도할 기본 단일어 (군사·일반) */
const DEFAULT_FALLBACK_SINGLE_WORDS = ["탈영", "군무이탈", "형법"];

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
  "의료사고",
  "의료과실",
  "진료과실",
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
  /** 검색어 배열 앞 N개는 '유사 사건명' — 이 검색어로 찾은 판례에 가산 (기본 2) */
  priorityQueryCount?: number;
};

/**
 * 판례 목록 조회. OC 미설정 또는 API 오류 시 null 반환.
 * queryOverride가 문자열 배열이면 각 사건 명칭마다 따로 검색해 결과를 합침. 문자열이면 기존처럼 한 번만 검색.
 * @param queryOverride - 단일 검색어 또는 유사 사건 명칭 배열(각각 한 번씩 검색)
 */
export async function searchPrecedents(
  title: string,
  details: string,
  limit = 10,
  queryOverride?: string | string[] | null,
  options?: SearchPrecedentsOptions | null
): Promise<string | null> {
  const oc = process.env.LAW_GO_KR_OC?.trim();
  if (typeof window !== "undefined") return null;
  if (!oc) {
    console.log("[GAEPAN][판례] 검색 스킵: LAW_GO_KR_OC 미설정. Vercel/서버에 LAW_GO_KR_OC 환경 변수를 추가한 뒤 재배포하세요.");
    return null;
  }
  console.log("[GAEPAN][판례] OC 사용 중 (이메일 @ 앞 ID와 일치해야 함). 앞 2자:", oc.slice(0, 2), "길이:", oc.length);

  const display = Math.min(Math.max(limit, 15), 20);
  const seen = new Set<string>();
  const validRows: PrecRowWithSource[] = [];
  let singleWordsTried: string[] = [];
  const onSingleWordSuccess = options?.onSingleWordSuccess;
  const priorityQueryCount = options?.priorityQueryCount ?? 2;

  const runSearch = async (queryStr: string, search: 1 | 2): Promise<void> => {
    const q = (queryStr || "").trim().slice(0, 100);
    if (!q) return;
    const query = encodeURIComponent(q);
    const url = `${LAW_API_BASE}?OC=${encodeURIComponent(oc)}&target=prec&type=JSON&query=${query}&search=${search}&org=${ORG_SUPREME_COURT}&display=${display}`;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "GAEPAN/1.0 (precedent-search)",
          Referer: "https://www.law.go.kr/",
        },
        signal: AbortSignal.timeout(10000),
      });
      const buf = await res.arrayBuffer();
      if (!res.ok) {
        console.log("[GAEPAN][판례] API 응답 비정상", { query: q.slice(0, 30), status: res.status });
        return;
      }
      if (!buf?.byteLength) {
        console.log("[GAEPAN][판례] API 응답 본문 없음", { query: q.slice(0, 30) });
        return;
      }
      const rawUtf8 = new TextDecoder("utf-8").decode(buf);
      const rawEucKr = iconv.decode(Buffer.from(buf), "euc-kr");
      const rawCp949 = iconv.decode(Buffer.from(buf), "cp949");
      if (/미신청|등록된\s*API|법령종류\s*체크/i.test(rawUtf8) || /미신청|등록된\s*API|법령종류\s*체크/i.test(rawEucKr)) {
        console.log("[GAEPAN][판례] 서버가 '미신청된 목록/본문' 등 접근 제한 응답 반환. OC가 이메일 @ 앞 ID인지, open.law.go.kr에서 판례 목록/본문 전부 체크·승인됐는지 확인. 문의: 02-2109-6446");
      }
      const strip = (s: string) => s.replace(/^\uFEFF/, "").trim();
      let data: unknown;
      const attempts = [
        () => JSON.parse(strip(rawUtf8)),
        () => JSON.parse(strip(rawEucKr)),
        () => JSON.parse(strip(rawCp949)),
      ];
      let parsed = false;
      for (const tryParse of attempts) {
        try {
          data = tryParse();
          parsed = true;
          break;
        } catch {
          continue;
        }
      }
      if (!parsed) {
        const preview = rawUtf8.slice(0, 120).replace(/\s/g, " ");
        console.log("[GAEPAN][판례] API 응답 JSON 파싱 실패(UTF-8/EUC-KR/CP949)", { query: q.slice(0, 30), rawLength: buf.byteLength, preview });
        return;
      }
      const list = parsePrecList(data);
      if (list.length === 0) {
        const topKeys = (data && typeof data === "object") ? Object.keys(data as object).slice(0, 15) : [];
        const precSearch = (data as Record<string, unknown>)?.PrecSearch ?? (data as Record<string, unknown>)?.precSearch;
        const innerInfo =
          precSearch != null && typeof precSearch === "object" && !Array.isArray(precSearch)
            ? { PrecSearchKeys: Object.keys(precSearch as object), totalCnt: (precSearch as Record<string, unknown>)?.totalCnt }
            : Array.isArray(precSearch)
              ? { PrecSearchIsArrayLength: precSearch.length }
              : { PrecSearchType: typeof precSearch };
        const snippet =
          precSearch != null
            ? JSON.stringify(precSearch).slice(0, 380).replace(/\s+/g, " ")
            : "";
        console.log("[GAEPAN][판례] API 응답 수신했으나 판례 배열 0건", { query: q.slice(0, 30), rawLength: buf.byteLength, topKeys, ...innerInfo, PrecSearchSnippet: snippet || undefined });
      }
      let accepted = 0;
      for (const p of list) {
        const row = toRow(p);
        if (!row) continue;
        const key = row.no || `${row.name}|${row.date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        validRows.push({ ...row, sourceQuery: q });
        accepted++;
      }
      if (list.length > 0 && accepted === 0) {
        const first = list[0] as Record<string, unknown>;
        console.log("[GAEPAN][판례] API는 항목 있으나 toRow 통과 0건 — 응답 필드 샘플:", { query: q.slice(0, 30), listLength: list.length, firstKeys: first ? Object.keys(first).slice(0, 15) : [] });
      } else if (list.length === 0 && buf.byteLength > 50) {
        const top = (data as Record<string, unknown>) ? Object.keys(data as object).slice(0, 12) : [];
        console.log("[GAEPAN][판례] API 응답에 판례 배열 없음 — 상위 키:", { query: q.slice(0, 30), topKeys: top });
      }
    } catch (err) {
      console.log("[GAEPAN][판례] runSearch 예외", { query: q.slice(0, 30), err: err instanceof Error ? err.message : String(err) });
    }
  };

  try {
    const isQueryList = Array.isArray(queryOverride) && queryOverride.length > 0;
    if (isQueryList) {
      for (const q of queryOverride as string[]) {
        const term = (q && typeof q === "string" ? q : "").trim().slice(0, 100);
        if (!term) continue;
        await runSearch(term, 1);
        await runSearch(term, 2);
        if (validRows.length >= limit) break;
      }
      if (validRows.length === 0) {
        const combined = `${(queryOverride as string[]).join(" ")} ${title} ${(details || "").slice(0, 200)}`;
        const fromText = pickSingleWordsFromText(combined);
        const preferred = options?.preferredSingleWords ?? [];
        singleWordsTried = [...new Set([...preferred, ...fromText])];
        if (singleWordsTried.length === 0) singleWordsTried = DEFAULT_FALLBACK_SINGLE_WORDS;
        for (const w of singleWordsTried) {
          const before = validRows.length;
          await runSearch(w, 1);
          await runSearch(w, 2);
          if (validRows.length > before && onSingleWordSuccess) onSingleWordSuccess(w);
          if (validRows.length >= limit) break;
        }
      }
    } else {
      const queryString = getQueryString(title, details, typeof queryOverride === "string" ? queryOverride : null);
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
        if (singleWordsTried.length === 0) singleWordsTried = DEFAULT_FALLBACK_SINGLE_WORDS;
        for (const w of singleWordsTried) {
          const before = validRows.length;
          await runSearch(w, 1);
          await runSearch(w, 2);
          if (validRows.length > before && onSingleWordSuccess) onSingleWordSuccess(w);
          if (validRows.length >= limit) break;
        }
      }
    }

    if (validRows.length === 0) {
      const queryShort = isQueryList ? (queryOverride as string[]).join(", ") : getQueryString(title, details, typeof queryOverride === "string" ? queryOverride : null);
      console.log("[GAEPAN][판례] 검색 결과 0건. 쿼리:", String(queryShort).slice(0, 60), "단일어 시도:", singleWordsTried);
      return null;
    }

    const searchTerms = isQueryList ? (queryOverride as string[]) : undefined;
    const nameScore = (r: PrecRowWithSource) => precedentRelevanceScore(r, title, details, searchTerms, priorityQueryCount);
    const sortedByName = [...validRows].sort((a, b) => nameScore(b) - nameScore(a));
    const topForDetail = Math.min(5, sortedByName.length);
    const caseText = `${title || ""} ${(details || "").slice(0, 600)}`;
    const contentScoreMap = new Map<string, number>();
    const detailCache = new Map<string, { 판시사항?: string; 판결요지?: string; 판례내용?: string }>();
    for (let i = 0; i < topForDetail; i++) {
      const r = sortedByName[i];
      const key = `${r.no}|${r.name}`;
      if (!r.id) {
        contentScoreMap.set(key, nameScore(r));
        continue;
      }
      const detail = await fetchPrecedentDetail(r.id);
      if (detail) detailCache.set(key, detail);
      const detailText = detail
        ? [detail.판시사항, detail.판결요지, detail.판례내용].filter(Boolean).join(" ")
        : "";
      contentScoreMap.set(key, textOverlapScore(caseText, `${r.name} ${detailText}`));
    }
    const sorted = [...validRows].sort((a, b) => {
      const keyA = `${a.no}|${a.name}`;
      const keyB = `${b.no}|${b.name}`;
      const scoreA = contentScoreMap.get(keyA) ?? nameScore(a);
      const scoreB = contentScoreMap.get(keyB) ?? nameScore(b);
      return scoreB - scoreA;
    });
    const getScore = (r: PrecRowWithSource) => contentScoreMap.get(`${r.no}|${r.name}`) ?? nameScore(r);
    const isFromPriorityQuery = (r: PrecRowWithSource) =>
      priorityQueryCount > 0 &&
      searchTerms?.length &&
      (r.sourceQuery || "").trim() &&
      searchTerms.slice(0, priorityQueryCount).some((t) => (t || "").trim() === (r.sourceQuery || "").trim());
    const similarOnly = sorted.filter((r) => {
      const s = getScore(r);
      return s >= MIN_RELEVANCE_SCORE || (isFromPriorityQuery(r) && s >= 1);
    });
    if (similarOnly.length === 0) {
      console.log("[GAEPAN][판례] 본문과 유사한 판례 없음(최소 점수 미달) — 참조 판례 블록 생략");
      return null;
    }
    const rowsToShow = similarOnly.slice(0, limit);
    const detailCount = 2;
    const rowsWithDetail = rowsToShow.filter((r) => r.id).slice(0, detailCount);
    const detailTexts: string[] = [];
    for (const r of rowsWithDetail) {
      if (!r.id) continue;
      const detail = detailCache.get(`${r.no}|${r.name}`) ?? (await fetchPrecedentDetail(r.id!));
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
