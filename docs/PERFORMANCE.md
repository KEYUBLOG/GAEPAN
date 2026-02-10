# 사이트 속도 / 로딩 지연 원인 정리

**적용된 개선 (요약)**  
- 전광판: 오늘/어제/누적 한 번에 조회, 채널·폴링 1개로 통합  
- 초기 로딩: 비필수 요청 지연(admin check, vote_events, votes 1.2초 후 / blocked-keywords 0.6초 후)  
- 댓글 수·조회수: 400ms 디바운스 + Promise.all로 한 번에 2개 API 호출  
- 코드 분할: CoupangBanner, CoupangLinkBanner dynamic import (초기 번들 축소)

---

## 왜 느려 보이는가?

### 1. **동시에 나가는 요청이 많음 (초기 로딩)**

메인 페이지(`app/page.tsx`)가 열릴 때 **짧은 시간 안에** 아래처럼 여러 요청이 나갑니다.

| 구분 | 내용 |
|------|------|
| Supabase | 최근 글 3개 쿼리 (top 1개 + list 100개 + blocked_ips) |
| Supabase | 오늘 확정 사건 수 |
| Supabase | 어제 확정 사건 수 |
| Supabase | 누적 확정 사건 수 |
| Supabase | Auth `getUser()` |
| Supabase | vote_events 초기 30개 + votes 초기 50개 |
| API | `/api/admin/check` (운영자 로그인 여부) |
| API | `/api/blocked-keywords` (차단 키워드) |

그 위에 `?post=xxx`가 있으면 해당 글 1건 조회가 하나 더 붙습니다.  
→ **한꺼번에 10개 가까운 요청**이 나가서, 네트워크/서버가 조금만 느려도 “로딩이 걸린다”고 느껴질 수 있습니다.

---

### 2. **실시간 구독(채널)이 많음**

Supabase Realtime 채널이 **6~7개** 열립니다.

- `today-confirmed-realtime` (posts INSERT/UPDATE)
- `yesterday-confirmed-realtime` (posts INSERT/UPDATE)
- `cumulative-stats-realtime` (posts INSERT/UPDATE)
- `posts-realtime` (posts INSERT)
- `vote_events-live` (vote_events INSERT)
- `votes-live-court-log` (votes INSERT)
- `comments-live-court-log` (comments INSERT)

채널마다 이벤트를 받을 때마다 상태가 바뀌고, 그때마다 리렌더가 일어납니다.  
연결/구독 개수가 많을수록 초기 연결 비용과 이후 부담이 커집니다.

---

### 3. **30초 폴링이 3개**

- 오늘 확정 사건
- 어제 확정 사건  
- 누적 확정 사건  

각각 `setInterval(..., 30_000)`으로 30초마다 다시 조회합니다.  
같은 `posts` 테이블을 세 번 따로 조회하는 구조라, 조금만 트래픽이 있어도 DB/네트워크에 반복 부하가 걸립니다.

---

### 4. **댓글 수 / 조회수 API가 자주 호출됨**

- `visiblePostIdsForCommentCount`가 바뀔 때마다  
  - `/api/posts/comment-counts?ids=...`  
  - `/api/posts/view-counts?ids=...`  
  두 개가 연달아 호출됩니다.
- 탭 전환(진행 중/확정), 정렬, 필터 등으로 보이는 글 목록이 바뀔 때마다 dependency가 바뀌어서 다시 호출될 수 있습니다.

---

### 5. **한 페이지에 로직이 몰려 있음**

- `app/page.tsx`가 **4700줄 이상**이고, `useEffect`가 **25개 이상**입니다.
- 모달, 실시간 재판소, 전광판, 명예의 전당, 댓글, 기소 폼 등이 **한 컴포넌트**에 있어서:
  - JS 번들이 커지고
  - 어떤 상태가 바뀌어도 이 큰 트리가 함께 리렌더될 수 있습니다.

---

## 개선 방향 (요약)

1. **전광판 수치 한 번에 가져오기**  
   오늘/어제/누적을 하나의 API 또는 하나의 Supabase 쿼리로 묶고, 실시간은 하나의 채널만 쓰거나, 폴링을 하나로 합치기.

2. **실시간 채널 줄이기**  
   posts 변경은 하나의 채널로만 받고, 그 이벤트에서 오늘/어제/누적을 모두 다시 계산하거나, 한 번만 조회해서 상태를 갱신하기.

3. **초기 로딩 순서 정하기**  
   꼭 필요한 것(글 목록, 전광판 기본 수치) 먼저 보여 주고,  
   vote_events / votes / blocked-keywords / admin check 등은 약간 지연 로드하거나, 한꺼번에 덜 나가게 하기.

4. **댓글 수·조회수 요청 줄이기**  
   `visiblePostIdsForCommentCount` 변경을 디바운스하거나, 탭/필터 변경 시에만 묶어서 한 번만 호출하도록 하기.

5. **코드 분할**  
   - 적용: CoupangBanner, CoupangLinkBanner를 `next/dynamic`으로 로드해 초기 번들에서 제외.  
   - 추후: 기소 모달, 판결문 상세 모달, 실시간 재판소 섹션을 별도 컴포넌트로 나누고 `dynamic(..., { loading: () => ... })` 로 필요한 순간에만 로드하면 첫 화면 JS를 더 줄일 수 있습니다.

위 내용을 반영하면 “사이트 속도가 느려지고 로딩이 걸린다”는 현상의 원인을 줄이고, 개선 효과를 기대할 수 있습니다.
