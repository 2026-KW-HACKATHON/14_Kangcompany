// A-05 가게 등록 (시안 5) → 이후 메뉴 등록 안내
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { auth, stores } from '../../api'
import { paths } from '../../app/paths'
import { useSessionContext } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { FrameLoading, Page } from '../../components/layout'
import { Button, Dock, Field, Input, Intro } from '../../components/ui'
import { StoreForm } from './StoreForm'
import { RoleSwitch } from './RoleSwitch'

export default function OnboardingStore() {
  const { loading, me, store, refresh } = useSessionContext()
  const nav = useNavigate()
  const act = useAction()
  const [valid, setValid] = useState(false)
  const [owner, setOwner] = useState<string | null>(null)
  if (loading) return <FrameLoading />
  if (!me) return <Navigate to={paths.start} replace />
  if (me.role !== 'owner' || store) return <Navigate to={paths.ownerHome} replace />
  // 시안 5 대표자명. 소셜 로그인 계정은 이름이 비어 있을 수 있다
  const ownerName = owner ?? (me.display_name === '이름 없음' ? '' : me.display_name)
  return (
    <Page title="가게 등록" back={false} role="owner"
      dock={<Dock>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" type="submit" form="store-form" busy={act.busy} disabled={!valid || !ownerName.trim()}>가게 등록하기</Button></Dock>}>
      <Intro title="우리 가게를 소개해요." sub="단체 손님이 방문 전 확인할 정보예요. 사진은 등록 후 가게 정보에서 올릴 수 있어요." art="store" />
      <Field label="대표자명"><Input value={ownerName} onChange={(e) => setOwner(e.target.value)} maxLength={20} required /></Field>
      <StoreForm onValid={setValid} onSubmit={(input) => void act.run(async () => {
        if (!ownerName.trim()) return
        if (ownerName.trim() !== me.display_name) await auth.updateMe(me.id, { display_name: ownerName.trim() })
        await stores.createStore(me.id, input)
        await refresh()
        nav(paths.ownerMenus, { replace: true }) // 메뉴 등록 안내
      })} />
      <RoleSwitch to="group" />
    </Page>
  )
}
