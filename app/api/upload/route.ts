import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { jsonSuccess, jsonError } from "@/lib/api-response";

export const runtime = "nodejs";

const BUCKET = "evidence";
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(jsonError("파일이 없습니다."), { status: 400 });
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(jsonError("파일 크기는 5MB 이하여야 합니다."), { status: 400 });
    }

    const type = file.type?.toLowerCase() ?? "";
    if (!ALLOWED_TYPES.includes(type)) {
      return NextResponse.json(jsonError("JPG, PNG, GIF, WebP 이미지만 업로드할 수 있습니다."), { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeExt = ["jpeg", "jpg", "png", "gif", "webp"].includes(ext) ? ext : "jpg";
    const path = `evidence/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;

    const bytes = await file.arrayBuffer();
    const supabase = createSupabaseServerClient();

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: type,
        upsert: false,
      });

    if (error) {
      console.error("[GAEPAN] Upload error:", error);
      return NextResponse.json(
        jsonError(error.message || "업로드에 실패했습니다."),
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json(jsonSuccess({ url: urlData.publicUrl }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[GAEPAN] Upload exception:", msg);
    return NextResponse.json(jsonError(msg), { status: 500 });
  }
}
