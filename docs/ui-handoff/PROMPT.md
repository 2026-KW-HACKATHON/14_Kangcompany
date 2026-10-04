# 바이브코딩용 프롬프트

AI 코딩 도구(Claude Code 등)에 **저장소 루트에서** 그대로 붙여 넣으세요. `[ ]` 부분만 바꾸면 됩니다.
도구가 파일을 직접 읽을 수 있어야 해요 (저장소를 연 상태).

---

## 2단계: UI 초안 1개 만들기 (초안마다 한 번씩, 총 4~5번)

```text
월계더링(동네 가게 ↔ 단체 예약 웹앱)의 UI 초안을 하나 만들어 줘.

먼저 아래 파일을 읽어:
- docs/ui-handoff/README.md  (2장 "지금 할 일"이 이번 작업 범위)
- docs/ui-handoff/personas.md  (특히 "한눈에 보기", 5장 디자인 기준, 화면 문구 예시, 6장 시연 시나리오)
- docs/ui-handoff/design/design-tokens.md
- docs/ui-handoff/design/components.md
- docs/ui-handoff/design/tokens.css
- docs/ui-handoff/ia/content-inventory.md 의 G-02, G-06, S-03 항목
- docs/ui-handoff/ia/state-definitions.md 의 0장, 1장, 2장
- docs/ui-handoff/design/palette-playground.html 의 로그인·예약 요청 목업 (현재 예시. 그대로 베끼지 말고 개선할 것)

만들 것:
- 파일: docs/ui-handoff/drafts/draft-[a]/index.html (한 파일, 외부 라이브러리 없이 HTML+CSS, 필요하면 약간의 JS)
- <link rel="stylesheet" href="../../design/tokens.css"> 로 토큰을 불러오고, 색·글자 크기·간격·모서리·모션은 tokens.css 의 CSS 변수만 쓴다. 새 색 hex 를 만들지 않는다.
- 페이지 맨 위에 초안 이름과 한 줄 콘셉트.
- 그 아래 375px 폭 폰 프레임 3개를 나란히:
  1) G-02 예약 요청 작성 (단체 김서연) — 행사 종류 칩, 희망 일시, 예상 인원 스테퍼, 1인 예산 칩, 요청 메모, 하단 고정 "요청 보내기"
  2) G-06 예약 상세, "결제 대기" 상태 (단체 김서연) — 고기굽는집이 수락함, 예약금 결제 전. 배지·날짜·인원·예산·예약금·사전 주문 요약·참석 현황·다음 행동(결제하기)
  3) S-03 요청 상세·수락 (사장님 박정호) — 받을 수 있는 조건을 먼저, 예약금 입력, 수락하기(주요) / 거절(떨어뜨려서)
- 예시 데이터: 개강총회, 10/14(화) 18:30, 24명, 1인 2.5만 원, 고기굽는집 (페르소나 6장).

이번 초안의 방향: [예: "고대비 단순형 — 숫자와 버튼을 크게, 한 화면에 정보 4개 이하"]

반드시 지킬 것:
- 본문 17px 이상, 누를 수 있는 요소 48px 이상, 글자 대비 4.5:1 (토큰 조합 그대로 쓰면 통과)
- 정보 순서: 날짜·시간 → 인원 → 예산 → 상태 → 다음 행동
- 브랜드 색으로 채운 버튼은 화면당 1개
- 수락과 거절 버튼을 바로 붙여 두지 않기
- 상태 이름은 상태 정의도 그대로 ("결제 대기", "확정" 등). 가게 수락(결제 대기)과 예약 확정을 헷갈리지 않게 "예약금을 결제해야 확정돼요" 같은 안내를 함께
- 단체가 가게를 고르는 화면·문구는 없음 (가장 먼저 수락한 가게로 바로 정해짐)
- 문구는 짧고 정중하게 ("~해 주세요", "~할 수 있어요")
- <html data-font-size="large"> 일 때도 깨지지 않게 (고정 height 대신 min-height)

다 만들면 이 초안이 다른 초안과 무엇이 다른지 3줄로 요약해 줘.
```

---

## 4단계: 선택된 초안으로 전체 페이지 만들기 (초안 선택 후)

```text
월계더링 프론트엔드를 만든다. 선택된 UI 방향은 docs/ui-handoff/drafts/draft-[x]/index.html 이다.

먼저 읽을 것:
- docs/ui-handoff/README.md
- docs/ui-handoff/ia/IA.md (화면 목록·사이트맵·내비게이션·핵심 흐름)
- docs/ui-handoff/ia/content-inventory.md, docs/ui-handoff/ia/state-definitions.md
- docs/ui-handoff/design/components.md, docs/ui-handoff/design/tokens.css
- docs/ui-handoff/personas.md 의 화면 문구 예시

규칙:
- React + Vite + 순수 CSS. tokens.css 를 src/styles/ 로 복사해 import 하고, 컴포넌트는 components.md 의 상태를 모두 구현한다.
- 화면마다 IA 의 화면 ID 를 파일명이나 주석에 남긴다 (예: G02RequestForm.jsx).
- 모든 목록·상세 화면에 불러오는 중 / 빈 상태 / 오류 상태를 만든다 (콘텐츠 인벤토리 5장).
- 우선순위: [G-02 → G-03 → G-06 → G-09/G-10 → S-02 → S-03 → S-05 → S-10/S-11 → 나머지]

이번에 만들 범위: [화면 ID 나열]
```
