# 좌석 배치도 명세의 검토 근거

2026-10-07 GitHub에서 읽은 `2026-KW-HACKATHON/14_Kangcompany`의 `feat/seat-layout` 브랜치, 커밋 `f757627bccbee3b8923537f440107ea50781d6d5`를 기준으로 합니다. 확인 당시 좌석 배치도에 해당하는 별도 PR은 발견하지 못했습니다.

- [API 문서](https://github.com/2026-KW-HACKATHON/14_Kangcompany/blob/f757627bccbee3b8923537f440107ea50781d6d5/wolgyedeoring-backend/docs/API.md): 배치 조회, 사진 인식, 게시 함수.
- [009 마이그레이션](https://github.com/2026-KW-HACKATHON/14_Kangcompany/blob/f757627bccbee3b8923537f440107ea50781d6d5/wolgyedeoring-backend/supabase/migrations/009_seat_layout.sql): 게시 가게별 한 행, 권한, 검증, 파생 합계.
- [인식 및 공통 좌표 함수](https://github.com/2026-KW-HACKATHON/14_Kangcompany/blob/f757627bccbee3b8923537f440107ea50781d6d5/wolgyedeoring-backend/supabase/functions/extract-layout/layout.ts): 정규화, 경계 보정, 겹침, 경고, 신뢰도 제거. [로컬 원본 스냅샷](layout.ts).
- [인식 진입점](https://github.com/2026-KW-HACKATHON/14_Kangcompany/blob/f757627bccbee3b8923537f440107ea50781d6d5/wolgyedeoring-backend/supabase/functions/extract-layout/index.ts): 소유권 및 이미지 처리.
- [프론트 API](https://github.com/2026-KW-HACKATHON/14_Kangcompany/blob/f757627bccbee3b8923537f440107ea50781d6d5/wolgyedeoring-frontend/src/api/layouts.ts), [단체 조회](https://github.com/2026-KW-HACKATHON/14_Kangcompany/blob/f757627bccbee3b8923537f440107ea50781d6d5/wolgyedeoring-frontend/src/pages/group/Layouts.tsx), [사장님 편집](https://github.com/2026-KW-HACKATHON/14_Kangcompany/blob/f757627bccbee3b8923537f440107ea50781d6d5/wolgyedeoring-frontend/src/pages/owner/Layout.tsx), [캔버스](https://github.com/2026-KW-HACKATHON/14_Kangcompany/blob/f757627bccbee3b8923537f440107ea50781d6d5/wolgyedeoring-frontend/src/components/seat/LayoutCanvas.tsx): 게시된 가게만 조회, 위쪽 왼쪽 좌표, 시설 종류, 경고 및 편집→바로 게시 흐름.

`../../seating-contract.js`는 이 원본의 LLM 영역 이전 순수 함수 부분을 타입만 제거해 브라우저 전역으로 내보낸 것입니다. 비밀키·네트워크·실제 LLM 코드가 실행 파일에 포함되지 않습니다. 시연 페이지의 데이터와 UI가 이 계약을 따르며 Supabase 서버 호출이나 DB 실행은 하지 않습니다. 이미지 요청은 `store_id,image_base64,media_type,image_width,image_height`, 응답은 `layout,summary,source_type,note`, 게시 요청은 `p_store_id,p_layout,p_source`입니다. 저장 시 신뢰도와 이미지가 제외됩니다.
