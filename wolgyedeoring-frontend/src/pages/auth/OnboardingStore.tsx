// A-05 가게 등록 (시안 5) → 이후 메뉴 등록 안내
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { auth, stores } from '../../api'
import { paths } from '../../app/paths'
import { useSessionContext } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { FrameLoading, Page } from '../../components/layout'
import { Button, Dock, Field, Input, Intro, UploadBox } from '../../components/ui'
import { StoreForm } from './StoreForm'
import { RoleSwitch } from './RoleSwitch'

export default function OnboardingStore() {
  const { loading, me, store, refresh } = useSessionContext()
  const nav = useNavigate()
  const act = useAction()
  const [valid, setValid] = useState(false)
  const [owner, setOwner] = useState<string | null>(null)
  // 시안 5: 등록 화면에서 대표 사진 고르기 → 가게가 만들어진 뒤 올린다
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!photo) { setPreview(null); return }
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])
  if (loading) return <FrameLoading />
  if (!me) return <Navigate to={paths.start} replace />
  if (me.role !== 'owner' || store) return <Navigate to={paths.ownerHome} replace />
  // 시안 5 대표자명. 소셜 로그인 계정은 이름이 비어 있을 수 있다
  const ownerName = owner ?? (me.display_name === '이름 없음' ? '' : me.display_name)
  return (
    <Page title="가게 등록" back={false} role="owner"
      dock={<Dock>{act.error && <p className="note-error" role="alert">{act.error}</p>}<Button variant="primary" type="submit" form="store-form" busy={act.busy} disabled={!valid || !ownerName.trim()}>가게 등록하기</Button></Dock>}>
      <Intro title="우리 가게를 소개해요." sub="단체 손님이 방문 전 확인할 정보예요." art="store" />
      <StoreForm register onValid={setValid}
        afterName={<Field label="대표자명"><Input value={ownerName} onChange={(e) => setOwner(e.target.value)} maxLength={20} required /></Field>}
        photo={<>
          {preview && <img className="store-photo" src={preview} alt="고른 대표 사진" />}
          <UploadBox art="store" title="대표 사진" help={photo ? '다른 사진을 고르면 바뀌어요. 등록할 때 함께 올라가요.' : '단체석이나 가게 분위기를 보여주세요.'} onFile={setPhoto} />
        </>} onSubmit={(input) => void act.run(async () => {
        if (!ownerName.trim()) return
        if (ownerName.trim() !== me.display_name) await auth.updateMe(me.id, { display_name: ownerName.trim() })
        const created = await stores.createStore(me.id, input)
        // 사진 올리기에 실패해도 가게는 등록됨 → 가게 정보에서 다시 올리도록
        const photoOk = photo ? await stores.uploadStorePhoto(created.id, photo).then(() => true, () => false) : true
        await refresh()
        nav(photoOk ? paths.ownerMenus : paths.ownerStore, { replace: true }) // 메뉴 등록 안내
      })} />
      <RoleSwitch to="group" />
    </Page>
  )
}
