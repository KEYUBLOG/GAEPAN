import type { MetadataRoute } from "next";
import { createSupabaseServerClient } from "@/lib/supabase";

const BASE_URL = "https://gaepanai.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
  ];

  let postUrls: MetadataRoute.Sitemap = [];
  try {
    const supabase = createSupabaseServerClient();
    const { data: posts, error } = await supabase
      .from("posts")
      .select("id")
      .neq("status", "판결불가");

    if (!error && posts?.length) {
      postUrls = posts.map((post) => ({
        url: `${BASE_URL}/posts/${post.id}`,
        lastModified: now,
        changeFrequency: "daily" as const,
        priority: 0.8,
      }));
    }
  } catch (e) {
    console.error("[sitemap] Failed to fetch posts:", e);
  }

  return [...staticPages, ...postUrls];
}
