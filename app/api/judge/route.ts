import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createSupabaseServerClient } from "@/lib/supabase";
import crypto from "crypto";

export const runtime = "nodejs";

function hashPassword(pw: string): string {
  return crypto.createHash("sha256").update(pw).digest("hex");
}

/** IP 추출 (비로그인 허용 → 기소장 작성자 식별용) */
function getIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function isBlockedIp(ip: string): Promise<boolean> {
  if (!ip || ip === "unknown") return false;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("blocked_ips")
    .select("id")
    .eq("ip_address", ip)
    .maybeSingle();

  if (error) {
    console.error("[GAEPAN] blocked_ips check error:", error);
    return false;
  }

  return !!data;
}

const CATEGORIES = ["연애", "직장생활", "가족", "결혼생활", "육아", "친구", "이웃/매너", "사회이슈", "기타"] as const;

type JudgeRequest = {
  title: string;
  plaintiff: string;
  defendant: string;
  details: string;
  image_url?: string | null;
  category?: string;
  trial_type?: "DEFENSE" | "ACCUSATION";
};

type JudgeVerdict = {
  title: string;
  ratio: {
    plaintiff: number;
    defendant: number;
    rationale: string;
  };
  verdict: string;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}

function hashToInt(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Gemini가 없을 때 사용되는 간단한 MOCK 판결 생성기
function buildMockVerdict(req: JudgeRequest): JudgeVerdict {
  const details = (req.details ?? "").trim();
  const title = (req.title ?? "").trim();
  const text = `${title}\n${req.plaintiff ?? ""}\n${req.defendant ?? ""}\n${details}`.trim();
  const h = hashToInt(text);

  let plaintiff = 50;
  const d = details;

  const defendantHeavy = ["폭언", "욕", "협박", "모욕", "가스라이팅", "손찌검", "폭행", "때렸", "밀쳤", "성희롱"];
  const defendantMedium = ["잠수", "읽씹", "무시", "거짓말", "약속", "연락", "늦", "지각", "환불", "돈", "빌려"];
  const plaintiffHeavy = ["내가 먼저", "참지 못", "질렀", "폭발", "고함", "막말", "카톡 폭탄", "스토킹", "집착"];
  const plaintiffMedium = ["서운", "예민", "계속", "확인", "따졌", "추궁", "감정적"];

  const includesAny = (arr: string[]) => arr.some((k) => d.includes(k));

  if (includesAny(defendantHeavy)) plaintiff -= 25;
  if (includesAny(defendantMedium)) plaintiff -= 10;
  if (includesAny(plaintiffHeavy)) plaintiff += 25;
  if (includesAny(plaintiffMedium)) plaintiff += 10;

  plaintiff += (h % 25) - 12;

  // 무죄 주장(DEFENSE)일 때는 원고 과실 0% 허용
  plaintiff = clamp(
    roundTo(plaintiff, 5),
    req.trial_type === "DEFENSE" ? 0 : 10,
    90
  );
  const defendant = 100 - plaintiff;

  const titleOut = `사건 개요: “${req.title}"`;

  // 무죄 주장(DEFENSE)이고 원고 잘못이 없을 때 → 원고 무죄 판결
  if (req.trial_type === "DEFENSE" && plaintiff <= 10) {
    const rationale = "원고에게 귀책사유가 없다고 인정된다. 과실은 전부 피고에게 있다.";
    const verdict = "원고 무죄. 과실비율은 원고 0% / 피고 100%로 정한다.";
    return {
      title: titleOut,
      ratio: { plaintiff: 0, defendant: 100, rationale },
      verdict,
    };
  }

  const guiltySide =
    defendant > plaintiff ? `피고(${req.defendant ?? "익명"})` : `원고(${req.plaintiff ?? "익명"})`;

  const guiltyLevel =
    Math.max(defendant, plaintiff) >= 70 ? "중대" : Math.max(defendant, plaintiff) >= 55 ? "상당" : "경미";

  const rationale = `기록 기준으로 보면 한쪽만 ‘완벽하게’ 잘못했다고 보기 어렵다. 다만 반복성/강도/선제행위가 더 큰 쪽에 과실을 더 얹는다. 원고 ${plaintiff}%, 피고 ${defendant}%는 “누가 더 성숙하게 행동했는가”에 대한 점수표다.`;

  const verdict = `${guiltySide} ${guiltyLevel} 유죄. 과실비율은 원고 ${plaintiff}% / 피고 ${defendant}%로 정한다.`;

  return { title: titleOut, ratio: { plaintiff, defendant, rationale }, verdict };
}

function stripJsonFences(text: string) {
  const t = text.trim();
  if (t.startsWith("```")) {
    return t.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```$/m, "").trim();
  }
  return t;
}

async function callGemini(req: JudgeRequest): Promise<JudgeVerdict> {
  const apiKey = process.env.GEMINI_API_KEY;
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
    "반환 JSON 스키마 (punchline 없이):",
    '{',
    '  "title": string,',
    '  "ratio": { "plaintiff": number, "defendant": number, "rationale": string },',
    '  "verdict": string',
    "}",
    "",
    "제약:",
    "- ratio.plaintiff + ratio.defendant 는 반드시 100 (정수)이어야 한다.",
    "- 비율은 0~100 범위. 너무 애매하면 50:50으로 가도 된다.",
    "- 입력에 없는 개인정보를 추정/창작하지 마라.",
  ].join("\n");

  const trialInstruction =
    req.trial_type === "DEFENSE"
      ? "재판 목적: 무죄 주장(항변). 원고(나)에게 잘못이 없으면 반드시 verdict에 '원고 무죄'로 판단하고, ratio는 원고 0 / 피고 100으로 한다. 원고 과실이 0에 가깝다면 원고 무죄로 판결하라."
      : "재판 목적: 유죄 주장(기소). 피고에게 과실이 있으면 유죄로 판단한다.";

  const user = [
    "아래 사건을 판결하라.",
    "",
    trialInstruction,
    "",
    `사건 제목: ${req.title}`,
    `원고(나): ${req.plaintiff}`,
    `피고(상대): ${req.defendant}`,
    "사건 경위(상세):",
    req.details,
  ].join("\n");

  const prompt = `${system}\n\n${user}`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.9,
    },
  } as any);

  const raw = (result as any)?.response?.text?.() ?? "";
  const content = stripJsonFences(String(raw));
  if (!content) throw new Error("Empty Gemini response");

  const parsed = JSON.parse(content) as JudgeVerdict;
  const p = Number((parsed as any)?.ratio?.plaintiff);
  const d = Number((parsed as any)?.ratio?.defendant);
  if (!Number.isFinite(p) || !Number.isFinite(d)) throw new Error("Bad ratio numbers");

  let p2 = clamp(Math.round(p), 0, 100);
  let d2 = clamp(Math.round(d), 0, 100);
  if (p2 + d2 !== 100) {
    p2 = clamp(roundTo(p2, 5), 0, 100);
    d2 = clamp(100 - p2, 0, 100);
  }

  parsed.ratio.plaintiff = p2;
  parsed.ratio.defendant = d2;

  // 무죄 주장(DEFENSE)이고 원고 잘못이 없을 때 → 원고 무죄 판결로 통일
  if (req.trial_type === "DEFENSE" && p2 <= 10) {
    parsed.ratio.plaintiff = 0;
    parsed.ratio.defendant = 100;
    parsed.verdict = "원고 무죄. 과실비율은 원고 0% / 피고 100%로 정한다.";
  }

  return parsed;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Partial<JudgeRequest> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const { title, details, image_url, category: rawCategory } = body;
    const category =
      typeof rawCategory === "string" && CATEGORIES.includes(rawCategory as any)
        ? rawCategory.trim()
        : "기타";
    const rawPassword =
      typeof (body as any)?.password === "string" ? (body as any).password.trim() : "";

    // 서버 로그: 기소장 기본 정보 (비밀번호/원문 전문은 남기지 않음)
    console.log("[GAEPAN][POST /api/judge] incoming request", {
      title: title?.slice(0, 50) ?? null,
      detailsLength: typeof details === "string" ? details.length : null,
      hasImage: typeof image_url === "string" && image_url.length > 0,
      category: rawCategory ?? null,
      trial_type: body?.trial_type ?? null,
    });

    if (!rawPassword) {
      return NextResponse.json(
        { ok: false, error: "삭제용 비밀번호를 입력해 주세요." },
        { status: 400 },
      );
    }

    const passwordLengthNoSpaces = rawPassword.replace(/\s/g, "").length;
    if (passwordLengthNoSpaces > 20) {
      return NextResponse.json(
        { ok: false, error: "삭제 비밀번호는 공백 제외 20자 이내로 입력해 주세요." },
        { status: 400 },
      );
    }

    if (!isNonEmptyString(title) || !isNonEmptyString(details)) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 },
      );
    }

    const trimmedTitle = title.trim();
    const titleLengthNoSpaces = trimmedTitle.replace(/\s/g, "").length;
    if (titleLengthNoSpaces > 40) {
      return NextResponse.json(
        { ok: false, error: "제목은 공백 제외 40자 이내로 입력해 주세요." },
        { status: 400 },
      );
    }

    const trimmedDetails = details.trim();
    if (trimmedDetails.length < 30) {
      return NextResponse.json(
        { ok: false, error: "사건 정보가 너무 짧습니다. 최소 30자 이상 입력해 주세요." },
        { status: 400 },
      );
    }

    const trial_type = body.trial_type;
    if (trial_type !== "DEFENSE" && trial_type !== "ACCUSATION") {
      return NextResponse.json(
        { ok: false, error: "재판 목적을 선택해주세요." },
        { status: 400 },
      );
    }

    const req: JudgeRequest = {
      title: trimmedTitle,
      plaintiff: "익명",
      defendant: "익명",
      details: trimmedDetails,
      image_url: typeof image_url === "string" ? image_url : null,
      trial_type,
    };

    const passwordHash = hashPassword(rawPassword);

    const ip = getIp(request);

    if (await isBlockedIp(ip)) {
      return NextResponse.json(
        { ok: false, error: "차단된 사용자입니다. 더 이상 판결문을 작성할 수 없습니다." },
        { status: 403 },
      );
    }

    const supabase = createSupabaseServerClient();
    const hasGemini = !!process.env.GEMINI_API_KEY;

    let verdict: JudgeVerdict;
    if (hasGemini) {
      try {
        console.log("[GAEPAN][POST /api/judge] calling Gemini with trial_type=", trial_type);
        verdict = await callGemini(req);
        console.log("[GAEPAN][POST /api/judge] Gemini verdict", {
          title: verdict.title?.slice(0, 80),
          ratio: verdict.ratio,
          verdict: verdict.verdict?.slice(0, 120),
        });
      } catch (geminiErr) {
        console.error("[GAEPAN] callGemini failed", geminiErr);
        verdict = buildMockVerdict(req);
        console.log("[GAEPAN][POST /api/judge] using MOCK verdict instead", {
          title: verdict.title?.slice(0, 80),
          ratio: verdict.ratio,
          verdict: verdict.verdict?.slice(0, 120),
        });
      }
    } else {
      verdict = buildMockVerdict(req);
      console.log("[GAEPAN][POST /api/judge] GEMINI_API_KEY missing, using MOCK verdict", {
        title: verdict.title?.slice(0, 80),
        ratio: verdict.ratio,
        verdict: verdict.verdict?.slice(0, 120),
      });
    }

    const { data: maxRow } = await supabase
      .from("posts")
      .select("case_number")
      .order("case_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextCaseNumber =
      maxRow?.case_number != null && Number.isFinite(Number(maxRow.case_number))
        ? Number(maxRow.case_number) + 1
        : 1;

    const rationaleToSave =
      typeof verdict.ratio?.rationale === "string" ? verdict.ratio.rationale : null;
    console.log("[GAEPAN][POST /api/judge] inserting post into DB", {
      caseNumberCandidate: nextCaseNumber,
      ratioDefendant: verdict.ratio.defendant,
      verdict_rationaleLength: rationaleToSave?.length ?? 0,
      verdict_rationalePreview: rationaleToSave?.slice(0, 80) ?? null,
    });

    const { data: inserted, error } = await supabase
      .from("posts")
      .insert({
        title: verdict.title,
        content: req.details,
        verdict: verdict.verdict,
        verdict_rationale: rationaleToSave,
        ratio: Number(verdict.ratio.defendant),
        plaintiff: req.plaintiff,
        defendant: req.defendant,
        status: "판결완료",
        guilty: 0,
        not_guilty: 0,
        image_url: req.image_url ?? null,
        ip_address: ip,
        case_number: nextCaseNumber,
        delete_password: passwordHash,
        category,
        trial_type: req.trial_type,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[GAEPAN] DB_INSERT_ERROR:", error);
      if (
        error.message?.includes("verdict_rationale") ||
        error.message?.toLowerCase().includes("column")
      ) {
        console.error(
          "[GAEPAN] DB에 verdict_rationale 컬럼이 없을 수 있습니다. Supabase SQL Editor에서 sql/add_verdict_rationale.sql 을 실행하세요."
        );
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    console.log("[GAEPAN][POST /api/judge] insert success", {
      postId: inserted?.id ?? null,
    });

    return NextResponse.json({
      ok: true,
      mock: !hasGemini,
      verdict,
      post_id: inserted?.id ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[GAEPAN][POST /api/judge] unhandled error", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
