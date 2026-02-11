import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { jsonSuccess, jsonError } from "@/lib/api-response";

export const runtime = "nodejs";

const OPERATOR_PASSWORD = process.env.OPERATOR_PASSWORD || "";

/** 비밀번호 비교를 상수 시간으로 수행해 타이밍 공격 완화 */
function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { password?: string } | null;
    const password = typeof body?.password === "string" ? body.password.trim() : "";

    if (!password) {
      return NextResponse.json(jsonError("비밀번호를 입력해주세요."), { status: 400 });
    }

    if (!OPERATOR_PASSWORD) {
      return NextResponse.json(
        jsonError("대법관 비밀번호가 설정되지 않았습니다."),
        { status: 500 }
      );
    }

    if (!constantTimeCompare(password, OPERATOR_PASSWORD)) {
      return NextResponse.json(jsonError("비밀번호가 일치하지 않습니다."), { status: 401 });
    }

    // 세션 쿠키 설정 (30일 유지)
    const cookieStore = await cookies();
    cookieStore.set("operator_session", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30일
      path: "/",
    });

    return NextResponse.json(jsonSuccess({ success: true }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(jsonError(msg), { status: 500 });
  }
}
