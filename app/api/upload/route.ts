import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

const BUCKET = "gaepan-images";
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/** POST: 이미지 파일을 Supabase Storage에 업로드하고 public URL 반환 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }

    const file = formData.get("file") ?? formData.get("image");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file or invalid file" }, { status: 400 });
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: "파일 크기는 5MB 이하여야 합니다." },
        { status: 400 }
      );
    }

    const type = (file.type ?? "").toLowerCase();
    if (!ALLOWED_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `허용 형식: ${ALLOWED_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop()?.slice(0, 4) || "jpg";
    const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : "jpg";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;

    const supabase = createSupabaseServerClient();
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (error) {
      console.error("[GAEPAN] Storage upload error", error);
      return NextResponse.json(
        { error: error.message || "업로드 실패" },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = urlData?.publicUrl ?? "";

    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
