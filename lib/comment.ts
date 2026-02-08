/**
 * 댓글 작성자 IP 일부만 표시 (배심원/원고 옆 괄호용).
 * - IPv4: 앞 두 옥텟 (예: 111.222.333.444 → 111.222)
 * - IPv6: 앞 두 세그먼트 (예: 2001:db8::1 → 2001:db8)
 * - unknown/빈 값: 빈 문자열 (괄호 안 붙임)
 */
export function maskCommentIp(ip: string | null | undefined): string {
  const s = (ip ?? "").trim();
  if (!s || s.toLowerCase() === "unknown") return "";
  if (s.includes(".")) {
    const parts = s.split(".");
    return parts.slice(0, 2).join(".") || "";
  }
  if (s.includes(":")) {
    const parts = s.split(":");
    return parts.slice(0, 2).join(":") || "";
  }
  return "";
}
