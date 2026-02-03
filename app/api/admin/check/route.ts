import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("operator_session");

    return NextResponse.json({ loggedIn: session?.value === "authenticated" });
  } catch (e) {
    return NextResponse.json({ loggedIn: false });
  }
}
