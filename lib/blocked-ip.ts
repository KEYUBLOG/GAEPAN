import { createSupabaseServerClient } from "@/lib/supabase";

/**
 * IP가 차단 목록에 있는지 조회 (댓글·기소·청원 등 제한용)
 */
export async function isBlockedIp(ip: string): Promise<boolean> {
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
