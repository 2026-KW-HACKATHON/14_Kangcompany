// S-10 영수증 업로드 → 인식 결과: 통과 / 확인 필요 → S-11, 실패 → 다시 찍기
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { receipts } from '../../api'
import { paths } from '../../app/paths'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Field } from '../../components/ui'

export default function ReceiptUpload() {
  const reservationId = Number(useParams().id)
  const nav = useNavigate()
  const [failed, setFailed] = useState<string | null>(null)
  const act = useAction()
  const onFile = (file: File) => act.run(async () => {
    setFailed(null)
    const b64 = await receipts.resizeImageToBase64(file)
    const r = await receipts.processReceipt(reservationId, b64)
    if (r.status === 'failed') setFailed(r.error ?? '영수증을 읽지 못했어요. 밝은 곳에서 영수증 전체가 보이게 다시 찍어 주세요.')
    else nav(paths.ownerReceipt(r.receipt_id), { replace: true })
  })
  return (
    <Page title="영수증 등록" back={paths.ownerReservation(reservationId)}>
      <p className="muted">사진은 저장하지 않고, 금액과 품목만 기록해요.</p>
      <Field label="영수증 사진">
        <input type="file" accept="image/*" capture="environment" disabled={act.busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = '' }} />
      </Field>
      {act.busy && <p className="muted" role="status">영수증을 읽는 중이에요</p>}
      {(failed || act.error) && <p className="inline-error" role="alert">{failed ?? act.error}</p>}
    </Page>
  )
}
