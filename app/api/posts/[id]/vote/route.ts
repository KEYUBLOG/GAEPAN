import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing post id" }, { status: 400 });
    }

    let body: { type?: string } = {};
    try {
      body = (await _request.json()) as { type?: string };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const type = body.type;
    if (type !== "guilty" && type !== "not_guilty") {
      return NextResponse.json(
        { error: "Body must include type: 'guilty' or 'not_guilty'" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();
    const { data: row, error: fetchError } = await supabase
      .from("posts")
      .select("guilty, not_guilty")
      .eq("id", id)
      .single();

    if (fetchError || !row) {
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404 }
      );
    }

    const currentGuilty = Number(row.guilty) || 0;
    const currentNotGuilty = Number(row.not_guilty) || 0;

    const updates =
      type === "guilty"
        ? { guilty: currentGuilty + 1 }
        : { not_guilty: currentNotGuilty + 1 };

    const { error: updateError } = await supabase
      .from("posts")
      .update(updates)
      .eq("id", id);

    if (updateError) {
      console.error("VOTE_UPDATE_ERROR:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      guilty: type === "guilty" ? currentGuilty + 1 : currentGuilty,
      not_guilty: type === "not_guilty" ? currentNotGuilty + 1 : currentNotGuilty,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
