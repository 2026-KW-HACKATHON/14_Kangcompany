// 등록 화면(A-04·A-05) 아래: 다른 역할로 바꾸기. 단체·가게 등록 전까지만 (010 choose_role)
// 소셜 로그인은 가입할 때 역할을 받지 못하므로 여기서 고칠 수 있게 한다
import { useNavigate } from 'react-router-dom'
import { auth } from '../../api'
import { paths } from '../../app/paths'
import { useSessionContext } from '../../app/session'
import { useAction } from '../../hooks/useAsync'
import { Button } from '../../components/ui'
import type { Role } from '../../types/db'

export function RoleSwitch({ to }: { to: Role }) {
  const { refresh } = useSessionContext()
  const nav = useNavigate()
  const act = useAction()
  const go = () => act.run(async () => {
    await auth.chooseRole(to)
    await refresh()
    nav(to === 'owner' ? paths.onboardingStore : paths.onboardingGroup, { replace: true })
  })
  return (
    <>
      <p className="meta" style={{ textAlign: 'center' }}>
        {to === 'owner' ? '가게 사장님이신가요?' : '단체 담당자이신가요?'}{' '}
        <Button variant="text" busy={act.busy} onClick={() => void go()}>{to === 'owner' ? '사장님으로 시작하기' : '단체 담당자로 시작하기'}</Button>
      </p>
      {act.error && <p className="note-error" role="alert">{act.error}</p>}
    </>
  )
}
