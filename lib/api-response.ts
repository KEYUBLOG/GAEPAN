/**
 * API 응답 형식 통일
 * - 성공: { ok: true, ...data }
 * - 실패: { ok: false, error: string }
 */

export function jsonSuccess<T extends Record<string, unknown>>(data?: T) {
  if (data == null) return { ok: true as const };
  return { ok: true as const, ...data };
}

export function jsonError(error: string) {
  return { ok: false as const, error };
}
