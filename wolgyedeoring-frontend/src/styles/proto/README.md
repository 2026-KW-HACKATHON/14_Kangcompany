# 시안 스타일 (docs/ui-handoff/full-ui 4.12.1 이식)

React 화면은 시안과 **같은 클래스·마크업**을 쓰고, 이 폴더의 CSS 로 모양을 맞춘다. 원본은 `docs/ui-handoff/`.

| 파일 | 원본 | 변환 |
|---|---|---|
| app.css, experience.css, hub.css, calendar-selection.css, seating.css | full-ui/ 같은 이름 | `.phone` → `.app:where(:not(.a2))` (승인 A2 화면에는 적용 안 함, 우선순위는 원본과 같음) |
| controls.css, segmented-controls.css, components-emphasis.css, components-icons-navigation.css | full-ui/, design/ | `.phone` → `.app` (모든 화면) |
| a2.css | full-ui/approved-a2.html `<style>` + drafts/draft-a/soft-booking.css + full-ui/approved-polish.css | `.phone` → `.app:where(.a2)`, 그 외 선택자 앞에 `:where(.app.a2)`, `.draft-a` 규칙만 남김 |

- 승인 A2 화면(예약 요청 G-02, 예약 상세 G-06, 받은 요청 S-03)은 `<Page a2>` 로 `.app.a2` 범위를 켠다.
- 실제 기기 화면 크기·안전 영역·기본 입력 보조는 `../shell.css` (시안 CSS 다음에 불러옴).
- 토큰은 `docs/ui-handoff/design/tokens.css` 를 그대로 불러온다 (main.tsx).

## 시안에 있지만 이식하지 않은 것 (백엔드에 해당 기능 없음)
- 26 추천 메뉴 구성 (DB 에 추천 구성 테이블 없음)
- 31 운영자 홈 (운영자 역할 없음. 32 미충족 수요는 사장님 분석 → 미충족 수요로 연결)
- 로그인 화면의 카카오·네이버 로그인 버튼 (소셜 로그인 미연결)
- 가게 등록의 상세주소·영업시간·사업자번호, 빈자리의 최소 인원·1인 금액·안내 문구, 날짜별 개별 조건 (DB 컬럼 없음)
- 결제 방법 선택은 표시만 (실제 수단 선택은 토스 결제창)
- 날짜·시간 휠 선택기 → 기기 기본 날짜·시간 선택기로 대체 (모양은 시안 버튼)
