import crypto from "crypto";

/**
 * 삭제 비밀번호 등 단방향 해시 (저장·비교용).
 * 보안 강화가 필요하면 솔트·argon2 등으로 교체 가능.
 */
export function hashPassword(pw: string): string {
  return crypto.createHash("sha256").update(pw).digest("hex");
}
