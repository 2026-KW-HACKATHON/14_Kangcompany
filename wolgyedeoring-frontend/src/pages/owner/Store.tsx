// S-14 가게 정보 (시안 27): 정보 수정 · 대표 사진 · 좌석 배치도 · 로그아웃
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { paths } from '../../app/paths'
import { auth, stores } from '../../api'
import { useOwnerSession } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Art } from '../../components/icons'
import { Button, Dock, LinkRow } from '../../components/ui'
import { StoreForm, storeFormValid } from '../auth/StoreForm'

export default function OwnerStore() {
  const { store, refresh } = useOwnerSession()
  const [saved, setSaved] = useState(false)
  const [valid, setValid] = useState(storeFormValid({ name: store.name, phone: store.phone ?? '', max_capacity: String(store.max_capacity) }))
  const act = useAction()
  const photo = useAction()
  const nav = useNavigate()
  return (
    <Page title="가게 정보" back={false} nav
      dock={<Dock meta={saved ? '저장했어요.' : undefined}>{(act.error || photo.error) && <p className="note-error" role="alert">{act.error ?? photo.error}</p>}<Button variant="primary" type="submit" form="store-form" busy={act.busy} disabled={!valid}>변경 내용 저장</Button></Dock>}>
      <div className="photo-preview"><Art name="store" /><div><h2>{store.name}</h2><p className="meta">{store.intro ?? '단체가 함께하기 좋은 동네 가게'}</p></div></div>
      <StoreForm key={store.photo_url ?? ''} initial={store} photoBusy={photo.busy} onValid={(v) => { setValid(v); setSaved(false) }}
        onSubmit={(input) => void act.run(async () => { await stores.updateStore(store.id, input); await refresh(); setSaved(true) })}
        onPhoto={(file) => void photo.run(async () => { await stores.uploadStorePhoto(store.id, file); await refresh() })} />
      <div className="link-list">
        <LinkRow title="좌석 배치도 관리" sub="가게의 테이블과 시설 배치를 게시해요" art="store" onClick={() => nav(paths.ownerLayout)} />
        <LinkRow title="빈 날짜 관리" sub="한산한 시간에 단체 손님을 만나세요" art="calendar" onClick={() => nav(paths.ownerSlots)} />
      </div>
      <Button variant="danger" full onClick={() => void auth.signOut()}>로그아웃</Button>
    </Page>
  )
}
