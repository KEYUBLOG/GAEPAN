import { createSupabaseServerClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

const BASE_URL = "https://gaepanai.com";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatRssDate(date: string | null): string {
  if (!date) return new Date().toUTCString();
  try {
    return new Date(date).toUTCString();
  } catch {
    return new Date().toUTCString();
  }
}

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const { data: posts, error } = await supabase
      .from("posts")
      .select("id, title, content, created_at, category")
      .neq("status", "판결불가")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[RSS] Failed to fetch posts:", error);
      return new NextResponse("Failed to generate feed", { status: 500 });
    }

    const items = (posts ?? []).map((post) => {
      const id = String(post.id ?? "");
      const title = escapeXml(String(post.title ?? "제목 없음"));
      const content = escapeXml(String(post.content ?? "").slice(0, 500));
      const link = `${BASE_URL}/?post=${id}`;
      const pubDate = formatRssDate(post.created_at as string | null);
      const category = post.category ? escapeXml(String(post.category)) : "";

      return `<item>
  <title>${title}</title>
  <link>${link}</link>
  <guid isPermaLink="true">${link}</guid>
  <pubDate>${pubDate}</pubDate>
  <description>${content}${(post.content ?? "").length > 500 ? "…" : ""}</description>${category ? `\n  <category>${category}</category>` : ""}
</item>`;
    });

    const lastBuildDate = items.length
      ? formatRssDate((posts?.[0] as { created_at?: string })?.created_at ?? null)
      : new Date().toUTCString();

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>개판 AI - 개인들의 판결소</title>
    <link>${BASE_URL}</link>
    <description>당신의 억울한 사연, AI 대법관과 배심원들이 판결해드립니다. 최신 판결문 피드입니다.</description>
    <language>ko-KR</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${BASE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
${items.join("\n")}
  </channel>
</rss>`;

    return new NextResponse(rss, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (e) {
    console.error("[RSS] Error:", e);
    return new NextResponse("Failed to generate feed", { status: 500 });
  }
}
