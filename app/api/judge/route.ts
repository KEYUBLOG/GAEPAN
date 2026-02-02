import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

type JudgeRequest = {
  title: string;
  plaintiff: string;
  defendant: string;
  details: string;
  image_url?: string | null;
};

type JudgeVerdict = {
  title: string;
  ratio: {
    plaintiff: number;
    defendant: number;
    rationale: string;
  };
  verdict: string;
  punchline: string;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** 금지어·부적절 내용 포함 시 true (판결불가) */
function isForbiddenOrInappropriate(req: JudgeRequest): boolean {
  const combined = `${req.title} ${req.plaintiff} ${req.defendant} ${req.details}`.toLowerCase();
  const normalized = combined.normalize("NFD").replace(/\p{Mn}/gu, "");

  const forbidden = [
    "시발", "씨발", "ㅅㅂ", "ㅂㅅ", "지랄", "닥쳐", "죽어", "뒤져",
    "개새", "병신", "한남", "한녀", "혐오", "테러", "폭탄", "살인",
    "아동", "미성년", "성착취", "스팸", "광고", "홍보", "도배",
  ];

  for (const word of forbidden) {
    if (combined.includes(word) || normalized.includes(word)) return true;
  }

  if (req.details.length < 10) return true;
  if (req.title.length > 200 || req.details.length > 10000) return true;

  return false;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}

function hashToInt(input: string) {
  // 작은 결정론적 해시 (FNV-1a 유사)
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildMockVerdict(req: JudgeRequest): JudgeVerdict {
  const text = `${req.title}\n${req.plaintiff}\n${req.defendant}\n${req.details}`.trim();
  const h = hashToInt(text);

  // 기본 50:50에서 키워드로 가중치 조정
  let plaintiff = 50;
  const d = req.details;

  const defendantHeavy = ["폭언", "욕", "협박", "모욕", "가스라이팅", "손찌검", "폭행", "때렸", "밀쳤", "성희롱"];
  const defendantMedium = ["잠수", "읽씹", "무시", "거짓말", "약속", "연락", "늦", "지각", "환불", "돈", "빌려"];
  const plaintiffHeavy = ["내가 먼저", "참지 못", "질렀", "폭발", "고함", "막말", "카톡 폭탄", "스토킹", "집착"];
  const plaintiffMedium = ["서운", "예민", "계속", "확인", "따졌", "추궁", "감정적"];

  const includesAny = (arr: string[]) => arr.some((k) => d.includes(k));

  if (includesAny(defendantHeavy)) plaintiff -= 25;
  if (includesAny(defendantMedium)) plaintiff -= 10;
  if (includesAny(plaintiffHeavy)) plaintiff += 25;
  if (includesAny(plaintiffMedium)) plaintiff += 10;

  // 해시로 약간의 흔들림 (±12)
  plaintiff += (h % 25) - 12;

  plaintiff = clamp(roundTo(plaintiff, 5), 10, 90);
  const defendant = 100 - plaintiff;

  const guiltySide =
    defendant > plaintiff ? `피고(${req.defendant})` : `원고(${req.plaintiff})`;
  const guiltyLevel =
    Math.max(defendant, plaintiff) >= 70 ? "중대" : Math.max(defendant, plaintiff) >= 55 ? "상당" : "경미";

  const title = `사건 개요: “${req.title}”`;

  const rationale = `기록 기준으로 보면 한쪽만 ‘완벽하게’ 잘못했다고 보기 어렵다. 다만 반복성/강도/선제행위가 더 큰 쪽에 과실을 더 얹는다. 원고 ${plaintiff}%, 피고 ${defendant}%는 “누가 더 성숙하게 행동했는가”에 대한 점수표다.`;

  const verdict = `${guiltySide} ${guiltyLevel} 유죄. 과실비율은 원고 ${plaintiff}% / 피고 ${defendant}%로 정한다. 처방은 간단하다: 사실관계 정리, 경계선 합의, 그리고 말투 교정.`;

  const roastPool = [
    "증거는 없고 감정만 풍성하면, 그건 재판이 아니라 일기장이다.",
    "‘나는 억울해’는 주장이지 입증이 아니다. 둘 다 숙제부터 해라.",
    "상대가 나쁘다는 말이 길수록, 본인 책임이 같이 늘어난다.",
    "인간관계는 법전이 아니다. 그래도 최소한 상식은 지켜라.",
    "선 넘은 뒤에 ‘장난이었는데’는 면죄부가 아니다.",
  ];
  const punchline = roastPool[h % roastPool.length];

  return { title, ratio: { plaintiff, defendant, rationale }, verdict, punchline };
}

function stripJsonFences(text: string) {
  const t = text.trim();
  if (t.startsWith("```")) {
    // ```json ... ```
    return t.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```$/m, "").trim();
  }
  return t;
}

async function callGemini(req: JudgeRequest): Promise<JudgeVerdict> {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("[GAEPAN] GEMINI_API_KEY check:", {
    hasKey: !!apiKey,
    keyLength: apiKey?.length ?? 0,
    keyPrefix: apiKey ? `${apiKey.slice(0, 8)}...` : "(empty)",
  });
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const system = [
    "너는 'GAEPAN'의 AI 판사다.",
    "컨셉: 아주 냉소적이고, 논리적으로만 판단하는 독설가. 감정호소는 감점.",
    "사실관계/인과/책임을 깔끔히 분해해서 판단하라.",
    "",
    "출력 규칙(최우선):",
    "- 반드시 '유효한 JSON'만 출력한다. 마크다운/설명/코드펜스/여는말/닫는말 금지.",
    "- 아래 스키마를 정확히 지킨다. (키 이름 변경 금지)",
    "",
    "반환 JSON 스키마:",
    "{",
    '  "title": string,',
    '  "ratio": { "plaintiff": number, "defendant": number, "rationale": string },',
    '  "verdict": string,',
    '  "punchline": string',
    "}",
    "",
    "제약:",
    "- ratio.plaintiff + ratio.defendant 는 반드시 100 (정수)이어야 한다.",
    "- 비율은 0~100 범위. 너무 애매하면 50:50으로 가도 된다.",
    "- 입력에 없는 개인정보를 추정/창작하지 마라.",
  ].join("\n");

  const user = [
    "아래 사건을 판결하라.",
    "",
    `사건 제목: ${req.title}`,
    `원고(나): ${req.plaintiff}`,
    `피고(상대): ${req.defendant}`,
    "사건 경위(상세):",
    req.details,
  ].join("\n");

  const prompt = `${system}\n\n${user}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        // JSON 형식을 강제(지원되는 버전에서만 적용됨). 프롬프트로도 2중 강제.
        responseMimeType: "application/json",
        temperature: 0.9,
      },
    } as any);

    const raw = (result as any)?.response?.text?.() ?? "";
    const content = stripJsonFences(String(raw));
    if (!content) throw new Error("Empty Gemini response");

    try {
      const parsed = JSON.parse(content) as JudgeVerdict;
      const p = Number((parsed as any)?.ratio?.plaintiff);
      const d = Number((parsed as any)?.ratio?.defendant);
      if (!Number.isFinite(p) || !Number.isFinite(d)) throw new Error("Bad ratio numbers");

      // 정수/합계 100 보정
      let p2 = clamp(Math.round(p), 0, 100);
      let d2 = clamp(Math.round(d), 0, 100);
      if (p2 + d2 !== 100) {
        p2 = clamp(roundTo(p2, 5), 0, 100);
        d2 = clamp(100 - p2, 0, 100);
      }

      parsed.ratio.plaintiff = p2;
      parsed.ratio.defendant = d2;
      return parsed;
    } catch (parseErr) {
      console.error("[GAEPAN] Gemini response parse error", parseErr);
      throw new Error(
        `Gemini 응답 파싱 실패: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      );
    }
  } catch (err) {
    console.error("[GAEPAN] Gemini API error", err);
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Partial<JudgeRequest> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const title = body.title;
    const plaintiff = body.plaintiff;
    const defendant = body.defendant;
    const details = body.details;
    const imageUrl =
      typeof body.image_url === "string" && body.image_url.trim().length > 0
        ? body.image_url.trim()
        : null;

    if (
      !isNonEmptyString(title) ||
      !isNonEmptyString(plaintiff) ||
      !isNonEmptyString(defendant) ||
      !isNonEmptyString(details)
    ) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const req: JudgeRequest = {
      title: title.trim(),
      plaintiff: plaintiff.trim(),
      defendant: defendant.trim(),
      details: details.trim(),
    };

    const supabase = createSupabaseServerClient();
    const isBlocked = isForbiddenOrInappropriate(req);

    if (isBlocked) {
      const { error } = await supabase.from("posts").insert({
        title: req.title,
        content: req.details,
        verdict: "판결불가",
        punchline: "",
        ratio: 0,
        plaintiff: req.plaintiff,
        defendant: req.defendant,
        status: "판결불가",
        guilty: 0,
        not_guilty: 0,
        image_url: imageUrl,
      });

      if (error) {
        console.error("DB_INSERT_ERROR:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, status: "판결불가", verdict: null });
    }

    const hasGemini = !!process.env.GEMINI_API_KEY;
    console.log("[GAEPAN] POST /api/judge — GEMINI_API_KEY loaded?", hasGemini);

    let verdict: JudgeVerdict;
    if (hasGemini) {
      try {
        verdict = await callGemini(req);
      } catch (geminiErr) {
        console.error("[GAEPAN] callGemini failed", geminiErr);
        const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }
    } else {
      verdict = buildMockVerdict(req);
    }

    console.log("[GAEPAN] Judge verdict ready", {
      hasGemini,
      title: req.title,
      plaintiff: req.plaintiff,
      defendant: req.defendant,
      ratio: verdict.ratio,
    });

    const { error } = await supabase.from("posts").insert({
      title: verdict.title,
      content: req.details,
      verdict: verdict.verdict,
      punchline: verdict.punchline,
      ratio: Number(verdict.ratio.defendant),
      plaintiff: req.plaintiff,
      defendant: req.defendant,
      status: "판결완료",
      guilty: 0,
      not_guilty: 0,
      image_url: imageUrl,
    });

    if (error) {
      console.error("DB_INSERT_ERROR:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, mock: !hasGemini, verdict });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

