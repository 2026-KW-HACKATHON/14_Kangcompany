# 월계더링 컴포넌트 명세 v0.1

| | |
|---|---|
| 작성 | FE 이원우 · 2026-10-04 |
| 토큰 | [`tokens.css`](tokens.css) — 여기 적힌 `--*` 이름은 모두 이 파일에 있다 |
| 근거 | [페르소나 5장 디자인 기준](../personas.md#5-디자인-기준-설계-제안), [상태 정의도](../ia/state-definitions.md) |

> **이 문서가 정하는 것**: 컴포넌트 종류, 상태(기본·눌림·비활성·오류 등), 그 상태에 쓰는 토큰, 지켜야 할 최소값(크기·대비).
> **정하지 않는 것**: 모서리 모양·그림자 유무·밀도·레이아웃 같은 **스타일 방향**. 그건 UI 초안(4~5개)에서 자유롭게 제안한다. 단, 아래 ⛔ 표시는 어떤 초안에서도 지킨다.

---

## 공통 규칙 ⛔

| 규칙 | 값 |
|---|---|
| 탭 영역 | 모든 누를 수 있는 요소 **최소 48px** (`--touch-target-min`) |
| 글자 | 본문 17px(`--text-body1-size`), 핵심 정보(시간·인원·금액·상태)는 본문보다 크거나 굵게 |
| 큰 글씨 모드 | `<html data-font-size="large">` 에서 깨지지 않을 것. 높이는 `height` 대신 `min-height` |
| 대비 | 글자 4.5:1, 입력칸 테두리·아이콘 3:1 — 토큰 조합 그대로 쓰면 통과한다 |
| 브랜드 채움 버튼 | **화면당 1개** |
| 색만으로 구분 금지 | 상태·오류는 색 + 글자(또는 아이콘)로 |
| 포커스 | 키보드 포커스에 `--color-focus-ring` 2px 외곽선 |
| 모션 | `--duration-*` + `--ease-*` 만. 눌림은 `scale(var(--press-scale))` |

---

## 1. 버튼

| 종류 | 용도 | 높이 | 배경 / 글자 / 테두리 |
|---|---|---|---|
| **Primary** | 화면의 가장 중요한 행동 1개 (요청 보내기, 결제하기, 수락하기) | 56 (`--control-height-lg`), 하단 고정 | `--color-brand` / `--color-text-on-brand` / 없음 |
| **Secondary** | 나머지 행동 (회원가입, 나중에) | 48 (`--control-height-md`) | `--color-surface` / `--color-text-primary` / `--color-border-strong` |
| **Text** | 보조 링크 (비밀번호 찾기, 더보기) | 48 탭 영역 | 없음 / `--color-brand-text` / 없음 |
| **Danger text** | 취소·삭제 (반드시 확인 단계) | 48 탭 영역 | 없음 / `--tone-danger-fg` / 없음 |

| 상태 | Primary | Secondary |
|---|---|---|
| 기본 | `--color-brand` | 위 표 |
| hover (PC) | `--color-brand-hover` | 테두리 `--color-text-secondary` |
| 눌림 | `--color-brand-pressed` + `scale(--press-scale)` | 배경 `--color-bg-subtle` |
| 비활성 | 배경 `--color-bg-subtle`, 글자 `--color-text-disabled`, 이유를 버튼 위 한 줄로 안내 ("인원을 입력해 주세요") | 글자 `--color-text-disabled`, 테두리 `--color-border` |
| 로딩 | 글자 자리에 스피너 + "보내는 중", 다시 누르기 막기 | 같음 |

- ⛔ **수락 / 거절처럼 반대되는 행동을 바로 붙여 두지 않는다.** 거절은 Secondary 또는 Text로, 간격 16px 이상 (페르소나: 박정호 오조작).
- 버튼 글자는 동사로: "수락하기", "결제하기" (O) / "확인" (X — 무엇을 확인하는지 모름).

## 2. 입력칸

| 종류 | 화면 예 | 비고 |
|---|---|---|
| 텍스트 | 이메일, 가게 이름 | |
| 숫자 스테퍼 | 예상 인원 (G-02) | − / + 버튼 각 44px 이상, 직접 입력도 가능 |
| 날짜·시간 | 희망 일시 | 네이티브 피커 사용 |
| 선택 칩 | 행사 종류, 1인 예산 | 3장 참고 |
| 여러 줄 | 요청 메모 | 최소 3줄 |

| 상태 | 테두리 | 그 외 |
|---|---|---|
| 기본 | 1px `--color-border-strong` | 배경 `--color-surface`, 높이 48 이상 |
| 포커스 | `--color-brand` + 3px `--color-brand-subtle` 외곽 | |
| 입력됨 | 기본과 같음 | |
| 오류 | `--tone-danger-fg` | 아래에 오류 문구 `--tone-danger-fg` + ⚠ 아이콘. **무엇을 어떻게 고칠지** ("인원은 1~200명이에요") |
| 비활성 | `--color-border` | 배경 `--color-bg-subtle`, 글자 `--color-text-disabled` |

- 라벨은 **항상 입력칸 위에** 보이게 (placeholder로 라벨 대신하지 않기). 라벨 `--text-body2-size` 600 `--color-text-secondary`.
- 도움말은 입력칸 아래 `--text-caption-size` `--color-text-tertiary`.

## 3. 선택 칩

| 상태 | 배경 | 글자 | 테두리 |
|---|---|---|---|
| 기본 | `--color-surface` | `--color-text-primary` | `--color-border-strong` |
| 선택됨 | `--color-brand-subtle` | `--color-brand-text` 600 | `--color-brand` |
| 비활성 | `--color-bg-subtle` | `--color-text-disabled` | `--color-border` |

- 높이 40 이상 + 칩 사이 8px → 실제 탭 영역 48 확보.
- 칩 안 작은 태그("지난번")는 보조 강조: `--color-accent-subtle` / `--color-accent-text`.

## 4. 상태 배지

[상태 정의도](../ia/state-definitions.md)의 라벨과 톤을 **그대로** 쓴다. 배지 = `--tone-{톤}-bg` + `--tone-{톤}-fg`, `--radius-full`, `--text-caption-size` 600.

| 톤 | 쓰는 상태 (라벨) |
|---|---|
| `neutral` | 응답 대기 |
| `warning` | **결제 대기**, 확인 필요 (영수증) |
| `success` | 가게 확정, 확정, 완료 |
| `danger` | 노쇼, 인식 실패 |
| `muted` | 만료, 취소됨, 마감 |

- ⛔ "가게 확정(수락)"과 "확정(결제 완료)"을 같은 모양으로만 두지 않는다. 결제 대기 단계에서는 **warning 배지 + "예약금을 결제해야 확정돼요"** 한 줄을 함께 보여준다 (페르소나: 수락을 방문 확정으로 오해).

## 5. 예약 카드 (목록·홈)

정보 순서 ⛔ (페르소나 5장): **날짜·시간 → 인원 → 예산/금액 → 상태 → 다음 행동**

```
[결제 대기]                               ← 배지 (warning)
10/14(화) 19:00 · 32명                    ← title2, 주 텍스트 (핵심)
고기굽는집 · 1인 1.5만 원                  ← body2, 보조 텍스트
예약금을 결제해야 확정돼요  [결제하기 >]     ← body2 + Text 버튼 (다음 행동)
```

| 상태 | 표현 |
|---|---|
| 기본 | 배경 `--color-surface`, 1px `--color-border`, `--radius-md`, 안쪽 여백 16 |
| 눌림 | 배경 `--color-bg-subtle` |
| 행동 필요 | 왼쪽 4px 막대 또는 배지로 강조 (초안에서 선택) — 색만으로 구분하지 않기 |

- 금액은 **'예상 총액' / '예약금' / '실제 결제액'** 이름을 붙여 구분한다. 숫자에 `font-variant-numeric: tabular-nums`.

## 6. 바텀시트

| 항목 | 값 |
|---|---|
| 배경 | `--color-surface-raised`, 위쪽 `--radius-lg`, `--shadow-raised` |
| 딤 | `--color-overlay` |
| 등장 | 아래에서 `--duration-base` `--ease-decelerate` |
| 닫기 | 손잡이 + 닫기 버튼(48) + 딤 탭. 입력 중이면 닫기 전 확인 |
| 쓰는 곳 | 취소 확인, 날짜 선택, 필터 |

- ⛔ 되돌릴 수 없는 행동(예약 취소)은 시트 안에서 **무엇이 일어나는지 한 줄**("예약금 15,000원이 환불돼요") + Danger 버튼.

## 7. 하단 탭 ⏸ [#8](https://github.com/2026-KW-HACKATHON/14_Kangcompany/issues/8)

탭 구성은 #8 결정 대기. 현재 제안은 [IA](../ia/IA.md) 3장. 모양 규칙만 먼저 정한다.

| 항목 | 값 |
|---|---|
| 높이 | `--bottom-nav-height` (64) + 안전 영역 |
| 탭 | 아이콘 + **글자 항상 표시** (아이콘만 두지 않기), 4개 이하 |
| 선택됨 | 아이콘·글자 `--color-brand-text` 600 |
| 기본 | `--color-text-tertiary` |
| 알림 점 | `--tone-danger-fg` 점 + 스크린리더용 "새 알림 n개" |

## 8. 그 밖의 패턴

| 패턴 | 규칙 |
|---|---|
| 안내 박스 (callout) | `--color-accent-subtle` 배경 + 아이콘 + 한두 문장. 예: "가장 먼저 수락한 가게로 예약이 잡혀요" |
| 토스트 | `--color-inverse-bg` / `--color-inverse-fg`, 아래쪽, 3초. 되돌리기가 있으면 Text 버튼 |
| 빈 상태 | 아이콘 + 한 문장 + 다음 행동 버튼. 문구는 [페르소나 문구 예시](../personas.md#화면-문구-예시) |
| 불러오는 중 | 스켈레톤(회색 막대), 1초 이상이면 |
| 오류 화면 | 무엇이 안 됐는지 + 다시 시도 버튼 |
| 카운트다운 | 응답 기한 "N시간 남음" — 1시간 이하면 warning 톤 |
