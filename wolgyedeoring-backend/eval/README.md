# 영수증 정확도 측정용 폴더

1. 실제 영수증 사진을 `receipts/` 에 넣기 (r01.jpg, r02.jpg ...)
2. `ground_truth.example.json` 을 `ground_truth.json` 으로 복사해서 사람이 직접 읽은 정답 입력
3. 백엔드 폴더에서 실행:
   `ANTHROPIC_API_KEY=... node --experimental-strip-types scripts/eval-receipts.ts`
4. 비교 실험: `--no-menu` (메뉴 목록 효과), `--model=다른모델` (모델 비교)

영수증 사진에 카드번호·승인번호가 보이면 가리고 넣기. 이 폴더의 사진은 저장소에 커밋하지 않기.
