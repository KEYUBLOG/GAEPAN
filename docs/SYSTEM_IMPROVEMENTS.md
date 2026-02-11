# 시스템적 개선 제안

보안이 아닌 **아키텍처·유지보수·안정성** 관점에서의 개선 후보 정리.

---

## 적용 완료

### 공통 유틸 통합
- **lib/request-utils.ts**: `getIp`, `isRlsError` — API 라우트에서 중복 제거
- **lib/password.ts**: `hashPassword` — 삭제 비밀번호 해시 일원화
- **lib/blocked-ip.ts**: `isBlockedIp` — 차단 IP 조회 로직 일원화
- Judge, Reports, Comments, Posts, Petitions, Me/Liked 등에서 위 유틸 사용하도록 교체

---

## 추천 개선 (우선순위) — 적용 완료

### 1. API 응답 형식 통일 ✅
- **lib/api-response.ts**: `jsonSuccess`, `jsonError` 추가. Judge, Admin/Login, Reports, Upload에서 `{ ok, error? }` 형식 사용.

### 2. Judge API — Gemini 재시도 ✅
- `callGemini()`: 최대 2회 재시도(총 3회), 1.5초 간격.

<!-- (원문: Judge API 재시도 제안) -->
- `callGemini()` 내부에서 네트워크/5xx 등 일시 오류 시 1~2회 재시도 후 실패 반환
- 사용자 경험 개선 및 “가끔 실패” 현상 완화

### 3. 환경 변수 검증 ✅
- **lib/env.ts**: `assertSupabaseEnv()`, `assertGeminiEnv()` 추가. Supabase/Gemini 사용 시 검사.

### 4. 메인 페이지 분할 ✅
- **app/components/ScoreboardSection.tsx**: 전광판 UI 분리, `next/dynamic` 로드.

### 5. Supabase 타입 ✅
- **lib/database.types.ts**: `Database` 인터페이스 추가. **lib/supabase.ts**에서 사용.

---

## 선택 개선

| 항목 | 설명 |
|------|------|
| **캐싱** | 글 목록·전광판 수치 등에 `revalidate`(ISR) 또는 짧은 캐시 적용 시 DB 부하 감소 |
| **구조화 로깅** | `console.log` 대신 레벨·키-값 구조로 로깅하면 운영·디버깅 시 검색·분석이 쉬움 |
| **헬스 체크** | `/api/health` 등에서 DB·외부 API 연결 가능 여부만 확인해 배포·모니터링에 활용 |
| **에러 바운더리** | API 라우트 상위에서 공통 try/catch + 로깅 + 동일 형식의 JSON 에러 응답으로 일관성 유지 |

---

## 참고

- **PERFORMANCE.md**: 초기 로딩·실시간 채널·폴링·댓글/조회수 요청 등 속도 관련 개선 방향
- 공통 유틸 사용처: `app/api/**/route.ts` 전반
