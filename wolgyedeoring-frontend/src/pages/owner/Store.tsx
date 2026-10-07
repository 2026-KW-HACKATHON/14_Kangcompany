// S-14 가게 정보 수정 · 대표 사진 · 로그아웃
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { paths } from '../../app/paths'
import { auth, stores } from '../../api'
import { useOwnerSession } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Button } from '../../components/ui'
import { StoreForm } from '../auth/StoreForm'

export default function OwnerStore() {
  const { store, refresh } = useOwnerSession()
  const [saved, setSaved] = useState(false)
  const act = useAction()
  const nav = useNavigate()
  return (
    <Page title="가게 정보" back>
      <StoreForm key={store.photo_url ?? ''} initial={store} submitLabel={saved ? '저장했어요' : '저장하기'} busy={act.busy} error={act.error}
        onSubmit={(input) => void act.run(async () => { await stores.updateStore(store.id, input); await refresh(); setSaved(true) })}
        onPhoto={(file) => void act.run(async () => { await stores.uploadStorePhoto(store.id, file); await refresh() })} />
      <Button variant="secondary" onClick={() => nav(paths.ownerLayout)}>좌석 배치도 관리</Button>
      <Button variant="text" onClick={() => void auth.signOut()}>로그아웃</Button>
    </Page>
  )
}
