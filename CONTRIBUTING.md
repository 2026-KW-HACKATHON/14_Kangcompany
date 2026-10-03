# 협업 규칙

해커톤 기간(~10/9 최종발표) 동안 4명이 같은 저장소를 쓰기 위한 최소 규칙.
**애매하면 이 문서를 따르고, 규칙을 바꾸고 싶으면 PR로 이 문서를 고친다.**

---

## 1. 브랜치 전략 (GitHub Flow)

```
main ──●────────●──────────●───── (항상 시연 가능한 상태)
        \      /  \        /
         feat/fe-login    fix/be-deposit-refund
```

- `main` 은 **항상 동작하는 상태**를 유지한다. `main` 에 직접 push 하지 않는다.
  - GitHub 브랜치 보호가 켜져 있어 **PR 없이는 `main` 에 push 할 수 없다** (force push, 브랜치 삭제도 차단).
- 작업은 `main` 에서 브랜치를 따서 하고, PR로 합친다.
- 브랜치는 **짧게** 유지한다 (하루~이틀 안에 머지). 오래 걸리면 쪼갠다.
- 작업 시작 전 `git pull origin main`, PR 올리기 전에도 한 번 더 최신화한다.

### 브랜치 이름

```
<타입>/<영역>-<짧은-설명>
```

| 예시 | 의미 |
|---|---|
| `feat/fe-login` | 프런트 로그인 화면 |
| `feat/be-recommend-menu` | 백엔드 추천 메뉴 |
| `fix/fe-payment-redirect` | 프런트 결제 후 이동 버그 |
| `design/tokens` | 디자인 토큰 |
| `docs/api-first-accept` | API 문서 최신화 |

- 영어 소문자 + 하이픈. 이슈가 있으면 끝에 번호: `feat/fe-preorder-12`
- 타입은 아래 커밋 타입과 동일, 영역은 `fe` `be` `design` `docs` 중 하나 (해당 없으면 생략)

---

## 2. 커밋 메시지 (Conventional Commits)

```
<타입>(<영역>): <무엇을 했는지 한글로, 50자 이내>

<필요하면 본문: 왜 바꿨는지, 무엇이 달라지는지>

Refs #이슈번호
```

예시
```
feat(fe): 예약 요청 작성 화면 추가
fix(be): 응답 기한 지난 요청도 수락되던 문제 수정
docs: API.md 선착순 확정 흐름 반영
design: 컬러·타이포 토큰 1차 확정
```

| 타입 | 언제 |
|---|---|
| `feat` | 새 기능, 새 화면 |
| `fix` | 버그 수정 |
| `design` | 디자인 토큰, 스타일, UI 다듬기 (동작 변화 없음) |
| `refactor` | 동작은 같고 코드 구조만 변경 |
| `docs` | 문서 (README, API.md, 기획 문서) |
| `test` | 테스트 추가·수정 |
| `chore` | 설정, 패키지, 빌드, 기타 잡일 |

- 한 커밋에는 한 가지 변경만. "로그인 + 결제 수정"처럼 섞이면 나눈다.
- 제목 끝에 마침표를 찍지 않는다.
- 이슈와 연결: 본문에 `Refs #3` (관련), `Closes #3` (PR 머지 시 이슈 자동 종료)
- 커밋 템플릿 적용 (선택): 저장소 루트에서 `git config commit.template .gitmessage`

---

## 3. Pull Request

- 제목은 커밋 메시지 규칙과 동일: `feat(fe): 예약 요청 작성 화면 추가`
- 본문은 PR 템플릿을 채운다. **화면 변경은 스크린샷 필수.**
- 리뷰어 1명 이상 지정. 리뷰어가 2시간 안에 응답이 없으면 팀 채팅에 알리고 본인이 머지해도 된다 (해커톤 속도 우선). *(임시 규칙 — 팀 확인 전)*
- 머지 방식: **Squash and merge** (main 기록을 PR 단위로 깔끔하게)
- 머지 후 브랜치 삭제.
- 충돌은 PR 올린 사람이 해결한다.

---

## 4. 이슈

| 템플릿 | 언제 | 라벨 |
|---|---|---|
| 결정 필요 (TBD) | 팀 회의로 정해야 하는 기획·정책 | `TBD` + `기획`/`정책`/`UX` |
| 작업 | 구현할 기능·화면 | `FE` / `BE` + `enhancement` |
| 버그 | 동작이 이상할 때 | `bug` |

- **결정 필요 이슈는 결정이 나면 결과를 댓글로 남기고 닫는다.** 결정 내용이 명세에 반영되어야 하면 기획 문서 수정까지 확인 후 닫는다.
- 담당자(Assignees)를 반드시 지정한다.

### 라벨

| 라벨 | 의미 |
|---|---|
| `TBD` | 팀 결정 필요 |
| `기획` / `정책` / `UX` | 결정 영역 |
| `FE` / `BE` | 작업 영역 |
| `후순위` | 핵심 흐름 이후 검토 |
| `bug` / `enhancement` / `documentation` | GitHub 기본 라벨 |

---

## 5. 폴더 구조

```
/                          README, 이 문서
wolgyedeoring-backend/     Supabase (BE 담당)
  docs/API.md              프런트용 API 문서 — BE 변경 시 함께 수정
wolgyedeoring-frontend/    React + Vite 웹앱 (FE 담당, 생성 예정)
docs/
  planning/                기획 문서 (Manyfast 내보내기: 기능명세서, 유저플로우)
                           이후 IA, 상태 정의, 디자인 토큰 등 FE 산출물도 docs/ 아래에 둔다
```

- 기획 문서는 Manyfast가 원본이다. 수정은 Manyfast에서 하고, 다시 내보내서 `docs/planning/` 파일을 교체한다 (파일명 `<문서명>_<YYYY-MM-DD>.md`).

- **API를 바꾸는 PR은 `docs/API.md` 수정을 같이 포함한다.**

---

## 6. 하지 말 것

- `.env`, API 키, Supabase `service_role` 키 커밋 금지 (`.gitignore` 에 등록됨)
- `main` 에 직접 push, force push 금지
- 남의 브랜치에 말 없이 push 금지
- 영수증·메뉴판 실제 사진 커밋 금지 (`eval/receipts/` 는 무시 처리됨)
