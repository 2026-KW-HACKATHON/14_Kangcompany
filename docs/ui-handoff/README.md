# 월계더링 UI 시연 · A2 Soft Booking 4.12.1

현재 승인된 HTML/CSS/JavaScript 시연 코드와 디자인 토큰입니다. 39개 화면의 디자인과 상호작용을 유지한 상태로 공유합니다.

- [바로 보는 공유 시연](https://wolgye-demo.kanghyun2345.chatgpt.site/full-ui/?v=4.12.1)
- [전체 화면 갤러리](full-ui/index.html?v=4.12.1)
- [공통 디자인 토큰](design/design-tokens.md) · [토큰 미리보기](design/tokens-preview.html)
- [실행 방법·시연 범위·검증](full-ui/README.md)
- [좌석 배치도 백엔드 명세 검토 근거](full-ui/reference/seat-layout/README.md)

## 실행

`full-ui/index.html`을 브라우저에서 열면 동작합니다. 로컬 서버를 사용하는 경우 저장소 루트에서 `python -m http.server 8787 --directory docs/ui-handoff`를 실행하고 `http://127.0.0.1:8787/full-ui/index.html?v=4.12.1`로 접속합니다. Node 빌드나 패키지 설치는 필요하지 않습니다.

`design/`, `drafts/assets/`, `drafts/draft-a/`, `full-ui/`의 상대 경로를 유지하세요. 로컬 폰트·아이콘·39개 갤러리 이미지를 포함했습니다.

## 시연 범위

단체·사장님·운영자 화면, 예약 요청·수락·결제 예시, 참석 응답과 명단, 메뉴 관리, 캘린더, 좌석 배치도 조회·편집·게시 흐름을 살펴볼 수 있습니다. 날짜 입력은 한국 시간 기준 오늘 이후를 선택합니다.

로그인, 결제, 사진 인식, 게시 및 데이터 저장은 로컬 예시입니다. 실제 Supabase API 호출이나 서버 연동은 포함하지 않았으며 새로고침하면 시연 상태가 초기화됩니다. 좌석 배치도는 `feat/seat-layout`의 확인된 명세에 맞춘 데이터 구조를 사용합니다.

## 파일 구성

| 폴더 | 내용 |
|---|---|
| `full-ui/` | 현재 39개 화면, 화면 전환과 더미 상태, 썸네일 및 검증 결과 |
| `design/` | 역할별 색상·글꼴·여백·둥근 모서리·누름 상태 토큰과 공통 선택 컨트롤 |
| `drafts/` | 승인된 예약 화면이 사용하는 스타일·스크립트와 로컬 폰트·라이선스 |
| `ia/`, `personas.md`, `PROMPT.md`, `example/` | 저장소에 이미 있던 초기 기획·인계 자료 |

이 PR은 정적 시연 자료를 인계합니다. 실제 React 앱과 백엔드 코드는 변경하지 않습니다.
