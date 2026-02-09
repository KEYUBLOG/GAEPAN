import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase";

const BASE_URL = "https://gaepanai.com";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!id?.trim()) {
    return { title: "청원 | 개판 AI" };
  }

  try {
    const supabase = createSupabaseServerClient();
    const { data } = await supabase
      .from("petitions")
      .select("title, category")
      .eq("id", id)
      .single();

    if (!data?.title) {
      return { title: "청원 | 개판 AI" };
    }

    const title = `${String(data.title).slice(0, 50)}${String(data.title).length > 50 ? "…" : ""} | 개판 AI`;
    const description = `국민 청원: ${data.category ?? "기타"} - ${String(data.title).slice(0, 100)}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${BASE_URL}/petitions/${id}`,
      },
      alternates: { canonical: `${BASE_URL}/petitions/${id}` },
    };
  } catch {
    return { title: "청원 | 개판 AI" };
  }
}

export default function PetitionIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
