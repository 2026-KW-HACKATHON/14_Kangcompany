// A-05 가게 정보 등록 → 이후 메뉴 등록 안내
import { Navigate, useNavigate } from 'react-router-dom'
import { stores } from '../../api'
import { paths } from '../../app/paths'
import { useSessionContext } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { Page } from '../../components/layout'
import { Loading } from '../../components/ui'
import { StoreForm } from './StoreForm'

export default function OnboardingStore() {
  const { loading, me, store, refresh } = useSessionContext()
  const nav = useNavigate()
  const act = useAction()
  if (loading) return <Loading />
  if (!me) return <Navigate to={paths.start} replace />
  if (me.role !== 'owner' || store) return <Navigate to={paths.ownerHome} replace />
  return (
    <Page title="가게 정보">
      <p className="muted">사진은 등록 후 가게 정보(⚙)에서 올릴 수 있어요.</p>
      <StoreForm submitLabel="가게 등록하기" busy={act.busy} error={act.error}
        onSubmit={(input) => void act.run(async () => {
          await stores.createStore(me.id, input)
          await refresh()
          nav(paths.ownerMenus, { replace: true }) // 메뉴 등록 안내
        })} />
    </Page>
  )
}
