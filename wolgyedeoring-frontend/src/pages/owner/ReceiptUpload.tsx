// S-10 영수증 등록 (시안 28 위쪽): 사진 → 인식 → 확인 화면(S-11). 실패하면 다시 찍기
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { receipts } from '../../api'
import { paths } from '../../app/paths'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Notice, UploadBox } from '../../components/ui'

export default function ReceiptUpload() {
  const reservationId = Number(useParams().id)
  const nav = useNavigate()
  const [failed, setFailed] = useState<string | null>(null)
  const act = useAction()
  const onFile = (file: File) => void act.run(async () => {
    setFailed(null)
    const b64 = await receipts.resizeImageToBase64(file)
    const r = await receipts.processReceipt(reservationId, b64)
    if (r.status === 'failed') setFailed(r.error ?? '영수증을 읽지 못했어요. 밝은 곳에서 영수증 전체가 보이게 다시 찍어 주세요.')
    else nav(paths.ownerReceipt(r.receipt_id), { replace: true })
  })
  return (
    <Page title="영수증 확인" back={paths.ownerReservation(reservationId)}>
      <UploadBox art="receipt" title="영수증 사진" help="영수증 전체가 선명하게 나오도록 찍어주세요." onFile={onFile} disabled={act.busy} />
      {act.busy && <p className="meta" role="status">영수증을 읽는 중이에요 (10초 정도)</p>}
      {(failed || act.error) && <Notice tone="danger">{failed ?? act.error}</Notice>}
      <Notice>확인한 품목과 금액만 소비 분석에 반영돼요. 원본 사진은 보관하지 않아요.</Notice>
    </Page>
  )
}
